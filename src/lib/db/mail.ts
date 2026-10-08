import type { Queryable } from "@/lib/db/pool";
import { isMailAddress } from "@/lib/mail/message";
import type { SmtpConfig } from "@/lib/mail/smtp";
import { openSecret, sealSecret } from "@/lib/mail/vault";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class MailSettingsError extends Error {}

/** What the screen shows of the company's e-mail. The password of the mailbox is never here. */
export type MailInfo = {
  /** `null`: the standard text. */
  subject: string | null;
  body: string | null;
  replyTo: string | null;
  /** Send by itself as soon as the invoice is authorised. */
  autoSend: boolean;
  /** The company's own mailbox, or `null`: then the message leaves by Ávila Ops's. */
  own: { host: string; port: number; username: string; from: string } | null;
};

export const DEFAULT_NFE_SUBJECT = "Nota fiscal nº {numero} - {empresa}";
export const DEFAULT_NFE_BODY =
  "Olá,\n\nSegue a nota fiscal eletrônica nº {numero}, série {serie}, emitida por {empresa} para {cliente}.\n\nChave de acesso: {chave}\n\nO arquivo XML e o DANFE (PDF) estão em anexo.";

/** The words a text may carry, each replaced by the value of the invoice. An unknown word stays as typed. */
export const MAIL_WORDS = ["numero", "serie", "empresa", "cliente", "chave"] as const;
export const fillMailText = (text: string, values: Record<(typeof MAIL_WORDS)[number], string>): string =>
  text.replace(/\{(numero|serie|empresa|cliente|chave)\}/g, (_match, word: (typeof MAIL_WORDS)[number]) => values[word]);

const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const blank = (value: string | null) => (value?.trim() ? value.trim() : null);

export async function loadMailInfo(conn: Queryable): Promise<MailInfo> {
  const { rows } = await conn.query("SELECT nfe_subject, nfe_body, reply_to, auto_send, smtp_host, smtp_port, smtp_username, smtp_from FROM mail_settings");
  const row = rows[0];
  if (!row) return { subject: null, body: null, replyTo: null, autoSend: true, own: null };
  return {
    subject: text(row.nfe_subject),
    body: text(row.nfe_body),
    replyTo: text(row.reply_to),
    autoSend: Boolean(row.auto_send),
    own: row.smtp_host === null ? null : { host: String(row.smtp_host), port: Number(row.smtp_port), username: String(row.smtp_username), from: String(row.smtp_from) },
  };
}

export type MailTexts = { subject: string | null; body: string | null; replyTo: string | null; autoSend: boolean };

/** The text of the message and where the answer goes. Blank takes the text back to the standard one. */
export async function saveMailTexts(input: MailTexts, updatedBy: string, conn: Queryable): Promise<void> {
  const subject = blank(input.subject);
  const body = blank(input.body);
  const replyTo = blank(input.replyTo)?.toLowerCase() ?? null;
  const problems: string[] = [];
  if (subject !== null && (subject.length < 3 || subject.length > 150 || /[\r\n]/.test(subject))) problems.push("Assunto: de 3 a 150 letras, em uma linha.");
  if (body !== null && (body.length < 10 || body.length > 4000)) problems.push("Texto da mensagem: de 10 a 4.000 letras.");
  if (replyTo !== null && !isMailAddress(replyTo)) problems.push("Responder para: informe um e-mail válido.");
  if (problems.length > 0) throw new MailSettingsError(problems.join(" "));
  await conn.query(
    `INSERT INTO mail_settings (nfe_subject, nfe_body, reply_to, auto_send, updated_by) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET nfe_subject = EXCLUDED.nfe_subject, nfe_body = EXCLUDED.nfe_body, reply_to = EXCLUDED.reply_to,
       auto_send = EXCLUDED.auto_send, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [subject, body, replyTo, input.autoSend, updatedBy],
  );
}

export type OwnMailbox = { host: string; port: number; username: string; password: string; from: string };

/** What is wrong with a mailbox as typed, every problem at once. */
export function mailboxProblems(input: OwnMailbox): string[] {
  const problems: string[] = [];
  if (!/^[A-Za-z0-9.-]{3,253}$/.test(input.host.trim())) problems.push("Servidor: o endereço do servidor de saída (ex.: smtp.suaempresa.com.br).");
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) problems.push("Porta: 465 ou 587, na maioria dos provedores.");
  if (input.username.trim() === "" || input.username.trim().length > 254) problems.push("Usuário: o da caixa de e-mail.");
  if (input.password === "" || input.password.length > 500) problems.push("Senha: a da caixa de e-mail.");
  if (!isMailAddress(input.from.trim().toLowerCase())) problems.push("Remetente: o e-mail que aparece para o cliente.");
  return problems;
}

/** Stores the company's mailbox with its password sealed. Another one replaces it. */
export async function saveOwnMailbox(input: OwnMailbox, key: Buffer, updatedBy: string, conn: Queryable): Promise<void> {
  const problems = mailboxProblems(input);
  if (problems.length > 0) throw new MailSettingsError(problems.join(" "));
  const sealed = sealSecret(input.password, key);
  await conn.query(
    `INSERT INTO mail_settings (smtp_host, smtp_port, smtp_username, smtp_password, smtp_iv, smtp_tag, smtp_from, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET smtp_host = EXCLUDED.smtp_host, smtp_port = EXCLUDED.smtp_port, smtp_username = EXCLUDED.smtp_username,
       smtp_password = EXCLUDED.smtp_password, smtp_iv = EXCLUDED.smtp_iv, smtp_tag = EXCLUDED.smtp_tag, smtp_from = EXCLUDED.smtp_from,
       updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [input.host.trim().toLowerCase(), input.port, input.username.trim(), sealed.ciphertext, sealed.iv, sealed.authTag, input.from.trim().toLowerCase(), updatedBy],
  );
}

/** Takes the company's mailbox away: the messages leave by Ávila Ops's again. The texts stay. */
export async function removeOwnMailbox(updatedBy: string, conn: Queryable): Promise<void> {
  await conn.query(
    `UPDATE mail_settings SET smtp_host = NULL, smtp_port = NULL, smtp_username = NULL, smtp_password = NULL, smtp_iv = NULL, smtp_tag = NULL, smtp_from = NULL,
       updated_at = now(), updated_by = $1`,
    [updatedBy],
  );
}

/** By where a message leaves: the mailbox, the address shown and whose it is. */
export type MailChannel = { channel: "empresa" | "avilaops"; smtp: SmtpConfig; from: string };

/** The mailbox of Ávila Ops, from the environment of the server. `null` when it is not set. */
export function defaultMailbox(env: Record<string, string | undefined>): MailChannel | null {
  const host = (env.ERP_SMTP_HOST ?? "").trim();
  const username = (env.ERP_SMTP_USER ?? "").trim();
  const password = env.ERP_SMTP_PASSWORD ?? "";
  const from = (env.ERP_MAIL_FROM ?? "").trim().toLowerCase();
  const port = Number((env.ERP_SMTP_PORT ?? "465").trim());
  if (host === "" || username === "" || password === "" || !isMailAddress(from) || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { channel: "avilaops", smtp: { host, port, username, password }, from };
}

/**
 * The mailbox a message of this company leaves by: its own when it has one,
 * Ávila Ops's otherwise, `null` when there is neither. `key` opens the
 * password of the company's mailbox; it is only asked for when there is one.
 */
export async function mailChannel(conn: Queryable, env: Record<string, string | undefined>, key: () => Buffer): Promise<MailChannel | null> {
  const { rows } = await conn.query("SELECT smtp_host, smtp_port, smtp_username, smtp_password, smtp_iv, smtp_tag, smtp_from FROM mail_settings WHERE smtp_host IS NOT NULL");
  const row = rows[0];
  if (!row) return defaultMailbox(env);
  const password = openSecret({ ciphertext: row.smtp_password as Buffer, iv: row.smtp_iv as Buffer, authTag: row.smtp_tag as Buffer }, key());
  return { channel: "empresa", smtp: { host: String(row.smtp_host), port: Number(row.smtp_port), username: String(row.smtp_username), password }, from: String(row.smtp_from) };
}

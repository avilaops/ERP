import { loadMailInfo, mailChannel } from "@/lib/db/mail";
import { isOptedOut, unsubscribeUrl, withUnsubscribe } from "@/lib/db/optout";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { MAIL_NOT_SET } from "@/lib/db/send-nfe-mail";
import type { MailSender } from "@/lib/db/send-nfe-mail";
import { buildMessage, isMailAddress, MailError } from "@/lib/mail/message";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class MessageError extends Error {}

export type MessageTemplate = { id: number; name: string; subject: string; body: string };

/** The words a message may carry, with what each becomes. */
export const MESSAGE_WORDS = [
  ["contato", "Nome da pessoa de contato (ou da empresa, se não houver)"],
  ["empresa", "Nome da empresa do cliente"],
  ["vendedor", "Nome de quem acompanha a venda"],
  ["minha_empresa", "Nome da sua empresa"],
] as const;
type Word = (typeof MESSAGE_WORDS)[number][0];

/** The text with each word in braces replaced. An unknown word stays as typed. */
export const fillMessage = (text: string, values: Record<Word, string>): string => text.replace(/\{(contato|empresa|vendedor|minha_empresa)\}/g, (_match, word: Word) => values[word]);

export async function listTemplates(conn: Queryable): Promise<MessageTemplate[]> {
  const { rows } = await conn.query("SELECT id, name, subject, body FROM message_templates ORDER BY lower(name), id");
  return rows.map((row) => ({ id: Number(row.id), name: String(row.name), subject: String(row.subject), body: String(row.body) }));
}

function checkedTemplate(input: { name: string; subject: string; body: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const subject = input.subject.trim();
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  const problems: string[] = [];
  if (name.length < 2 || name.length > 60) problems.push("Nome do modelo: de 2 a 60 letras.");
  if (subject.length < 3 || subject.length > 150 || /[\r\n]/.test(subject)) problems.push("Assunto: de 3 a 150 letras, em uma linha.");
  if (body.length < 10 || body.length > 4000) problems.push("Texto: de 10 a 4.000 letras.");
  if (problems.length > 0) throw new MessageError(problems.join(" "));
  return { name, subject, body };
}

/** Creates a template, or changes the one with `id`. */
export async function saveTemplate(id: number | null, input: { name: string; subject: string; body: string }, who: string, conn: Queryable): Promise<void> {
  const data = checkedTemplate(input);
  try {
    const { rows } = id === null
      ? await conn.query("INSERT INTO message_templates (name, subject, body, updated_by) VALUES ($1, $2, $3, $4) RETURNING id", [data.name, data.subject, data.body, who])
      : await conn.query("UPDATE message_templates SET name = $2, subject = $3, body = $4, updated_at = now(), updated_by = $5 WHERE id = $1 RETURNING id", [id, data.name, data.subject, data.body, who]);
    if (rows.length === 0) throw new MessageError("Modelo não encontrado. Recarregue a página.");
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new MessageError("Já existe um modelo com esse nome.");
    throw error;
  }
}

export async function deleteTemplate(id: number, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query("DELETE FROM message_templates WHERE id = $1 RETURNING id", [id]);
    if (rows.length === 0) throw new MessageError("Modelo não encontrado. Recarregue a página.");
  } catch (error) {
    if (pgErrorCode(error) === "23503") throw new MessageError("Este modelo é usado em uma cadência. Tire-o da cadência antes de remover.");
    throw error;
  }
}

export type OpportunityMessage = { id: number; recipient: string; subject: string; body: string; status: "enviado" | "falhou"; detail: string | null; sentBy: string; sentAt: Date };

export async function listOpportunityMessages(opportunityId: number, conn: Queryable): Promise<OpportunityMessage[]> {
  const { rows } = await conn.query("SELECT id, recipient, subject, body, status, detail, sent_by, sent_at FROM opportunity_messages WHERE opportunity_id = $1 ORDER BY id DESC", [opportunityId]);
  return rows.map((row) => ({
    id: Number(row.id), recipient: String(row.recipient), subject: String(row.subject), body: String(row.body), status: row.status as "enviado" | "falhou",
    detail: row.detail === null ? null : String(row.detail), sentBy: String(row.sent_by), sentAt: row.sent_at as Date,
  }));
}

export type MailWay = { env: Record<string, string | undefined>; key: () => Buffer; send: MailSender };

export type OpportunityMail = {
  opportunityId: number;
  /** Whose opportunities the sender reaches; `null` is all. The system (a cadence) sends with `null`. */
  ownerEmail: string | null;
  subject: string;
  body: string;
  company: string;
  sentBy: string;
  now: Date;
  way: MailWay;
  /**
   * For what the system sends by itself (a cadence): the company's name in the
   * addresses and the public address of the ERP. Then the message carries the
   * way out, and who took it gets nothing. What a person writes and sends by
   * hand, one to one, goes without it.
   */
  automatic?: { tenantSlug: string; appUrl: string };
};

/**
 * Sends an e-mail to the contact of an opportunity, from the company's mailbox
 * (or Ávila Ops's), and keeps it with its result. The words in braces are
 * filled here. What is refused before a mail server is reached (no mailbox,
 * no address of the contact) throws and nothing is recorded as sent.
 */
export async function sendOpportunityMail(mail: OpportunityMail, conn: Queryable): Promise<{ status: "enviado" | "falhou"; recipient: string; detail: string | null }> {
  const { rows } = await conn.query(
    `SELECT o.email, o.contact_name, o.owner_name, COALESCE(c.name, o.company) AS party, c.email AS customer_email, c.contact_name AS customer_contact
       FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 AND ($2::text IS NULL OR o.owner_email = $2)`,
    [mail.opportunityId, mail.ownerEmail],
  );
  const target = rows[0];
  if (!target) throw new MessageError("Oportunidade não encontrada. Recarregue a página.");
  const recipient = String(target.email ?? target.customer_email ?? "").trim().toLowerCase();
  if (recipient === "") throw new MessageError("Esta oportunidade não tem e-mail do contato. Preencha em Dados.");
  if (!isMailAddress(recipient)) throw new MessageError("O e-mail do contato é inválido. Corrija em Dados.");
  if (mail.automatic && (await isOptedOut(recipient, conn))) throw new MessageError("Este contato pediu para não receber mais e-mails automáticos.");
  const words = { contato: String(target.contact_name ?? target.customer_contact ?? target.party ?? ""), empresa: String(target.party ?? ""), vendedor: String(target.owner_name), minha_empresa: mail.company };
  const subject = fillMessage(mail.subject.trim(), words);
  const body = fillMessage(mail.body.replace(/\r\n?/g, "\n").trim(), words);
  if (subject.length < 3 || subject.length > 150 || /[\r\n]/.test(subject)) throw new MessageError("Assunto: de 3 a 150 letras, em uma linha.");
  if (body.length < 10 || body.length > 4000) throw new MessageError("Texto: de 10 a 4.000 letras.");
  const channel = await mailChannel(conn, mail.way.env, mail.way.key);
  if (!channel) throw new MailError(MAIL_NOT_SET);
  const { replyTo } = await loadMailInfo(conn);
  const unsubscribe = mail.automatic ? await unsubscribeUrl(recipient, mail.automatic.appUrl, mail.automatic.tenantSlug, conn) : null;
  const text = unsubscribe ? withUnsubscribe(body, mail.company, unsubscribe) : body;
  const message = buildMessage({ from: channel.from, fromName: mail.company, to: recipient, replyTo, subject, text, attachments: [], unsubscribe }, mail.now);
  let status: "enviado" | "falhou" = "enviado";
  let detail: string | null = null;
  try {
    await mail.way.send(channel.smtp, { from: channel.from, to: recipient }, message);
  } catch (error) {
    status = "falhou";
    detail = (error instanceof MailError ? error.message : "Falha inesperada no envio.").slice(0, 300);
    if (!(error instanceof MailError)) console.error("[mensagens] falha inesperada no envio:", error instanceof Error ? error.message : error);
  }
  await conn.query("INSERT INTO opportunity_messages (opportunity_id, recipient, subject, body, status, detail, sent_by) VALUES ($1, $2, $3, $4, $5, $6, $7)", [mail.opportunityId, recipient, subject, body, status, detail, mail.sentBy]);
  if (status === "enviado") await conn.query("UPDATE opportunities SET updated_at = now(), updated_by = $2 WHERE id = $1", [mail.opportunityId, mail.sentBy]);
  return { status, recipient, detail };
}

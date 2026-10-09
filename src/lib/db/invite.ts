import { provisionAccess, provisionConfig, ProvisionError } from "@/lib/auth/provision";
import { loadMailInfo, mailChannel } from "@/lib/db/mail";
import type { Queryable } from "@/lib/db/pool";
import { MAIL_NOT_SET } from "@/lib/db/send-nfe-mail";
import type { MailSender } from "@/lib/db/send-nfe-mail";
import { buildMessage, MailError } from "@/lib/mail/message";

export type InviteStatus = "enviado" | "falhou" | "pendente";
export type InviteResult = { status: InviteStatus; detail: string | null };

export const INVITE_OFF = "O convite por e-mail ainda não está ligado neste servidor. Avise a pessoa você mesmo; ela entra pelo endereço do sistema.";

export type InviteRequest = {
  userId: number;
  company: string;
  /** Public address of the ERP, without the final slash. */
  appUrl: string;
  /** Name of who invites, as the message says it. */
  invitedBy: string;
  now: Date;
  env: Record<string, string | undefined>;
  key: () => Buffer;
  send: MailSender;
  /** How the central login is reached. The tests give a stand-in. */
  fetcher?: Parameters<typeof provisionAccess>[2];
};

/** What the person reads. With `invite`, the account is new and the address sets the password. */
export function inviteText({ name, company, invitedBy, appUrl, invite }: { name: string; company: string; invitedBy: string; appUrl: string; invite: string | null }): string {
  const opening = `Olá, ${name}.\n\n${invitedBy} liberou o seu acesso ao sistema de ${company}.`;
  return invite
    ? `${opening}\n\n1. Crie a sua senha neste endereço (vale por 7 dias e funciona uma vez):\n\n${invite}\n\nAo salvar a senha você já entra no sistema.\n\n2. Nas próximas vezes, entre por este endereço com o seu e-mail e a senha criada:\n\n${appUrl}\n\nSe você não esperava este convite, ignore esta mensagem.`
    : `${opening}\n\nVocê já tem conta no login da Ávila Ops com este e-mail: entre com a senha que já usa.\n\n${appUrl}\n\nSe não lembra a senha, peça a quem lhe convidou para falar com a Ávila Ops.`;
}

/**
 * Invites a person of the company by e-mail: makes sure they have an account
 * in the central login and writes to them with where to set the password (new
 * account) or just where to get in (account they already had). Whatever
 * happens is kept on the person, for the screen; it never throws for a refusal
 * the company can read. The address of the invitation is not stored nor logged.
 */
export async function inviteByMail(request: InviteRequest, conn: Queryable): Promise<InviteResult> {
  const { rows } = await conn.query("SELECT email, name FROM users WHERE id = $1 AND active", [request.userId]);
  const person = rows[0] ? { email: String(rows[0].email), name: String(rows[0].name) } : null;
  let result: InviteResult;
  try {
    if (!person) throw new ProvisionError("Pessoa não encontrada ou sem acesso: marque \"Pode entrar\" antes de convidar.");
    const config = provisionConfig(request.env);
    if (!config) {
      result = { status: "pendente", detail: INVITE_OFF };
    } else {
      const channel = await mailChannel(conn, request.env, request.key);
      if (!channel) throw new MailError(MAIL_NOT_SET);
      const { invite } = await provisionAccess(config, person, request.fetcher);
      const { replyTo } = await loadMailInfo(conn);
      const message = buildMessage(
        {
          from: channel.from, fromName: request.company, to: person.email, replyTo, attachments: [],
          subject: `Seu acesso ao sistema de ${request.company}`,
          text: inviteText({ name: person.name, company: request.company, invitedBy: request.invitedBy, appUrl: request.appUrl, invite }),
        },
        request.now,
      );
      await request.send(channel.smtp, { from: channel.from, to: person.email }, message);
      result = { status: "enviado", detail: invite ? "com o endereço para criar a senha" : "a pessoa já tinha conta no login: entra com a senha que já usa" };
    }
  } catch (error) {
    if (!(error instanceof ProvisionError || error instanceof MailError)) console.error("[convite] falha inesperada:", error instanceof Error ? error.message : error);
    result = { status: "falhou", detail: (error instanceof ProvisionError || error instanceof MailError ? error.message : "Falha inesperada no envio.").slice(0, 300) };
  }
  if (person) await conn.query("UPDATE users SET invite_status = $2, invite_detail = $3, invite_at = $4 WHERE id = $1", [request.userId, result.status, result.detail, request.now]);
  return result;
}

import { inboxChannel, noteInboxReading } from "@/lib/db/mail";
import type { Queryable } from "@/lib/db/pool";
import type { FetchedMail, ImapConfig, InboxMark } from "@/lib/mail/imap";
import { isMailAddress, MailError } from "@/lib/mail/message";
import { parseMail } from "@/lib/mail/parse";

export type InboxMessage = { id: number; sender: string; senderName: string | null; subject: string; body: string; receivedAt: Date };

/** What a contact answered on one opportunity, the newest first. The opportunity was already read within the scope. */
export async function listInbox(opportunityId: number, conn: Queryable): Promise<InboxMessage[]> {
  const { rows } = await conn.query("SELECT id, sender, sender_name, subject, body, received_at FROM opportunity_inbox WHERE opportunity_id = $1 ORDER BY received_at DESC, id DESC", [opportunityId]);
  return rows.map((row) => ({ id: Number(row.id), sender: String(row.sender), senderName: row.sender_name === null ? null : String(row.sender_name), subject: String(row.subject), body: String(row.body), receivedAt: row.received_at as Date }));
}

export type InboxFetcher = (config: ImapConfig, mark: InboxMark, limit: number) => Promise<{ mark: { uidValidity: number; lastUid: number }; messages: FetchedMail[] }>;

/** How many messages one run reads at most. What is beyond waits for the next. */
const PER_RUN = 30;

/**
 * Reads what arrived in the company's mailbox since the last time and keeps,
 * in the opportunity, the messages of who is its contact: the one in progress
 * first, the most recent otherwise. An answer stops the cadence the
 * opportunity was following and leaves the seller the task of replying.
 * Everything else in the mailbox is read and dropped: nothing of it is stored.
 * Automatic answers (out of office, bounces) are dropped too. A failure to
 * read is written down for the screen and tried again in the next run.
 */
export async function receiveMail(now: Date, way: { key: () => Buffer; fetch: InboxFetcher }, conn: Queryable): Promise<{ read: number; kept: number }> {
  const channel = await inboxChannel(conn, way.key);
  if (!channel) return { read: 0, kept: 0 };
  let fetched;
  try {
    fetched = await way.fetch(channel.imap, channel.mark, PER_RUN);
  } catch (error) {
    if (!(error instanceof MailError)) throw error;
    await noteInboxReading({ problem: error.message }, now, conn);
    return { read: 0, kept: 0 };
  }
  let kept = 0;
  for (const { raw, uid } of fetched.messages) {
    const mail = parseMail(raw);
    if (mail.automatic || mail.from === null || !isMailAddress(mail.from)) continue;
    const found = await conn.query(
      `SELECT o.id, o.owner_email FROM opportunities o JOIN pipeline_stages s ON s.id = o.stage_id LEFT JOIN customers c ON c.id = o.customer_id
        WHERE lower(btrim(COALESCE(NULLIF(btrim(o.email), ''), c.email))) = $1 ORDER BY (s.kind = 'aberta') DESC, o.updated_at DESC, o.id DESC LIMIT 1`,
      [mail.from],
    );
    const target = found.rows[0];
    if (!target) continue;
    const subject = (mail.subject || "(sem assunto)").slice(0, 300);
    const stored = await conn.query(
      `INSERT INTO opportunity_inbox (opportunity_id, sender, sender_name, subject, body, received_at, message_id) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (message_id) DO NOTHING RETURNING id`,
      // A message with no id of its own is told apart by the mailbox and its number in it.
      [target.id, mail.from, mail.fromName?.slice(0, 200) ?? null, subject, (mail.text || "(mensagem sem texto)").slice(0, 8000), mail.date ?? now, (mail.messageId ?? `${fetched.mark.uidValidity}.${uid}@caixa`).slice(0, 500)],
    );
    if (stored.rows.length === 0) continue;
    kept += 1;
    await conn.query("UPDATE opportunity_cadences SET status = 'parada', stopped_reason = 'O cliente respondeu.', finished_at = now() WHERE opportunity_id = $1 AND status = 'ativa'", [target.id]);
    await conn.query(
      "INSERT INTO opportunity_activities (opportunity_id, kind, title, due_on, owner_email, created_by) VALUES ($1, 'tarefa', $2, ($3::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date, $4, 'caixa de entrada')",
      [target.id, `Responder o e-mail de ${mail.fromName ?? mail.from}: ${subject}`.slice(0, 300), now, target.owner_email],
    );
    await conn.query("UPDATE opportunities SET updated_at = now(), updated_by = 'caixa de entrada' WHERE id = $1", [target.id]);
  }
  await noteInboxReading({ mark: fetched.mark }, now, conn);
  return { read: fetched.messages.length, kept };
}

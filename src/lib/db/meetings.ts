import { randomUUID } from "node:crypto";
import { buildCalendar } from "@/lib/calendar/ics";
import type { FunnelScope } from "@/lib/db/funnel";
import { loadMailInfo, mailChannel } from "@/lib/db/mail";
import type { MailWay } from "@/lib/db/messages";
import type { Queryable } from "@/lib/db/pool";
import { MAIL_NOT_SET } from "@/lib/db/send-nfe-mail";
import { buildMessage, isMailAddress, MailError } from "@/lib/mail/message";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class MeetingError extends Error {}

export type Meeting = {
  id: number;
  opportunityId: number;
  title: string;
  startsAt: Date;
  /** The day and the hour in São Paulo, as the form shows them: `2026-10-09` and `14:30`. */
  day: string;
  time: string;
  minutes: number;
  link: string | null;
  place: string | null;
  invited: string | null;
  status: "agendada" | "cancelada";
};

export type MeetingInput = { title: string; day: string; time: string; minutes: number; link: string | null; place: string | null; /** Send the invitation to the contact of the opportunity. */ invite: boolean };

const COLUMNS = `m.id, m.opportunity_id, m.title, m.starts_at, to_char(m.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
  to_char(m.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS time, m.minutes, m.link, m.place, m.invited, m.status`;

const toMeeting = (row: Record<string, unknown>): Meeting => ({
  id: Number(row.id), opportunityId: Number(row.opportunity_id), title: String(row.title), startsAt: row.starts_at as Date, day: String(row.day), time: String(row.time), minutes: Number(row.minutes),
  link: row.link === null ? null : String(row.link), place: row.place === null ? null : String(row.place), invited: row.invited === null ? null : String(row.invited), status: row.status as Meeting["status"],
});

/** The meetings of one opportunity, the next ones first. The opportunity was already read within the scope. */
export async function listMeetings(opportunityId: number, conn: Queryable): Promise<Meeting[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM opportunity_meetings m WHERE m.opportunity_id = $1 ORDER BY (m.status = 'cancelada'), m.starts_at, m.id`, [opportunityId]);
  return rows.map(toMeeting);
}

export async function getMeeting(id: number, opportunityId: number, conn: Queryable): Promise<Meeting | null> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM opportunity_meetings m WHERE m.id = $1 AND m.opportunity_id = $2`, [id, opportunityId]);
  return rows[0] ? toMeeting(rows[0]) : null;
}

function checked(input: MeetingInput) {
  const title = input.title.trim().replace(/\s+/g, " ");
  const link = input.link?.trim() || null;
  const place = input.place?.trim().replace(/\s+/g, " ") || null;
  const problems: string[] = [];
  if (title.length < 2 || title.length > 120) problems.push("Assunto da reunião: de 2 a 120 letras.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || Number.isNaN(Date.parse(`${input.day}T12:00:00Z`))) problems.push("Informe o dia.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) problems.push("Informe a hora, como 14:30.");
  if (!Number.isInteger(input.minutes) || input.minutes < 15 || input.minutes > 480) problems.push("Duração: de 15 minutos a 8 horas.");
  if (link !== null && (!/^https:\/\/[^\s]+$/.test(link) || link.length > 500)) problems.push("O endereço da videochamada começa com https:// e não tem espaços.");
  if (place !== null && (place.length < 2 || place.length > 200)) problems.push("Local: de 2 a 200 letras.");
  if (problems.length > 0) throw new MeetingError(problems.join(" "));
  return { title, day: input.day, time: input.time, minutes: input.minutes, link, place };
}

const NOT_FOUND = "Reunião não encontrada. Recarregue a página.";
const OPPORTUNITY_GONE = "Oportunidade não encontrada. Recarregue a página.";
/** `Reunião 14:30: assunto`, as the task of the meeting reads in the funnel. */
const taskTitle = (time: string, title: string) => `Reunião ${time}: ${title}`.slice(0, 300);

type Party = { ownerEmail: string; ownerName: string; contact: string; email: string | null; party: string };

async function partyOf(opportunityId: number, scope: FunnelScope, conn: Queryable): Promise<Party> {
  const { rows } = await conn.query(
    `SELECT o.owner_email, o.owner_name, COALESCE(NULLIF(btrim(o.contact_name), ''), NULLIF(btrim(c.contact_name), ''), c.name, o.company) AS contact,
            COALESCE(NULLIF(btrim(o.email), ''), c.email) AS email, COALESCE(c.name, o.company) AS party
       FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 AND ($2::text IS NULL OR o.owner_email = $2)`,
    [opportunityId, scope.ownerEmail],
  );
  if (!rows[0]) throw new MeetingError(OPPORTUNITY_GONE);
  return { ownerEmail: String(rows[0].owner_email), ownerName: String(rows[0].owner_name), contact: String(rows[0].contact ?? ""), email: rows[0].email === null ? null : String(rows[0].email).trim().toLowerCase(), party: String(rows[0].party ?? "") };
}

export type MeetingMail = { company: string; now: Date; way: MailWay };
/** What became of the invitation: sent, not asked for, or why it did not go. The meeting is kept either way. */
export type InviteResult = { sent: string | null; problem: string | null };

/**
 * The e-mail that puts (or takes) the meeting in the calendar of the contact:
 * a short text and the calendar file. Kept with the messages of the
 * opportunity, with its result. A failure here never undoes the meeting.
 */
async function sendInvite(method: "REQUEST" | "CANCEL", meeting: { id: number; opportunityId: number; uid: string; sequence: number; title: string; startsAt: Date; day: string; time: string; minutes: number; link: string | null; place: string | null }, to: string, party: Party, mail: MeetingMail, who: string, conn: Queryable): Promise<InviteResult> {
  if (!isMailAddress(to)) return { sent: null, problem: "O e-mail do contato é inválido. Corrija em Dados." };
  const organizer = isMailAddress(party.ownerEmail) ? party.ownerEmail : null;
  const channel = await mailChannel(conn, mail.way.env, mail.way.key);
  if (!channel) return { sent: null, problem: MAIL_NOT_SET };
  const { replyTo } = await loadMailInfo(conn);
  const when = `${meeting.day.split("-").reverse().join("/")} às ${meeting.time} (horário de Brasília)`;
  const where = meeting.link ?? meeting.place;
  const subject = `${method === "CANCEL" ? "Cancelada: " : ""}${meeting.title} - ${mail.company}`.slice(0, 150);
  const body = method === "CANCEL"
    ? `Olá, ${party.contact || party.party}.\n\nA reunião "${meeting.title}", de ${when}, foi cancelada.\n\n${party.ownerName}\n${mail.company}`
    : `Olá, ${party.contact || party.party}.\n\nReunião: ${meeting.title}\nQuando: ${when}\nDuração: ${meeting.minutes} minutos${where ? `\n${meeting.link ? "Para entrar" : "Local"}: ${where}` : ""}\n\nO arquivo em anexo coloca a reunião na sua agenda.\n\n${party.ownerName}\n${mail.company}`;
  const calendar = buildCalendar({
    uid: meeting.uid, sequence: meeting.sequence, method, start: meeting.startsAt, minutes: meeting.minutes, summary: `${meeting.title} - ${mail.company}`, description: meeting.link ? `Para entrar: ${meeting.link}` : null,
    location: where, url: meeting.link, organizer: { name: party.ownerName, email: organizer ?? channel.from }, attendee: { name: party.contact || party.party, email: to }, stamp: mail.now,
  });
  let status: "enviado" | "falhou" = "enviado";
  let detail: string | null = null;
  try {
    const message = buildMessage(
      { from: channel.from, fromName: mail.company, to, replyTo: organizer ?? replyTo, subject, text: body, attachments: [{ filename: method === "CANCEL" ? "cancelamento.ics" : "reuniao.ics", contentType: `text/calendar; charset=UTF-8; method=${method}`, content: Buffer.from(calendar, "utf8") }] },
      mail.now,
    );
    await mail.way.send(channel.smtp, { from: channel.from, to }, message);
  } catch (error) {
    status = "falhou";
    detail = (error instanceof MailError ? error.message : "Falha inesperada no envio.").slice(0, 300);
    if (!(error instanceof MailError)) console.error("[reuniões] falha inesperada no convite:", error instanceof Error ? error.message : error);
  }
  await conn.query("INSERT INTO opportunity_messages (opportunity_id, recipient, subject, body, status, detail, sent_by) VALUES ($1, $2, $3, $4, $5, $6, $7)", [meeting.opportunityId, to, subject, body, status, detail, who]);
  return status === "enviado" ? { sent: to, problem: null } : { sent: null, problem: `O convite para ${to} não saiu: ${detail}` };
}

/**
 * Schedules a meeting on an opportunity within reach (`id` null) or changes
 * one: the task that shows it in the funnel follows, and, when asked, the
 * contact gets the invitation by e-mail. A change of a meeting already sent
 * goes to the same person as a new version of the same event.
 */
export async function saveMeeting(id: number | null, opportunityId: number, input: MeetingInput, who: string, scope: FunnelScope, mail: MeetingMail, conn: Queryable): Promise<{ id: number; invite: InviteResult }> {
  const data = checked(input);
  const party = await partyOf(opportunityId, scope, conn);
  if (input.invite && !party.email) throw new MeetingError("Esta oportunidade não tem e-mail do contato para o convite. Preencha em Dados ou desmarque o envio.");
  let row: Record<string, unknown>;
  if (id === null) {
    const { rows } = await conn.query(
      `WITH task AS (INSERT INTO opportunity_activities (opportunity_id, kind, title, due_on, owner_email, created_by) VALUES ($1, 'reuniao', $2, $3::date, $9, $10) RETURNING id)
       INSERT INTO opportunity_meetings (opportunity_id, activity_id, title, starts_at, minutes, link, place, uid, created_by, updated_by)
       SELECT $1, task.id, $5, ($3::date + $4::time) AT TIME ZONE 'America/Sao_Paulo', $6, $7, $8, $11, $10, $10 FROM task
       RETURNING id, uid, sequence, starts_at, invited`,
      [opportunityId, taskTitle(data.time, data.title), data.day, data.time, data.title, data.minutes, data.link, data.place, party.ownerEmail, who, `${randomUUID()}@erp.avilaops.com`],
    );
    row = rows[0];
  } else {
    const { rows } = await conn.query(
      `WITH changed AS (
         UPDATE opportunity_meetings SET title = $5, starts_at = ($3::date + $4::time) AT TIME ZONE 'America/Sao_Paulo', minutes = $6, link = $7, place = $8, sequence = sequence + 1, updated_at = now(), updated_by = $9
          WHERE id = $1 AND opportunity_id = $2 AND status = 'agendada' RETURNING id, uid, sequence, starts_at, invited, activity_id),
            task AS (UPDATE opportunity_activities a SET title = $10, due_on = $3::date FROM changed WHERE a.id = changed.activity_id)
       SELECT id, uid, sequence, starts_at, invited FROM changed`,
      [id, opportunityId, data.day, data.time, data.title, data.minutes, data.link, data.place, who, taskTitle(data.time, data.title)],
    );
    if (rows.length === 0) throw new MeetingError(NOT_FOUND);
    row = rows[0];
  }
  await conn.query("UPDATE opportunities SET updated_at = now(), updated_by = $2 WHERE id = $1", [opportunityId, who]);
  const meetingId = Number(row.id);
  // Who was invited before hears of the change, even if the box is not ticked again.
  const to = input.invite ? party.email : row.invited === null ? null : String(row.invited);
  if (to === null) return { id: meetingId, invite: { sent: null, problem: null } };
  const invite = await sendInvite("REQUEST", { id: meetingId, opportunityId, uid: String(row.uid), sequence: Number(row.sequence), title: data.title, startsAt: row.starts_at as Date, day: data.day, time: data.time, minutes: data.minutes, link: data.link, place: data.place }, to, party, mail, who, conn);
  if (invite.sent) await conn.query("UPDATE opportunity_meetings SET invited = $2 WHERE id = $1", [meetingId, invite.sent]);
  return { id: meetingId, invite };
}

/** Cancels a meeting: its task leaves the funnel and who was invited is told. The meeting stays in the list, as cancelled. */
export async function cancelMeeting(id: number, opportunityId: number, who: string, scope: FunnelScope, mail: MeetingMail, conn: Queryable): Promise<InviteResult> {
  const party = await partyOf(opportunityId, scope, conn);
  const { rows } = await conn.query(
    `WITH changed AS (
       UPDATE opportunity_meetings m SET status = 'cancelada', sequence = m.sequence + 1, activity_id = NULL, updated_at = now(), updated_by = $3
         FROM opportunity_meetings before WHERE m.id = $1 AND m.opportunity_id = $2 AND m.status = 'agendada' AND before.id = m.id
       RETURNING m.id, m.uid, m.sequence, m.title, m.starts_at, m.minutes, m.link, m.place, m.invited, before.activity_id AS task,
                 to_char(m.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day, to_char(m.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS time),
          task AS (DELETE FROM opportunity_activities a USING changed WHERE a.id = changed.task AND a.done_at IS NULL)
     SELECT * FROM changed`,
    [id, opportunityId, who],
  );
  const row = rows[0];
  if (!row) throw new MeetingError(NOT_FOUND);
  if (row.invited === null) return { sent: null, problem: null };
  return sendInvite("CANCEL", { id, opportunityId, uid: String(row.uid), sequence: Number(row.sequence), title: String(row.title), startsAt: row.starts_at as Date, day: String(row.day), time: String(row.time), minutes: Number(row.minutes), link: row.link === null ? null : String(row.link), place: row.place === null ? null : String(row.place) }, String(row.invited), party, mail, who, conn);
}

/** Removes a cancelled meeting from the list. One that is on has to be cancelled first, so who was invited is told. */
export async function deleteMeeting(id: number, opportunityId: number, scope: FunnelScope, conn: Queryable): Promise<void> {
  await partyOf(opportunityId, scope, conn);
  const { rows } = await conn.query("DELETE FROM opportunity_meetings WHERE id = $1 AND opportunity_id = $2 AND status = 'cancelada' RETURNING id", [id, opportunityId]);
  if (rows.length === 0) throw new MeetingError((await getMeeting(id, opportunityId, conn)) ? "Cancele a reunião antes de remover." : NOT_FOUND);
}

export const CALL_OUTCOMES = { atendeu: "Atendeu", nao_atendeu: "Não atendeu", caixa_postal: "Caixa postal", numero_errado: "Número errado" } as const;
export type CallOutcome = keyof typeof CALL_OUTCOMES;

/**
 * Writes down a call that was made: an activity already done, with how it went
 * and what was said, and, when a day is given, the task to call again.
 */
export async function logCall(opportunityId: number, input: { outcome: string; note: string; againOn: string | null }, who: string, scope: FunnelScope, conn: Queryable): Promise<void> {
  const note = input.note.trim().replace(/\s+/g, " ");
  const againOn = input.againOn?.trim() || null;
  const problems: string[] = [];
  if (!(input.outcome in CALL_OUTCOMES)) problems.push("Diga como foi a ligação.");
  if (note.length > 250) problems.push("Anotação: até 250 letras.");
  if (againOn !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(againOn) || Number.isNaN(Date.parse(`${againOn}T12:00:00Z`)))) problems.push("Data inválida para ligar de novo.");
  if (problems.length > 0) throw new MeetingError(problems.join(" "));
  const title = `Ligação (${CALL_OUTCOMES[input.outcome as CallOutcome].toLowerCase()})${note ? `: ${note}` : ""}`;
  const { rows } = await conn.query(
    `WITH target AS (SELECT o.id, o.owner_email FROM opportunities o WHERE o.id = $1 AND ($2::text IS NULL OR o.owner_email = $2)),
          made AS (INSERT INTO opportunity_activities (opportunity_id, kind, title, done_at, done_by, owner_email, created_by) SELECT target.id, 'ligacao', $3, now(), $4, target.owner_email, $4 FROM target RETURNING id),
          again AS (INSERT INTO opportunity_activities (opportunity_id, kind, title, due_on, owner_email, created_by) SELECT target.id, 'ligacao', 'Ligar de novo', $5::date, target.owner_email, $4 FROM target WHERE $5::date IS NOT NULL),
          touched AS (UPDATE opportunities o SET updated_at = now(), updated_by = $4 FROM target WHERE o.id = target.id)
     SELECT id FROM made`,
    [opportunityId, scope.ownerEmail, title, who, againOn],
  );
  if (rows.length === 0) throw new MeetingError(OPPORTUNITY_GONE);
}

/** `5517999990000`: the number as the links of a phone and of WhatsApp take it, or `null` when it is not a Brazilian number with area code. */
export function dialable(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (/^55\d{10,11}$/.test(digits)) return digits;
  return /^\d{10,11}$/.test(digits) ? `55${digits}` : null;
}

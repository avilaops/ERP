import { publicAppUrl } from "@/lib/contract/public";
import { loadMailInfo, mailChannel } from "@/lib/db/mail";
import type { MailWay } from "@/lib/db/messages";
import { isOptedOut, unsubscribeUrl, withUnsubscribe } from "@/lib/db/optout";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { MAIL_NOT_SET } from "@/lib/db/send-nfe-mail";
import { buildMessage, isMailAddress, MailError } from "@/lib/mail/message";
import { UFS } from "@/lib/pricing/states";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class CampaignError extends Error {}

export const CAMPAIGN_AUDIENCES = {
  clientes: "Clientes do cadastro",
  abertas: "Contatos das oportunidades em andamento",
  perdidas: "Contatos das oportunidades perdidas",
} as const;
export type CampaignAudience = keyof typeof CAMPAIGN_AUDIENCES;

export const CAMPAIGN_STATUS = { rascunho: "Rascunho", enviando: "Enviando", concluida: "Concluída", cancelada: "Cancelada" } as const;
export type CampaignStatus = keyof typeof CAMPAIGN_STATUS;

/** The words a campaign may carry, with what each becomes. There is no seller here: the message is the company's. */
export const CAMPAIGN_WORDS = [
  ["contato", "Nome da pessoa de contato (ou da empresa, se não houver)"],
  ["empresa", "Nome da empresa de quem recebe"],
  ["minha_empresa", "Nome da sua empresa"],
] as const;
type Word = (typeof CAMPAIGN_WORDS)[number][0];
const fill = (text: string, values: Record<Word, string>): string => text.replace(/\{(contato|empresa|minha_empresa)\}/g, (_match, word: Word) => values[word]);

export type CampaignInput = { name: string; subject: string; body: string; audience: string; uf: string | null };
export type Campaign = {
  id: number;
  name: string;
  subject: string;
  body: string;
  audience: CampaignAudience;
  uf: string | null;
  status: CampaignStatus;
  createdAt: Date;
  startedAt: Date | null;
  startedBy: string | null;
  finishedAt: Date | null;
  /** How the list of who receives stands: nothing before the campaign starts. */
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
};

const COLUMNS = `c.id, c.name, c.subject, c.body, c.audience, c.uf, c.status, c.created_at, c.started_at, c.started_by, c.finished_at,
  count(r.id) FILTER (WHERE r.status = 'fila') AS queued, count(r.id) FILTER (WHERE r.status = 'enviado') AS sent,
  count(r.id) FILTER (WHERE r.status = 'falhou') AS failed, count(r.id) FILTER (WHERE r.status = 'pulado') AS skipped`;

function toCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: Number(row.id), name: String(row.name), subject: String(row.subject), body: String(row.body), audience: row.audience as CampaignAudience, uf: row.uf === null ? null : String(row.uf),
    status: row.status as CampaignStatus, createdAt: row.created_at as Date, startedAt: (row.started_at as Date | null) ?? null, startedBy: row.started_by === null ? null : String(row.started_by),
    finishedAt: (row.finished_at as Date | null) ?? null, queued: Number(row.queued), sent: Number(row.sent), failed: Number(row.failed), skipped: Number(row.skipped),
  };
}

export async function listCampaigns(conn: Queryable): Promise<Campaign[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM campaigns c LEFT JOIN campaign_recipients r ON r.campaign_id = c.id GROUP BY c.id ORDER BY c.id DESC`);
  return rows.map(toCampaign);
}

export async function getCampaign(id: number, conn: Queryable): Promise<Campaign | null> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM campaigns c LEFT JOIN campaign_recipients r ON r.campaign_id = c.id WHERE c.id = $1 GROUP BY c.id`, [id]);
  return rows[0] ? toCampaign(rows[0]) : null;
}

function checked(input: CampaignInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const subject = input.subject.trim();
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  const uf = input.uf?.trim().toUpperCase() || null;
  const problems: string[] = [];
  if (name.length < 2 || name.length > 80) problems.push("Nome da campanha: de 2 a 80 letras.");
  if (subject.length < 3 || subject.length > 150 || /[\r\n]/.test(subject)) problems.push("Assunto: de 3 a 150 letras, em uma linha.");
  if (body.length < 10 || body.length > 4000) problems.push("Texto: de 10 a 4.000 letras.");
  if (/\{vendedor\}/.test(subject + body)) problems.push("{vendedor} não vale em campanha: a mensagem sai em nome da empresa.");
  if (!(input.audience in CAMPAIGN_AUDIENCES)) problems.push("Escolha para quem a campanha vai.");
  if (uf !== null && !(UFS as readonly string[]).includes(uf)) problems.push("Estado inválido.");
  if (problems.length > 0) throw new CampaignError(problems.join(" "));
  return { name, subject, body, audience: input.audience as CampaignAudience, uf: input.audience === "clientes" ? uf : null };
}

const NOT_FOUND = "Campanha não encontrada. Recarregue a página.";
const NOT_DRAFT = "Esta campanha já foi enviada: o texto e o público não mudam mais.";

/** Creates a campaign as a draft, or changes the draft with `id`. Returns its id. */
export async function saveCampaign(id: number | null, input: CampaignInput, who: string, conn: Queryable): Promise<number> {
  const data = checked(input);
  try {
    if (id === null) {
      const { rows } = await conn.query(
        "INSERT INTO campaigns (name, subject, body, audience, uf, created_by, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id",
        [data.name, data.subject, data.body, data.audience, data.uf, who],
      );
      return Number(rows[0].id);
    }
    const { rows } = await conn.query(
      "UPDATE campaigns SET name = $2, subject = $3, body = $4, audience = $5, uf = $6, updated_at = now(), updated_by = $7 WHERE id = $1 AND status = 'rascunho' RETURNING id",
      [id, data.name, data.subject, data.body, data.audience, data.uf, who],
    );
    if (rows.length === 0) throw new CampaignError((await getCampaign(id, conn)) ? NOT_DRAFT : NOT_FOUND);
    return id;
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new CampaignError("Já existe uma campanha com esse nome.");
    throw error;
  }
}

/**
 * Removes a campaign nobody received: a draft, or one cancelled before the
 * first message. One that reached somebody stays, as the record of what the
 * company sent and to whom.
 */
export async function deleteCampaign(id: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `WITH target AS (SELECT c.id FROM campaigns c WHERE c.id = $1 AND c.status <> 'enviando' AND NOT EXISTS (SELECT 1 FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.status IN ('enviado', 'falhou'))),
          listed AS (DELETE FROM campaign_recipients r USING target WHERE r.campaign_id = target.id)
     DELETE FROM campaigns c USING target WHERE c.id = target.id RETURNING c.id`,
    [id],
  );
  if (rows.length === 0) throw new CampaignError((await getCampaign(id, conn)) ? "Esta campanha já chegou a alguém e fica como registro. Só rascunho e campanha cancelada antes do primeiro envio são removidos." : NOT_FOUND);
}

/**
 * Who a campaign reaches, one line per address: the people of the chosen
 * public with a usable e-mail, less who asked to leave. `$1` is the public and
 * `$2` the state (or null).
 */
const AUDIENCE = `WITH people AS (
    SELECT c.email, COALESCE(NULLIF(btrim(c.contact_name), ''), c.name) AS contact, c.name AS company
      FROM customers c WHERE $1 = 'clientes' AND ($2::text IS NULL OR c.uf = $2)
    UNION ALL
    SELECT COALESCE(NULLIF(btrim(o.email), ''), c.email), COALESCE(NULLIF(btrim(o.contact_name), ''), NULLIF(btrim(c.contact_name), ''), c.name, o.company), COALESCE(c.name, o.company)
      FROM opportunities o JOIN pipeline_stages s ON s.id = o.stage_id LEFT JOIN customers c ON c.id = o.customer_id
     WHERE ($1 = 'abertas' AND s.kind = 'aberta') OR ($1 = 'perdidas' AND s.kind = 'perdida')
  ), clean AS (SELECT lower(btrim(email)) AS email, contact, company FROM people WHERE email IS NOT NULL)
  SELECT DISTINCT ON (k.email) k.email, COALESCE(k.contact, '') AS contact, COALESCE(k.company, '') AS company FROM clean k
   WHERE k.email ~ '^[^@[:space:]<>"(),;:]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$' AND length(k.email) <= 254
     AND NOT EXISTS (SELECT 1 FROM mail_optouts x WHERE x.email = k.email)
   ORDER BY k.email, k.contact`;

// Both are fixed texts: the public and the state go as parameters.
const COUNT_AUDIENCE = `SELECT count(*) AS total FROM (${AUDIENCE}) a`;
const LIST_AUDIENCE = `INSERT INTO campaign_recipients (campaign_id, email, contact, company) SELECT $3, a.email, a.contact, a.company FROM (${AUDIENCE}) a RETURNING id`;

/** How many people the campaign would reach if it started now. */
export async function countAudience(audience: CampaignAudience, uf: string | null, conn: Queryable): Promise<number> {
  const { rows } = await conn.query(COUNT_AUDIENCE, [audience, uf]);
  return Number(rows[0].total);
}

/**
 * Starts a draft: the list of who receives is taken now and does not change
 * after. The messages leave by the routine, a few at a time.
 */
export async function startCampaign(id: number, who: string, now: Date, conn: Queryable): Promise<number> {
  const taken = await conn.query("UPDATE campaigns SET status = 'enviando', started_at = $2, started_by = $3, updated_at = $2, updated_by = $3 WHERE id = $1 AND status = 'rascunho' RETURNING audience, uf", [id, now, who]);
  if (taken.rows.length === 0) throw new CampaignError((await getCampaign(id, conn)) ? "Esta campanha já foi enviada." : NOT_FOUND);
  const { rows } = await conn.query(LIST_AUDIENCE, [taken.rows[0].audience, taken.rows[0].uf, id]);
  if (rows.length === 0) {
    await conn.query("UPDATE campaigns SET status = 'rascunho', started_at = NULL, started_by = NULL WHERE id = $1", [id]);
    throw new CampaignError("Ninguém deste público tem e-mail para receber. Nada foi enviado.");
  }
  return rows.length;
}

/** Stops a campaign on its way: who had not received yet does not receive. */
export async function cancelCampaign(id: number, who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `WITH target AS (UPDATE campaigns SET status = 'cancelada', finished_at = now(), updated_at = now(), updated_by = $2 WHERE id = $1 AND status = 'enviando' RETURNING id),
          dropped AS (UPDATE campaign_recipients r SET status = 'pulado', detail = 'Campanha cancelada.' FROM target WHERE r.campaign_id = target.id AND r.status = 'fila')
     SELECT id FROM target`,
    [id, who],
  );
  if (rows.length === 0) throw new CampaignError((await getCampaign(id, conn)) ? "Só campanha que está enviando pode ser cancelada." : NOT_FOUND);
}

export type CampaignFailure = { email: string; status: "falhou" | "pulado"; detail: string | null };

/** Who did not get the campaign, and why. */
export async function listCampaignFailures(id: number, conn: Queryable): Promise<CampaignFailure[]> {
  const { rows } = await conn.query("SELECT email, status, detail FROM campaign_recipients WHERE campaign_id = $1 AND status IN ('falhou', 'pulado') ORDER BY id LIMIT 200", [id]);
  return rows.map((row) => ({ email: String(row.email), status: row.status as "falhou" | "pulado", detail: row.detail === null ? null : String(row.detail) }));
}

export type MarketingSettings = { dailyLimit: number };

export async function loadMarketingSettings(conn: Queryable): Promise<MarketingSettings> {
  const { rows } = await conn.query("SELECT daily_limit FROM marketing_settings");
  return { dailyLimit: Number(rows[0]?.daily_limit ?? 200) };
}

export async function saveMarketingSettings(dailyLimit: number, who: string, conn: Queryable): Promise<void> {
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 5000) throw new CampaignError("Limite por dia: de 1 a 5.000 e-mails.");
  await conn.query("UPDATE marketing_settings SET daily_limit = $1, updated_at = now(), updated_by = $2", [dailyLimit, who]);
}

/** How many campaign e-mails left in the last 24 hours. */
export async function sentLastDay(now: Date, conn: Queryable): Promise<number> {
  const { rows } = await conn.query("SELECT count(*) AS total FROM campaign_recipients WHERE status = 'enviado' AND sent_at > $1::timestamptz - interval '24 hours'", [now]);
  return Number(rows[0].total);
}

type Tenant = { slug: string; name: string };

/**
 * Sends the campaign as it is to one address of the team, for the person to
 * read it before it goes to the customers. Marked as a test in the subject,
 * and with the way out at the foot pointing nowhere that changes anything.
 */
export async function sendCampaignTest(id: number, to: { email: string; name: string }, tenant: Tenant, now: Date, way: MailWay, conn: Queryable): Promise<void> {
  const campaign = await getCampaign(id, conn);
  if (!campaign) throw new CampaignError(NOT_FOUND);
  if (!isMailAddress(to.email)) throw new CampaignError("O seu e-mail de acesso não é um endereço que recebe mensagens.");
  const channel = await mailChannel(conn, way.env, way.key);
  if (!channel) throw new MailError(MAIL_NOT_SET);
  const { replyTo } = await loadMailInfo(conn);
  const words = { contato: to.name, empresa: tenant.name, minha_empresa: tenant.name };
  const text = withUnsubscribe(fill(campaign.body, words), tenant.name, `${publicAppUrl(way.env)}/descadastro/${tenant.slug}/(endereço de cada destinatário)`);
  const message = buildMessage({ from: channel.from, fromName: tenant.name, to: to.email, replyTo, subject: `[Teste] ${fill(campaign.subject, words)}`.slice(0, 200), text, attachments: [] }, now);
  await way.send(channel.smtp, { from: channel.from, to: to.email }, message);
}

/** How many messages one run of the routine sends at most. */
const BATCH = 20;
/** After this many refusals in a row the run stops: the mail server is the problem, not the addresses. */
const GIVE_UP_AFTER = 3;

/**
 * Sends the next messages of the campaigns on their way: at most a batch per
 * run and never beyond the company's limit for 24 hours. Each line of the list
 * is taken by one caller only; who left the list in the meantime is skipped; a
 * campaign with nobody left in the queue is closed. With no mailbox to send
 * from nothing is taken and the campaigns wait.
 */
export async function runCampaigns(tenant: Tenant, now: Date, way: MailWay, conn: Queryable): Promise<{ sent: number; failed: number; skipped: number; finished: number }> {
  const result = { sent: 0, failed: 0, skipped: 0, finished: 0 };
  const waiting = await conn.query("SELECT 1 FROM campaigns WHERE status = 'enviando' LIMIT 1");
  if (waiting.rows.length === 0) return result;
  const room = Math.min(BATCH, (await loadMarketingSettings(conn)).dailyLimit - (await sentLastDay(now, conn)));
  const channel = room > 0 ? await mailChannel(conn, way.env, way.key) : null;
  if (channel) {
    const { replyTo } = await loadMailInfo(conn);
    // Taken by stamping the moment: who takes a line is the only one to send it, and a crash leaves it to be tried again in an hour.
    const taken = await conn.query(
      `UPDATE campaign_recipients r SET taken_at = $1
        WHERE r.id IN (SELECT q.id FROM campaign_recipients q JOIN campaigns c ON c.id = q.campaign_id
                        WHERE c.status = 'enviando' AND q.status = 'fila' AND (q.taken_at IS NULL OR q.taken_at < $1::timestamptz - interval '1 hour')
                        ORDER BY q.id LIMIT $2 FOR UPDATE OF q SKIP LOCKED)
        RETURNING r.id, r.campaign_id, r.email, r.contact, r.company`,
      [now, room],
    );
    const texts = new Map<number, { subject: string; body: string }>();
    let refusedInARow = 0;
    const rows = [...taken.rows].sort((a, b) => Number(a.id) - Number(b.id));
    for (const [index, row] of rows.entries()) {
      if (refusedInARow >= GIVE_UP_AFTER) {
        await conn.query("UPDATE campaign_recipients SET taken_at = NULL WHERE id = ANY($1::int[]) AND status = 'fila'", [rows.slice(index).map((left) => Number(left.id))]);
        break;
      }
      const id = Number(row.id);
      const campaignId = Number(row.campaign_id);
      const email = String(row.email);
      const mark = (status: "enviado" | "falhou" | "pulado", detail: string | null) =>
        conn.query("UPDATE campaign_recipients SET status = $2, detail = $3, sent_at = CASE WHEN $2 = 'enviado' THEN $4::timestamptz END WHERE id = $1", [id, status, detail, now]);
      if (await isOptedOut(email, conn)) {
        await mark("pulado", "Pediu para não receber mais.");
        result.skipped += 1;
        continue;
      }
      if (!texts.has(campaignId)) {
        const found = await conn.query("SELECT subject, body FROM campaigns WHERE id = $1", [campaignId]);
        texts.set(campaignId, { subject: String(found.rows[0].subject), body: String(found.rows[0].body) });
      }
      const campaign = texts.get(campaignId)!;
      const words = { contato: String(row.contact) || String(row.company), empresa: String(row.company), minha_empresa: tenant.name };
      try {
        const unsubscribe = await unsubscribeUrl(email, publicAppUrl(way.env), tenant.slug, conn);
        const text = withUnsubscribe(fill(campaign.body, words), tenant.name, unsubscribe);
        const message = buildMessage({ from: channel.from, fromName: tenant.name, to: email, replyTo, subject: fill(campaign.subject, words).slice(0, 200), text, attachments: [], unsubscribe }, now);
        await way.send(channel.smtp, { from: channel.from, to: email }, message);
        await mark("enviado", null);
        result.sent += 1;
        refusedInARow = 0;
      } catch (error) {
        if (!(error instanceof MailError)) console.error("[campanhas] falha inesperada no envio:", error instanceof Error ? error.message : error);
        await mark("falhou", (error instanceof MailError ? error.message : "Falha inesperada no envio.").slice(0, 300));
        result.failed += 1;
        refusedInARow += 1;
      }
    }
  }
  const closed = await conn.query(
    `UPDATE campaigns c SET status = 'concluida', finished_at = $1 WHERE c.status = 'enviando' AND NOT EXISTS (SELECT 1 FROM campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'fila') RETURNING c.id`,
    [now],
  );
  result.finished = closed.rows.length;
  return result;
}

import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { isMailAddress } from "@/lib/mail/message";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class FunnelError extends Error {}

/** Whose opportunities a request reaches: one seller's, or everyone's (`null`). It comes from the session, never from the screen. */
export type FunnelScope = { ownerEmail: string | null };

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY = "23503";
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const blank = (value: string | null | undefined) => (value?.trim() ? value.trim().replace(/\s+/g, " ") : null);

export type StageKind = "aberta" | "ganha" | "perdida";
export type Stage = { id: number; name: string; position: number; kind: StageKind };

/** The stages in the order of the funnel: the open ones by position, then won, then lost. */
export async function listStages(conn: Queryable): Promise<Stage[]> {
  const { rows } = await conn.query("SELECT id, name, position, kind FROM pipeline_stages ORDER BY (kind <> 'aberta'), (kind = 'perdida'), position, id");
  return rows.map((row) => ({ id: Number(row.id), name: String(row.name), position: Number(row.position), kind: row.kind as StageKind }));
}

function stageName(name: string): string {
  const clean = blank(name) ?? "";
  if (clean.length < 2 || clean.length > 40) throw new FunnelError("Nome da etapa: de 2 a 40 letras.");
  return clean;
}

/** A new open stage, after the last one. */
export async function createStage(name: string, who: string, conn: Queryable): Promise<void> {
  try {
    await conn.query("INSERT INTO pipeline_stages (name, position, kind, updated_by) VALUES ($1, COALESCE((SELECT max(position) FROM pipeline_stages WHERE kind = 'aberta'), 0) + 1, 'aberta', $2)", [stageName(name), who]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new FunnelError("Já existe uma etapa com esse nome.");
    throw error;
  }
}

export async function renameStage(id: number, name: string, who: string, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query("UPDATE pipeline_stages SET name = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING id", [id, stageName(name), who]);
    if (rows.length === 0) throw new FunnelError("Etapa não encontrada. Recarregue a página.");
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new FunnelError("Já existe uma etapa com esse nome.");
    throw error;
  }
}

/** Swaps an open stage with its neighbour. The stages that close an opportunity do not move: they are always the last ones. */
export async function moveStage(id: number, direction: "antes" | "depois", who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `WITH target AS (SELECT id, position FROM pipeline_stages WHERE id = $1 AND kind = 'aberta'),
          neighbour AS (
            SELECT s.id, s.position FROM pipeline_stages s, target
             WHERE s.kind = 'aberta' AND CASE WHEN $2 = 'antes' THEN s.position < target.position ELSE s.position > target.position END
             ORDER BY CASE WHEN $2 = 'antes' THEN -s.position ELSE s.position END LIMIT 1)
     UPDATE pipeline_stages s SET position = CASE WHEN s.id = target.id THEN neighbour.position ELSE target.position END, updated_at = now(), updated_by = $3
       FROM target, neighbour WHERE s.id IN (target.id, neighbour.id) RETURNING s.id`,
    [id, direction, who],
  );
  if (rows.length === 0) throw new FunnelError("Esta etapa já está na ponta, ou não pode ser movida.");
}

/** Removes an open stage nobody is in. Won and lost always exist. */
export async function deleteStage(id: number, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query(
      `WITH target AS (SELECT id FROM pipeline_stages WHERE id = $1 AND kind = 'aberta' AND (SELECT count(*) FROM pipeline_stages WHERE kind = 'aberta') > 1),
            -- The history keeps the name of the stage; only the reference to it goes.
            freed AS (UPDATE opportunity_moves m SET stage_id = NULL FROM target WHERE m.stage_id = target.id)
       DELETE FROM pipeline_stages s USING target WHERE s.id = target.id RETURNING s.id`,
      [id],
    );
    if (rows.length === 0) throw new FunnelError("Esta etapa não pode ser removida: é a de ganho, a de perda ou a única em aberto.");
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY) throw new FunnelError("Há oportunidades nesta etapa. Mova-as para outra etapa antes de remover.");
    throw error;
  }
}

export type OpportunityInput = {
  title: string;
  /** A customer of the register, or `null` with `company` filled in. */
  customerId: number | null;
  company: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  estimatedValue: number | null;
  notes: string | null;
};

export type Opportunity = OpportunityInput & {
  id: number;
  stageId: number;
  stageName: string;
  stageKind: StageKind;
  ownerEmail: string;
  ownerName: string;
  /** Name of the customer of the register, when there is one. */
  customerName: string | null;
  orderNumber: string | null;
  orderStatus: string | null;
  lostReason: string | null;
  updatedAt: Date;
  createdAt: Date;
  closedAt: Date | null;
  /** The earliest thing still to do, when there is one. */
  nextDue: string | null;
  nextTitle: string | null;
};

/** Who the opportunity is with, as the lists show it: the customer of the register or the company typed. */
export const opportunityParty = (item: Pick<Opportunity, "customerName" | "company">) => item.customerName ?? item.company ?? "";

const COLUMNS = `o.id, o.title, o.customer_id, o.company, o.contact_name, o.phone, o.email, o.source, o.estimated_value, o.notes, o.stage_id, s.name AS stage_name, s.kind AS stage_kind,
  o.owner_email, o.owner_name, c.name AS customer_name, d.number AS order_number, d.status AS order_status, o.lost_reason, o.updated_at, o.created_at, o.closed_at,
  n.due_on::text AS next_due, n.title AS next_title`;
const FROM = `opportunities o JOIN pipeline_stages s ON s.id = o.stage_id LEFT JOIN customers c ON c.id = o.customer_id LEFT JOIN orders d ON d.id = o.order_id
  LEFT JOIN LATERAL (SELECT a.due_on, a.title FROM opportunity_activities a WHERE a.opportunity_id = o.id AND a.done_at IS NULL AND a.kind <> 'nota' ORDER BY a.due_on NULLS LAST, a.id LIMIT 1) n ON true`;

function toOpportunity(row: Record<string, unknown>): Opportunity {
  return {
    id: Number(row.id), title: String(row.title), customerId: row.customer_id === null ? null : Number(row.customer_id), company: text(row.company), contactName: text(row.contact_name),
    phone: text(row.phone), email: text(row.email), source: text(row.source), estimatedValue: row.estimated_value === null ? null : Number(row.estimated_value), notes: text(row.notes),
    stageId: Number(row.stage_id), stageName: String(row.stage_name), stageKind: row.stage_kind as StageKind, ownerEmail: String(row.owner_email), ownerName: String(row.owner_name),
    customerName: text(row.customer_name), orderNumber: text(row.order_number), orderStatus: text(row.order_status), lostReason: text(row.lost_reason),
    updatedAt: row.updated_at as Date, createdAt: row.created_at as Date, closedAt: (row.closed_at as Date | null) ?? null, nextDue: text(row.next_due), nextTitle: text(row.next_title),
  };
}

function checked(input: OpportunityInput): OpportunityInput {
  const title = blank(input.title) ?? "";
  const company = blank(input.company);
  const email = blank(input.email)?.toLowerCase() ?? null;
  const problems: string[] = [];
  if (title.length < 2 || title.length > 120) problems.push("Diga em poucas palavras o que está sendo vendido (2 a 120 letras).");
  if (input.customerId === null && (company === null || company.length < 2 || company.length > 120)) problems.push("Escolha um cliente do cadastro ou informe o nome da empresa.");
  if (email !== null && !isMailAddress(email)) problems.push("E-mail inválido.");
  if (input.estimatedValue !== null && (!Number.isFinite(input.estimatedValue) || input.estimatedValue < 0 || input.estimatedValue > 999_999_999)) problems.push("Valor estimado inválido.");
  if (problems.length > 0) throw new FunnelError(problems.join(" "));
  return {
    title, customerId: input.customerId, company: input.customerId === null ? company : null, contactName: blank(input.contactName)?.slice(0, 120) ?? null, phone: blank(input.phone)?.slice(0, 40) ?? null,
    email, source: blank(input.source)?.slice(0, 80) ?? null, estimatedValue: input.estimatedValue, notes: input.notes?.trim() ? input.notes.trim().slice(0, 4000) : null,
  };
}

/** A new opportunity, in the first stage of the funnel, of who creates it. */
export async function createOpportunity(input: OpportunityInput, owner: { email: string; name: string }, conn: Queryable): Promise<number> {
  const data = checked(input);
  try {
    const { rows } = await conn.query(
      `INSERT INTO opportunities (title, customer_id, company, contact_name, phone, email, source, estimated_value, notes, stage_id, owner_email, owner_name, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT id FROM pipeline_stages WHERE kind = 'aberta' ORDER BY position, id LIMIT 1), $10, $11, $10, $10) RETURNING id`,
      [data.title, data.customerId, data.company, data.contactName, data.phone, data.email, data.source, data.estimatedValue, data.notes, owner.email, owner.name],
    );
    const id = Number(rows[0].id);
    await noteMove(id, owner.email, conn);
    return id;
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY) throw new FunnelError("Cliente não encontrado. Recarregue a página.");
    throw error;
  }
}

/** Writes down the stage an opportunity is in now, as one more step of its way. */
async function noteMove(id: number, who: string, conn: Queryable): Promise<void> {
  await conn.query(
    `INSERT INTO opportunity_moves (opportunity_id, stage_id, stage_name, stage_kind, moved_by)
     SELECT o.id, s.id, s.name, s.kind, $2 FROM opportunities o JOIN pipeline_stages s ON s.id = o.stage_id WHERE o.id = $1`,
    [id, who],
  );
}

export async function getOpportunity(id: number, scope: FunnelScope, conn: Queryable): Promise<Opportunity | null> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE o.id = $1 AND ($2::text IS NULL OR o.owner_email = $2)`, [id, scope.ownerEmail]);
  return rows[0] ? toOpportunity(rows[0]) : null;
}

/** The opportunities the scope reaches: the ones with something due first, then the ones moved most recently. */
export async function listOpportunities(scope: FunnelScope, conn: Queryable): Promise<Opportunity[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE ($1::text IS NULL OR o.owner_email = $1) ORDER BY n.due_on NULLS LAST, o.updated_at DESC, o.id DESC`, [scope.ownerEmail]);
  return rows.map(toOpportunity);
}

const NOT_FOUND = "Oportunidade não encontrada. Recarregue a página.";

export async function updateOpportunity(id: number, input: OpportunityInput, who: string, scope: FunnelScope, conn: Queryable): Promise<void> {
  const data = checked(input);
  try {
    const { rows } = await conn.query(
      `UPDATE opportunities SET title = $3, customer_id = $4, company = $5, contact_name = $6, phone = $7, email = $8, source = $9, estimated_value = $10, notes = $11, updated_at = now(), updated_by = $12
        WHERE id = $1 AND ($2::text IS NULL OR owner_email = $2) RETURNING id`,
      [id, scope.ownerEmail, data.title, data.customerId, data.company, data.contactName, data.phone, data.email, data.source, data.estimatedValue, data.notes, who],
    );
    if (rows.length === 0) throw new FunnelError(NOT_FOUND);
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY) throw new FunnelError("Cliente não encontrado. Recarregue a página.");
    throw error;
  }
}

/**
 * Moves an opportunity to another stage. Losing asks for the reason; winning
 * and losing close it, and moving back to an open stage opens it again.
 */
export async function moveOpportunity(id: number, stageId: number, lostReason: string | null, who: string, scope: FunnelScope, conn: Queryable): Promise<void> {
  const stage = (await listStages(conn)).find((item) => item.id === stageId);
  if (!stage) throw new FunnelError("Etapa não encontrada. Recarregue a página.");
  const reason = blank(lostReason)?.slice(0, 300) ?? null;
  if (stage.kind === "perdida" && reason === null) throw new FunnelError("Diga por que a venda foi perdida: é o que mostra onde melhorar.");
  const { rows } = await conn.query(
    `UPDATE opportunities SET stage_id = $3, lost_reason = $4, closed_at = CASE WHEN $5 THEN NULL ELSE COALESCE(closed_at, now()) END, updated_at = now(), updated_by = $6
      WHERE id = $1 AND ($2::text IS NULL OR owner_email = $2) RETURNING id`,
    [id, scope.ownerEmail, stageId, stage.kind === "perdida" ? reason : null, stage.kind === "aberta", who],
  );
  if (rows.length === 0) throw new FunnelError(NOT_FOUND);
  await noteMove(id, who, conn);
}

/** Removes an opportunity with what was noted on it. A linked order is not touched. */
export async function deleteOpportunity(id: number, scope: FunnelScope, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `WITH target AS (SELECT id FROM opportunities WHERE id = $1 AND ($2::text IS NULL OR owner_email = $2)),
          noted AS (DELETE FROM opportunity_activities a USING target WHERE a.opportunity_id = target.id),
          walked AS (DELETE FROM opportunity_moves m USING target WHERE m.opportunity_id = target.id),
          written AS (DELETE FROM opportunity_messages g USING target WHERE g.opportunity_id = target.id),
          followed AS (DELETE FROM opportunity_cadences e USING target WHERE e.opportunity_id = target.id)
     DELETE FROM opportunities o USING target WHERE o.id = target.id RETURNING o.id`,
    [id, scope.ownerEmail],
  );
  if (rows.length === 0) throw new FunnelError(NOT_FOUND);
}

/**
 * Ties the opportunity to the order it became. Both have to be within reach of
 * who asks: a seller links only their own order to their own opportunity.
 * `null` undoes the link.
 */
export async function linkOpportunityOrder(id: number, orderNumber: string | null, who: string, scope: FunnelScope, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `UPDATE opportunities o SET order_id = (SELECT d.id FROM orders d WHERE d.number = $3 AND ($2::text IS NULL OR d.seller_email = $2)), updated_at = now(), updated_by = $4
      WHERE o.id = $1 AND ($2::text IS NULL OR o.owner_email = $2)
        AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM orders d WHERE d.number = $3 AND ($2::text IS NULL OR d.seller_email = $2)))
      RETURNING o.id`,
    [id, scope.ownerEmail, orderNumber, who],
  );
  if (rows.length === 0) throw new FunnelError("Oportunidade ou pedido não encontrado.");
}

/**
 * Follows the orders: an open opportunity whose order was closed is won, and
 * one whose order was lost or cancelled is lost, with the reason said. Run
 * when the funnel is opened, so the two never tell different stories.
 */
export async function syncOpportunitiesWithOrders(conn: Queryable): Promise<void> {
  await conn.query(
    `WITH closed AS (
     UPDATE opportunities o
        SET stage_id = t.id, closed_at = now(), updated_at = now(), updated_by = 'sistema',
            lost_reason = CASE WHEN t.kind = 'perdida' THEN 'Pedido ' || d.number || CASE WHEN d.status = 'cancelado' THEN ' cancelado' ELSE ' marcado como perdido' END ELSE NULL END
       FROM orders d, pipeline_stages s, pipeline_stages t
      WHERE d.id = o.order_id AND s.id = o.stage_id AND s.kind = 'aberta'
        AND t.kind = CASE WHEN d.status = 'fechado' THEN 'ganha' WHEN d.status IN ('perdido', 'cancelado') THEN 'perdida' END
     RETURNING o.id, t.id AS stage_id, t.name, t.kind)
     INSERT INTO opportunity_moves (opportunity_id, stage_id, stage_name, stage_kind, moved_by) SELECT id, stage_id, name, kind, 'sistema' FROM closed`,
  );
}

export type ActivityKind = "tarefa" | "ligacao" | "reuniao" | "nota";
export const ACTIVITY_LABELS: Record<ActivityKind, string> = { tarefa: "Tarefa", ligacao: "Ligação", reuniao: "Reunião", nota: "Anotação" };

export type Activity = { id: number; /** `null` for a reminder of an order with no opportunity. */ opportunityId: number | null; kind: ActivityKind; title: string; dueOn: string | null; doneAt: Date | null; doneBy: string | null; ownerEmail: string; createdAt: Date; createdBy: string };

const toActivity = (row: Record<string, unknown>): Activity => ({
  id: Number(row.id), opportunityId: row.opportunity_id === null ? null : Number(row.opportunity_id), kind: row.kind as ActivityKind, title: String(row.title), dueOn: text(row.due_on), doneAt: (row.done_at as Date | null) ?? null,
  doneBy: text(row.done_by), ownerEmail: String(row.owner_email), createdAt: row.created_at as Date, createdBy: String(row.created_by),
});

/** Something done or to do on an opportunity within reach. A note has no date; the rest may have one. */
export async function addActivity(opportunityId: number, input: { kind: string; title: string; dueOn: string | null }, who: string, scope: FunnelScope, conn: Queryable): Promise<void> {
  if (!(input.kind in ACTIVITY_LABELS)) throw new FunnelError("Escolha o tipo da atividade.");
  const title = input.title.trim();
  if (title.length < 2 || title.length > 300) throw new FunnelError("Descreva a atividade (2 a 300 letras).");
  const dueOn = input.kind === "nota" ? null : blank(input.dueOn);
  if (dueOn !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn) || Number.isNaN(Date.parse(`${dueOn}T12:00:00Z`)))) throw new FunnelError("Data inválida.");
  const { rows } = await conn.query(
    `INSERT INTO opportunity_activities (opportunity_id, kind, title, due_on, owner_email, created_by)
     SELECT o.id, $3, $4, $5::date, o.owner_email, $6 FROM opportunities o WHERE o.id = $1 AND ($2::text IS NULL OR o.owner_email = $2) RETURNING id`,
    [opportunityId, scope.ownerEmail, input.kind, title, dueOn, who],
  );
  if (rows.length === 0) throw new FunnelError(NOT_FOUND);
  await conn.query("UPDATE opportunities SET updated_at = now(), updated_by = $2 WHERE id = $1", [opportunityId, who]);
}

/** Marks an activity as done, or as not done again. */
export async function setActivityDone(activityId: number, done: boolean, who: string, scope: FunnelScope, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `UPDATE opportunity_activities a SET done_at = CASE WHEN $3 THEN now() END, done_by = CASE WHEN $3 THEN $4 END
      WHERE a.id = $1 AND a.kind <> 'nota'
        AND ($2::text IS NULL OR COALESCE((SELECT o.owner_email FROM opportunities o WHERE o.id = a.opportunity_id), a.owner_email) = $2) RETURNING a.id`,
    [activityId, scope.ownerEmail, done, who],
  );
  if (rows.length === 0) throw new FunnelError("Atividade não encontrada. Recarregue a página.");
}

export async function deleteActivity(activityId: number, scope: FunnelScope, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    "DELETE FROM opportunity_activities a WHERE a.id = $1 AND ($2::text IS NULL OR COALESCE((SELECT o.owner_email FROM opportunities o WHERE o.id = a.opportunity_id), a.owner_email) = $2) RETURNING a.id",
    [activityId, scope.ownerEmail],
  );
  if (rows.length === 0) throw new FunnelError("Atividade não encontrada. Recarregue a página.");
}

/** Everything noted on one opportunity, the newest first. The opportunity was already read within the scope. */
export async function listActivities(opportunityId: number, conn: Queryable): Promise<Activity[]> {
  const { rows } = await conn.query("SELECT id, opportunity_id, kind, title, due_on::text AS due_on, done_at, done_by, owner_email, created_at, created_by FROM opportunity_activities WHERE opportunity_id = $1 ORDER BY (done_at IS NOT NULL OR kind = 'nota'), due_on NULLS LAST, id DESC", [opportunityId]);
  return rows.map(toActivity);
}

export type PendingActivity = Activity & {
  /** What the task is about: the opportunity, or the order of an automatic reminder. */
  subject: string;
  party: string;
  ownerName: string;
  /** The order of an automatic reminder that is not tied to an opportunity. */
  orderNumber: string | null;
  /** Created by a rule of the company, not by a person. */
  automatic: boolean;
};

/**
 * What is still to do: the tasks of open opportunities and the automatic
 * reminders of orders, the oldest date first; without a date, last. A seller
 * gets their own; the scope comes from the session.
 */
export async function listPendingActivities(scope: FunnelScope, conn: Queryable): Promise<PendingActivity[]> {
  const { rows } = await conn.query(
    `SELECT a.id, a.opportunity_id, a.kind, a.title, a.due_on::text AS due_on, a.done_at, a.done_by, a.owner_email, a.created_at, a.created_by,
            COALESCE(o.title, 'Pedido #' || d.number) AS subject, COALESCE(c.name, o.company, dc.name, '') AS party,
            COALESCE(o.owner_name, d.seller_name, a.owner_email) AS owner_name, CASE WHEN a.opportunity_id IS NULL THEN d.number END AS order_number, a.auto_key IS NOT NULL AS automatic
       FROM opportunity_activities a
       LEFT JOIN opportunities o ON o.id = a.opportunity_id LEFT JOIN pipeline_stages s ON s.id = o.stage_id LEFT JOIN customers c ON c.id = o.customer_id
       LEFT JOIN orders d ON d.id = a.order_id LEFT JOIN customers dc ON dc.id = d.customer_id
      WHERE a.done_at IS NULL AND a.kind <> 'nota' AND (a.opportunity_id IS NULL OR s.kind = 'aberta')
        AND ($1::text IS NULL OR COALESCE(o.owner_email, a.owner_email) = $1)
      ORDER BY a.due_on NULLS LAST, a.id`,
    [scope.ownerEmail],
  );
  return rows.map((row) => ({
    ...toActivity(row), subject: String(row.subject), party: String(row.party ?? ""), ownerName: String(row.owner_name), orderNumber: text(row.order_number), automatic: row.automatic === true,
  }));
}

export type FunnelReport = {
  created: number;
  open: number;
  won: number;
  lost: number;
  /** Won over won plus lost; `null` while nothing was decided. */
  winRate: number | null;
  wonValue: number;
  openValue: number;
  /** Days from creation to closing, on average, of the ones won. */
  daysToWin: number | null;
  /** How many of the opportunities of the period got to each open stage, in the order of the funnel. */
  reached: { name: string; count: number }[];
  lostReasons: { reason: string; count: number }[];
  owners: { name: string; created: number; won: number; wonValue: number }[];
  /** Open ones, of any period, with nothing left to do noted on them. */
  idle: number;
};

/**
 * The numbers of the funnel for the opportunities created from `since` on,
 * within the scope. "Reached a stage" counts who was ever moved into it, or
 * into one further down the funnel: a sale that skipped a stage still passed it.
 */
export async function funnelReport(since: Date, scope: FunnelScope, conn: Queryable): Promise<FunnelReport> {
  const base = await conn.query(
    `SELECT o.id, s.kind, o.estimated_value, o.owner_name, o.lost_reason, o.created_at, o.closed_at
       FROM opportunities o JOIN pipeline_stages s ON s.id = o.stage_id
      WHERE o.created_at >= $1 AND ($2::text IS NULL OR o.owner_email = $2)`,
    [since, scope.ownerEmail],
  );
  const rows = base.rows.map((row) => ({ id: Number(row.id), kind: row.kind as StageKind, value: row.estimated_value === null ? 0 : Number(row.estimated_value), owner: String(row.owner_name), reason: text(row.lost_reason), createdAt: row.created_at as Date, closedAt: (row.closed_at as Date | null) ?? null }));
  const won = rows.filter((row) => row.kind === "ganha");
  const lost = rows.filter((row) => row.kind === "perdida");
  const open = rows.filter((row) => row.kind === "aberta");

  const stages = (await listStages(conn)).filter((stage) => stage.kind === "aberta");
  const moves = await conn.query(
    `SELECT m.opportunity_id, m.stage_name, m.stage_kind FROM opportunity_moves m JOIN opportunities o ON o.id = m.opportunity_id
      WHERE o.created_at >= $1 AND ($2::text IS NULL OR o.owner_email = $2)`,
    [since, scope.ownerEmail],
  );
  // The furthest open stage each one was ever in, by the place of the stage in the funnel of today. A sale won passed all of them.
  const order = new Map(stages.map((stage, index) => [stage.name, index]));
  const furthest = new Map<number, number>();
  for (const move of moves.rows) {
    const id = Number(move.opportunity_id);
    const at = move.stage_kind === "ganha" ? stages.length - 1 : (order.get(String(move.stage_name)) ?? -1);
    if (at > (furthest.get(id) ?? -1)) furthest.set(id, at);
  }
  const reached = stages.map((stage, index) => ({ name: stage.name, count: [...furthest.values()].filter((at) => at >= index).length }));

  const reasons = new Map<string, number>();
  for (const row of lost) reasons.set(row.reason ?? "Sem motivo informado", (reasons.get(row.reason ?? "Sem motivo informado") ?? 0) + 1);
  const owners = new Map<string, { name: string; created: number; won: number; wonValue: number }>();
  for (const row of rows) {
    const owner = owners.get(row.owner) ?? { name: row.owner, created: 0, won: 0, wonValue: 0 };
    owner.created += 1;
    if (row.kind === "ganha") {
      owner.won += 1;
      owner.wonValue += row.value;
    }
    owners.set(row.owner, owner);
  }
  const idle = await conn.query(
    `SELECT count(*)::int AS n FROM opportunities o JOIN pipeline_stages s ON s.id = o.stage_id
      WHERE s.kind = 'aberta' AND ($1::text IS NULL OR o.owner_email = $1)
        AND NOT EXISTS (SELECT 1 FROM opportunity_activities a WHERE a.opportunity_id = o.id AND a.done_at IS NULL AND a.kind <> 'nota')`,
    [scope.ownerEmail],
  );
  const days = won.filter((row) => row.closedAt).map((row) => (row.closedAt!.getTime() - row.createdAt.getTime()) / 86_400_000);
  return {
    created: rows.length, open: open.length, won: won.length, lost: lost.length,
    winRate: won.length + lost.length === 0 ? null : won.length / (won.length + lost.length),
    wonValue: won.reduce((sum, row) => sum + row.value, 0), openValue: open.reduce((sum, row) => sum + row.value, 0),
    daysToWin: days.length === 0 ? null : days.reduce((sum, value) => sum + value, 0) / days.length,
    reached,
    lostReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    owners: [...owners.values()].sort((a, b) => b.wonValue - a.wonValue || b.won - a.won || a.name.localeCompare(b.name)),
    idle: Number(idle.rows[0].n),
  };
}

/** The open opportunities with nothing left to do: the ones a sale is lost by forgetting. */
export async function listIdleOpportunities(scope: FunnelScope, conn: Queryable): Promise<Opportunity[]> {
  return (await listOpportunities(scope, conn)).filter((item) => item.stageKind === "aberta" && item.nextTitle === null);
}

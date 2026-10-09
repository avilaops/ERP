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
      "DELETE FROM pipeline_stages WHERE id = $1 AND kind = 'aberta' AND (SELECT count(*) FROM pipeline_stages WHERE kind = 'aberta') > 1 RETURNING id",
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
    return Number(rows[0].id);
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY) throw new FunnelError("Cliente não encontrado. Recarregue a página.");
    throw error;
  }
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
}

/** Removes an opportunity with what was noted on it. A linked order is not touched. */
export async function deleteOpportunity(id: number, scope: FunnelScope, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `WITH target AS (SELECT id FROM opportunities WHERE id = $1 AND ($2::text IS NULL OR owner_email = $2)),
          noted AS (DELETE FROM opportunity_activities a USING target WHERE a.opportunity_id = target.id)
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
    `UPDATE opportunities o
        SET stage_id = t.id, closed_at = now(), updated_at = now(), updated_by = 'sistema',
            lost_reason = CASE WHEN t.kind = 'perdida' THEN 'Pedido ' || d.number || CASE WHEN d.status = 'cancelado' THEN ' cancelado' ELSE ' marcado como perdido' END ELSE NULL END
       FROM orders d, pipeline_stages s, pipeline_stages t
      WHERE d.id = o.order_id AND s.id = o.stage_id AND s.kind = 'aberta'
        AND t.kind = CASE WHEN d.status = 'fechado' THEN 'ganha' WHEN d.status IN ('perdido', 'cancelado') THEN 'perdida' END`,
  );
}

export type ActivityKind = "tarefa" | "ligacao" | "reuniao" | "nota";
export const ACTIVITY_LABELS: Record<ActivityKind, string> = { tarefa: "Tarefa", ligacao: "Ligação", reuniao: "Reunião", nota: "Anotação" };

export type Activity = { id: number; opportunityId: number; kind: ActivityKind; title: string; dueOn: string | null; doneAt: Date | null; doneBy: string | null; ownerEmail: string; createdAt: Date; createdBy: string };

const toActivity = (row: Record<string, unknown>): Activity => ({
  id: Number(row.id), opportunityId: Number(row.opportunity_id), kind: row.kind as ActivityKind, title: String(row.title), dueOn: text(row.due_on), doneAt: (row.done_at as Date | null) ?? null,
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
       FROM opportunities o WHERE a.id = $1 AND o.id = a.opportunity_id AND ($2::text IS NULL OR o.owner_email = $2) AND a.kind <> 'nota' RETURNING a.id`,
    [activityId, scope.ownerEmail, done, who],
  );
  if (rows.length === 0) throw new FunnelError("Atividade não encontrada. Recarregue a página.");
}

export async function deleteActivity(activityId: number, scope: FunnelScope, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    "DELETE FROM opportunity_activities a USING opportunities o WHERE a.id = $1 AND o.id = a.opportunity_id AND ($2::text IS NULL OR o.owner_email = $2) RETURNING a.id",
    [activityId, scope.ownerEmail],
  );
  if (rows.length === 0) throw new FunnelError("Atividade não encontrada. Recarregue a página.");
}

/** Everything noted on one opportunity, the newest first. The opportunity was already read within the scope. */
export async function listActivities(opportunityId: number, conn: Queryable): Promise<Activity[]> {
  const { rows } = await conn.query("SELECT id, opportunity_id, kind, title, due_on::text AS due_on, done_at, done_by, owner_email, created_at, created_by FROM opportunity_activities WHERE opportunity_id = $1 ORDER BY (done_at IS NOT NULL OR kind = 'nota'), due_on NULLS LAST, id DESC", [opportunityId]);
  return rows.map(toActivity);
}

export type PendingActivity = Activity & { opportunityTitle: string; party: string; ownerName: string };

/** What is still to do in open opportunities, the oldest date first; without a date, last. */
export async function listPendingActivities(scope: FunnelScope, conn: Queryable): Promise<PendingActivity[]> {
  const { rows } = await conn.query(
    `SELECT a.id, a.opportunity_id, a.kind, a.title, a.due_on::text AS due_on, a.done_at, a.done_by, a.owner_email, a.created_at, a.created_by,
            o.title AS opportunity_title, COALESCE(c.name, o.company) AS party, o.owner_name
       FROM opportunity_activities a JOIN opportunities o ON o.id = a.opportunity_id JOIN pipeline_stages s ON s.id = o.stage_id LEFT JOIN customers c ON c.id = o.customer_id
      WHERE a.done_at IS NULL AND a.kind <> 'nota' AND s.kind = 'aberta' AND ($1::text IS NULL OR o.owner_email = $1)
      ORDER BY a.due_on NULLS LAST, a.id`,
    [scope.ownerEmail],
  );
  return rows.map((row) => ({ ...toActivity(row), opportunityTitle: String(row.opportunity_title), party: String(row.party ?? ""), ownerName: String(row.owner_name) }));
}

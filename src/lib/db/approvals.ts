import { getOrder, listOrders, loadOrderStanding, OrderError } from "@/lib/db/orders";
import type { OrderSummary } from "@/lib/db/orders";
import type { Queryable } from "@/lib/db/pool";
import { loadPublishedTable } from "@/lib/db/price-table";
import { isoDate } from "@/lib/format";
import { paymentOf, receivableColumns, saleOf } from "@/lib/order-quote";
import { needsDirector } from "@/lib/pricing/order";
import type { ApprovalReason, DiscountBand } from "@/lib/pricing/order";

const ALL = { sellerEmail: null };

/** An order waiting for a decision. No cost here: only the name of the band. */
export type PendingApproval = {
  order: OrderSummary;
  requestedBy: string;
  requestedAt: Date;
  reasons: ApprovalReason[];
  band: DiscountBand | null;
  /** At a loss the order is decided only by the directors. */
  directorOnly: boolean;
};

/** The queue of Aprovações, oldest request first. */
export async function listPendingApprovals(conn: Queryable): Promise<PendingApproval[]> {
  const { rows } = await conn.query(
    `SELECT o.number, a.requested_by, a.requested_at, a.reasons
       FROM order_approvals a
       JOIN orders o ON o.id = a.order_id
      WHERE a.status = 'pendente' AND o.status = 'aguardando_aprovacao'
      ORDER BY a.requested_at, a.id`,
  );
  if (rows.length === 0) return [];
  const summaries = new Map((await listOrders(ALL, conn)).map((order) => [order.number, order]));
  const pending: PendingApproval[] = [];
  for (const row of rows) {
    const number = String(row.number);
    const summary = summaries.get(number);
    const order = await getOrder(number, ALL, conn);
    if (!summary || !order) continue;
    const { band } = await loadOrderStanding(order, conn);
    pending.push({
      order: summary,
      requestedBy: String(row.requested_by),
      requestedAt: row.requested_at as Date,
      reasons: row.reasons as ApprovalReason[],
      band,
      directorOnly: band !== null && needsDirector(band),
    });
  }
  return pending;
}

export type Decision = { approve: boolean; comment: string | null };

export type Decider = {
  email: string;
  role: "DIRETORIA" | "GERENTE_COMERCIAL";
  /** From `approvesAtLoss` of the session: never from the form. */
  approvesAtLoss: boolean;
};

const GONE = "Este pedido não está mais aguardando aprovação. Atualize a página.";

/**
 * Approves or refuses. Approved, the order closes, with the closing recorded;
 * refused, it goes back to negotiation with the reason. Order, request and
 * closing change in one statement, and only if the order is still as it was read.
 */
export async function decideApproval(number: string, decision: Decision, who: Decider, conn: Queryable): Promise<void> {
  if (who.email.trim() === "") throw new Error("Falta dizer quem está decidindo.");
  const comment = decision.comment?.trim() || null;
  if (!decision.approve && comment === null) throw new OrderError("Para recusar, escreva o motivo: o vendedor precisa saber o que mudar.");

  const order = await getOrder(number, ALL, conn);
  if (!order || order.status !== "aguardando_aprovacao") throw new OrderError(GONE);
  const { band } = await loadOrderStanding(order, conn);
  if (decision.approve && (band === null || (needsDirector(band) && !who.approvesAtLoss))) {
    throw new OrderError("Este pedido dá prejuízo: só a diretoria pode aprovar. Você pode recusar, com o motivo.");
  }
  const table = await loadPublishedTable(order.priceTableVersion, conn);
  if (!table) throw new Error(`Tabela v${order.priceTableVersion} não encontrada.`);
  const sale = saleOf(order, table);
  const { invoiceTotal } = sale;
  const plan = receivableColumns(paymentOf(order, sale, table, isoDate(new Date())));

  const { rows } = await conn.query(
    `WITH target AS (
       UPDATE orders
          SET status = $2, closed_at = CASE WHEN $2 = 'fechado' THEN now() END, updated_at = now(), updated_by = $3
        WHERE number = $1 AND status = 'aguardando_aprovacao' AND updated_at::text = $4
        RETURNING id, status
     ), decided AS (
       UPDATE order_approvals a
          SET status = $5, decided_at = now(), decided_by = $3, decided_role = $6, comment = $7
         FROM target
        WHERE a.order_id = target.id AND a.status = 'pendente'
     ), recorded AS (
       INSERT INTO order_closings (order_id, closed_by, invoice_total)
       SELECT id, $3, $8::numeric FROM target WHERE status = 'fechado'
     ), receivable AS (
       -- What the order expects to receive, from the plan. Closing again after a reopening
       -- rewrites what was not received yet.
       INSERT INTO receivables (order_id, kind, number, due_date, amount, method, updated_by)
       SELECT target.id, plan.kind, plan.number, plan.due_date::date, plan.amount, plan.method, $3
         FROM target,
              unnest($9::text[], $10::int[], $11::text[], $12::numeric[], $13::text[]) AS plan (kind, number, due_date, amount, method)
        WHERE target.status = 'fechado'
       ON CONFLICT (order_id, kind, number) DO UPDATE
          SET due_date = EXCLUDED.due_date, amount = EXCLUDED.amount, method = EXCLUDED.method,
              status = 'aberta', updated_at = now(), updated_by = EXCLUDED.updated_by
        WHERE receivables.status <> 'recebida'
     )
     SELECT id FROM target`,
    [
      number,
      decision.approve ? "fechado" : "em_negociacao",
      who.email,
      order.revision,
      decision.approve ? "aprovado" : "reprovado",
      who.role,
      comment,
      invoiceTotal,
      plan.kinds,
      plan.numbers,
      plan.dueDates,
      plan.amounts,
      plan.methods,
    ],
  );
  if (rows.length === 0) throw new OrderError(GONE);
}

export type PastDecision = {
  number: string;
  customerName: string | null;
  approved: boolean;
  decidedBy: string;
  decidedAt: Date;
  comment: string | null;
};

const past = (row: Record<string, unknown>): PastDecision => ({
  number: String(row.number),
  customerName: row.customer_name === null ? null : String(row.customer_name),
  approved: row.status === "aprovado",
  decidedBy: String(row.decided_by),
  decidedAt: row.decided_at as Date,
  comment: row.comment === null ? null : String(row.comment),
});

/** Fixed text: the two readings below differ only in their filter, which goes by parameter. */
const PAST = `SELECT o.number, COALESCE(c.trade_name, c.name) AS customer_name, a.status, a.decided_by, a.decided_at, a.comment
                FROM order_approvals a
                JOIN orders o ON o.id = a.order_id
                LEFT JOIN customers c ON c.id = o.customer_id
               WHERE a.status <> 'pendente'
                 AND ($1::text IS NULL OR o.number = $1)
                 AND ($2::text IS NULL OR o.seller_email = $2)
               ORDER BY a.decided_at DESC, a.id DESC
               LIMIT $3`;

/** The latest decisions, newest first. */
export async function listPastDecisions(limit: number, conn: Queryable): Promise<PastDecision[]> {
  const { rows } = await conn.query(PAST, [null, null, limit]);
  return rows.map(past);
}

/** The last decision on an order the scope reaches, for the order's own page. `null` without any. */
export async function lastDecision(number: string, scope: { sellerEmail: string | null }, conn: Queryable): Promise<PastDecision | null> {
  const { rows } = await conn.query(PAST, [number, scope.sellerEmail, 1]);
  return rows.length === 0 ? null : past(rows[0]);
}

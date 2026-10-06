import { loadCommissionDay } from "@/lib/db/company";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { commissionBase, commissionCompetence, commissionOn, commissionPaymentDate } from "@/lib/pricing/commission";
import { roundCents } from "@/lib/pricing/money";
import { parseDate } from "@/lib/pricing/payment";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class ReceivableError extends Error {}

/** One amount a closed order still expects, or already received. */
export type Receivable = {
  id: number;
  orderNumber: string;
  customerName: string | null;
  sellerName: string;
  /** `Entrada`, `1/3`, `2/3`… */
  label: string;
  /** `AAAA-MM-DD`. */
  dueDate: string | null;
  amount: number;
  method: string | null;
};

const LIST = `SELECT r.id, o.number AS order_number, COALESCE(c.trade_name, c.name) AS customer_name, o.seller_name,
                     r.kind, r.number, to_char(r.due_date, 'YYYY-MM-DD') AS due_date, r.amount, r.method,
                     (SELECT count(*) FROM receivables p WHERE p.order_id = r.order_id AND p.kind = 'parcela' AND p.status <> 'cancelada') AS parts
                FROM receivables r
                JOIN orders o ON o.id = r.order_id
                LEFT JOIN customers c ON c.id = o.customer_id
               WHERE r.status = 'aberta' AND o.status = 'fechado'
               ORDER BY r.due_date NULLS LAST, o.number, r.number`;

/** Everything still to be received from closed orders, the oldest due date first. */
export async function listOpenReceivables(conn: Queryable): Promise<Receivable[]> {
  const { rows } = await conn.query(LIST);
  return rows.map((row) => ({
    id: Number(row.id),
    orderNumber: String(row.order_number),
    customerName: row.customer_name === null ? null : String(row.customer_name),
    sellerName: String(row.seller_name),
    label: row.kind === "entrada" ? "Entrada" : `${row.number}/${row.parts}`,
    dueDate: row.due_date === null ? null : String(row.due_date),
    amount: Number(row.amount),
    method: row.method === null ? null : String(row.method),
  }));
}

export type ReceiptInput = {
  /** `AAAA-MM-DD`: the day the money came in. */
  receivedOn: string;
  method: string | null;
  note: string | null;
};

/**
 * "Dar baixa": the whole amount of one receivable came in. The receivable, the
 * receipt and the seller's commission are written in one statement. The rates
 * (IPI and commission) are the ones of the table version of the order. `today`
 * is the day in São Paulo: nothing is received in the future.
 */
export async function recordReceipt(id: number, input: ReceiptInput, who: string, today: string, conn: Queryable): Promise<{ commission: number }> {
  if (who.trim() === "") throw new Error("Falta dizer quem está dando a baixa.");
  let received: number;
  try {
    received = parseDate(input.receivedOn);
  } catch {
    throw new ReceivableError("Informe a data do recebimento.");
  }
  if (received > parseDate(today)) throw new ReceivableError("A data do recebimento não pode ser no futuro.");

  const found = await conn.query(
    `SELECT r.amount, r.status, o.status AS order_status, v.ipi, v.commission
       FROM receivables r
       JOIN orders o ON o.id = r.order_id
       JOIN price_table_versions v ON v.version = o.price_table_version
      WHERE r.id = $1`,
    [id],
  );
  const row = found.rows[0];
  if (!row || row.status !== "aberta" || row.order_status !== "fechado") {
    throw new ReceivableError("Este valor não está mais em aberto. Atualize a página.");
  }
  const amount = Number(row.amount);
  const rates = { ipi: Number(row.ipi), commission: Number(row.commission) };
  const paymentDay = await loadCommissionDay(conn);
  const base = roundCents(commissionBase(amount, rates));
  const commission = roundCents(commissionOn(amount, rates));

  const { rows } = await conn.query(
    `WITH settled AS (
       UPDATE receivables SET status = 'recebida', updated_at = now(), updated_by = $2
        WHERE id = $1 AND status = 'aberta'
        RETURNING id, order_id
     ), receipt AS (
       INSERT INTO receipts (receivable_id, received_at, amount, amount_without_ipi, method, note, recorded_by)
       SELECT id, ($3::date + time '12:00') AT TIME ZONE 'America/Sao_Paulo', $4::numeric, $5::numeric, $6, $7, $2 FROM settled
       RETURNING id
     ), commission AS (
       INSERT INTO commissions (seller_email, receipt_id, competence, base_amount, rate, amount, payment_due)
       SELECT o.seller_email, receipt.id, $8::date, $5::numeric, $9::numeric, $10::numeric, $11::date
         FROM receipt, settled JOIN orders o ON o.id = settled.order_id
     )
     SELECT id FROM settled`,
    [
      id,
      who,
      input.receivedOn,
      amount,
      base,
      input.method?.trim() || null,
      input.note?.trim() || null,
      commissionCompetence(input.receivedOn),
      rates.commission,
      commission,
      commissionPaymentDate(input.receivedOn, paymentDay),
    ],
  );
  if (rows.length === 0) throw new ReceivableError("Este valor não está mais em aberto. Atualize a página.");
  return { commission };
}

/** Where a receipt stands: it counts, it has a refund waiting for the directors, or it was refunded. */
export type ReceiptState = "valido" | "estorno-pedido" | "estornado";

export type PastReceipt = {
  id: number;
  orderNumber: string;
  customerName: string | null;
  sellerName: string;
  /** `Entrada`, `Parcela 1`… */
  label: string;
  /** `AAAA-MM-DD`, in São Paulo. */
  receivedOn: string;
  amount: number;
  method: string | null;
  commission: number;
  recordedBy: string;
  state: ReceiptState;
};

const RECEIPTS = `SELECT p.id, o.number AS order_number, COALESCE(c.trade_name, c.name) AS customer_name, o.seller_name,
                         r.kind, r.number,
                         to_char(p.received_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS received_on,
                         p.amount, p.method, COALESCE(m.amount, 0) AS commission, p.recorded_by,
                         (SELECT q.status FROM refund_requests q WHERE q.receipt_id = p.id AND q.status <> 'recusada') AS refund
                    FROM receipts p
                    JOIN receivables r ON r.id = p.receivable_id
                    JOIN orders o ON o.id = r.order_id
                    LEFT JOIN customers c ON c.id = o.customer_id
                    LEFT JOIN commissions m ON m.receipt_id = p.id
                   ORDER BY p.received_at DESC, p.id DESC
                   LIMIT $1`;

/** The latest receipts, newest first. */
export async function listReceipts(limit: number, conn: Queryable): Promise<PastReceipt[]> {
  const { rows } = await conn.query(RECEIPTS, [limit]);
  return rows.map((row) => ({
    id: Number(row.id),
    orderNumber: String(row.order_number),
    customerName: row.customer_name === null ? null : String(row.customer_name),
    sellerName: String(row.seller_name),
    label: row.kind === "entrada" ? "Entrada" : `Parcela ${row.number}`,
    receivedOn: String(row.received_on),
    amount: Number(row.amount),
    method: row.method === null ? null : String(row.method),
    commission: Number(row.commission),
    recordedBy: String(row.recorded_by),
    state: row.refund === "confirmada" ? "estornado" : row.refund === "pendente" ? "estorno-pedido" : "valido",
  }));
}

const UNIQUE_VIOLATION = "23505";

/**
 * Asks for a receipt to be refunded, with the reason. Nothing changes yet: the
 * receipt goes on counting until the directors confirm.
 */
export async function requestRefund(receiptId: number, reason: string, who: string, conn: Queryable): Promise<void> {
  if (who.trim() === "") throw new Error("Falta dizer quem está pedindo o estorno.");
  if (reason.trim() === "") throw new ReceivableError("Escreva o motivo do estorno.");
  try {
    const { rows } = await conn.query(
      `INSERT INTO refund_requests (order_id, receivable_id, receipt_id, amount, reason, requested_by)
       SELECT r.order_id, r.id, p.id, p.amount, $2, $3
         FROM receipts p JOIN receivables r ON r.id = p.receivable_id
        WHERE p.id = $1 AND r.status = 'recebida'
       RETURNING id`,
      [receiptId, reason.trim(), who],
    );
    if (rows.length === 0) throw new ReceivableError("Recebimento não encontrado, ou já estornado.");
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new ReceivableError("Este recebimento já tem estorno pedido ou confirmado.");
    throw error;
  }
}

/** A refund waiting for the directors. */
export type PendingRefund = {
  id: number;
  orderNumber: string;
  customerName: string | null;
  sellerName: string;
  label: string;
  /** `AAAA-MM-DD`: when the money had come in. */
  receivedOn: string;
  amount: number;
  reason: string;
  requestedBy: string;
  requestedAt: Date;
};

const PENDING_REFUNDS = `SELECT q.id, o.number AS order_number, COALESCE(c.trade_name, c.name) AS customer_name, o.seller_name,
                                r.kind, r.number, to_char(p.received_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS received_on,
                                q.amount, q.reason, q.requested_by, q.requested_at
                           FROM refund_requests q
                           JOIN receipts p ON p.id = q.receipt_id
                           JOIN receivables r ON r.id = q.receivable_id
                           JOIN orders o ON o.id = q.order_id
                           LEFT JOIN customers c ON c.id = o.customer_id
                          WHERE q.status = 'pendente'
                          ORDER BY q.requested_at, q.id`;

export async function listPendingRefunds(conn: Queryable): Promise<PendingRefund[]> {
  const { rows } = await conn.query(PENDING_REFUNDS);
  return rows.map((row) => ({
    id: Number(row.id),
    orderNumber: String(row.order_number),
    customerName: row.customer_name === null ? null : String(row.customer_name),
    sellerName: String(row.seller_name),
    label: row.kind === "entrada" ? "Entrada" : `Parcela ${row.number}`,
    receivedOn: String(row.received_on),
    amount: Number(row.amount),
    reason: String(row.reason),
    requestedBy: String(row.requested_by),
    requestedAt: row.requested_at as Date,
  }));
}

const DECIDED = "Este pedido de estorno já foi decidido. Atualize a página.";

/**
 * The directors' answer to a refund. Confirmed: the refund is written (negative),
 * the amount is to be received again and the seller's commission is taken back
 * with a negative entry in the month of `today`. Refused: only the request changes.
 * The receipt itself is never changed nor deleted. Everything in one statement.
 */
export async function decideRefund(requestId: number, confirm: boolean, who: string, today: string, conn: Queryable): Promise<void> {
  if (who.trim() === "") throw new Error("Falta dizer quem está decidindo o estorno.");
  parseDate(today);

  if (!confirm) {
    const { rows } = await conn.query(
      "UPDATE refund_requests SET status = 'recusada', decided_at = now(), decided_by = $2 WHERE id = $1 AND status = 'pendente' RETURNING id",
      [requestId, who],
    );
    if (rows.length === 0) throw new ReceivableError(DECIDED);
    return;
  }

  const found = await conn.query(
    `SELECT q.amount, p.amount_without_ipi AS base, COALESCE(m.rate, 0) AS rate, COALESCE(m.amount, 0) AS commission
       FROM refund_requests q
       JOIN receipts p ON p.id = q.receipt_id
       LEFT JOIN commissions m ON m.receipt_id = p.id
      WHERE q.id = $1 AND q.status = 'pendente'`,
    [requestId],
  );
  const row = found.rows[0];
  if (!row) throw new ReceivableError(DECIDED);
  const paymentDay = await loadCommissionDay(conn);

  // The commission taken back is exactly the one the receipt had given, with the same rate and base.
  const { rows } = await conn.query(
    `WITH confirmed AS (
       UPDATE refund_requests SET status = 'confirmada', decided_at = now(), decided_by = $2
        WHERE id = $1 AND status = 'pendente'
        RETURNING id, order_id, receivable_id, amount, reason, requested_by
     ), reopened AS (
       UPDATE receivables r SET status = 'aberta', updated_at = now(), updated_by = $2
         FROM confirmed WHERE r.id = confirmed.receivable_id AND r.status = 'recebida'
     ), refund AS (
       INSERT INTO refunds (refund_request_id, order_id, receivable_id, refunded_at, amount, amount_without_ipi, reason, requested_by, confirmed_by)
       SELECT id, order_id, receivable_id, now(), -amount, -($3::numeric), reason, requested_by, $2 FROM confirmed
       RETURNING id, order_id
     ), commission AS (
       INSERT INTO commissions (seller_email, refund_id, competence, base_amount, rate, amount, payment_due)
       SELECT o.seller_email, refund.id, $4::date, -($3::numeric), $5::numeric, -($6::numeric), $7::date
         FROM refund JOIN orders o ON o.id = refund.order_id
     )
     SELECT id FROM confirmed`,
    [requestId, who, Number(row.base), commissionCompetence(today), Number(row.rate), Number(row.commission), commissionPaymentDate(today, paymentDay)],
  );
  if (rows.length === 0) throw new ReceivableError(DECIDED);
}

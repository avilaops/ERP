import { loadCommissionDay } from "@/lib/db/company";
import { withQueryableConnection } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { commissionPaymentDate } from "@/lib/pricing/commission";
import { roundCents } from "@/lib/pricing/money";
import { parseDate } from "@/lib/pricing/payment";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class CommissionError extends Error {}

/** One line of a seller's commission: a receipt (positive) or a refund (negative). */
export type CommissionEntry = {
  id: number;
  /** recebimento and estorno follow the money. manual is an administrative entry. */
  origin: "recebimento" | "estorno" | "manual";
  cancelled: boolean;
  sellerEmail: string;
  sellerName: string;
  orderNumber: string;
  customerName: string | null;
  refund: boolean;
  /** `AAAA-MM-DD`, in São Paulo: when the money came in or was given back. */
  happenedOn: string;
  /** What the commission was calculated on: the amount without IPI. */
  base: number;
  rate: number;
  amount: number;
  /** `AAAA-MM-DD`. */
  paymentDue: string;
  paidAt: Date | null;
  paidBy: string | null;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `AAAA-MM` → the first day, as the competence is stored. Anything else is an error. */
function competenceOf(month: string): string {
  if (!MONTH.test(month)) throw new Error(`Mês inválido: "${month}". Use AAAA-MM.`);
  parseDate(`${month}-01`);
  return `${month}-01`;
}

const ENTRIES = `SELECT m.id, m.seller_email, COALESCE(o.seller_name, u.name, m.seller_email) AS seller_name,
                        COALESCE(o.number, '') AS order_number, COALESCE(c.trade_name, c.name) AS customer_name,
                        (m.refund_id IS NOT NULL OR m.amount < 0) AS refund,
                        CASE WHEN m.adjustment_id IS NOT NULL THEN 'manual' WHEN m.refund_id IS NOT NULL THEN 'estorno' ELSE 'recebimento' END AS origin,
                        m.cancelled_at IS NOT NULL AS cancelled,
                        to_char(COALESCE(p.received_at, f.refunded_at, m.created_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS happened_on,
                        m.base_amount, m.rate, m.amount, to_char(m.payment_due, 'YYYY-MM-DD') AS payment_due, m.paid_at, m.paid_by
                   FROM commissions m
                   LEFT JOIN receipts p ON p.id = m.receipt_id
                   LEFT JOIN receivables r ON r.id = p.receivable_id
                   LEFT JOIN refunds f ON f.id = m.refund_id
                   LEFT JOIN commission_adjustments a ON a.id = m.adjustment_id
                   LEFT JOIN orders o ON o.id = COALESCE(r.order_id, f.order_id, a.order_id)
                   LEFT JOIN customers c ON c.id = o.customer_id
                   LEFT JOIN users u ON u.email = m.seller_email
                  WHERE m.competence = $1::date AND ($2::text IS NULL OR m.seller_email = $2)
                  ORDER BY lower(COALESCE(o.seller_name, u.name, m.seller_email)), m.seller_email, COALESCE(p.received_at, f.refunded_at, m.created_at), m.id`;

/**
 * The commissions of one month. `sellerEmail` is the scope: a seller receives
 * only their own lines from the database; `null` is everyone.
 */
export async function listCommissions(month: string, sellerEmail: string | null, conn: Queryable): Promise<CommissionEntry[]> {
  const { rows } = await conn.query(ENTRIES, [competenceOf(month), sellerEmail]);
  return rows.map((row) => ({
    id: Number(row.id),
    origin: row.origin as CommissionEntry["origin"],
    cancelled: row.cancelled === true,
    sellerEmail: String(row.seller_email),
    sellerName: String(row.seller_name),
    orderNumber: String(row.order_number),
    customerName: row.customer_name === null ? null : String(row.customer_name),
    refund: row.refund === true,
    happenedOn: String(row.happened_on),
    base: Number(row.base_amount),
    rate: Number(row.rate),
    amount: Number(row.amount),
    paymentDue: String(row.payment_due),
    paidAt: row.paid_at as Date | null,
    paidBy: row.paid_by === null ? null : String(row.paid_by),
  }));
}

/** The months that have any commission in the scope, newest first, as `AAAA-MM`. */
export async function listCommissionMonths(sellerEmail: string | null, conn: Queryable): Promise<string[]> {
  const { rows } = await conn.query(
    `SELECT DISTINCT to_char(competence, 'YYYY-MM') AS month FROM commissions
      WHERE ($1::text IS NULL OR seller_email = $1) ORDER BY month DESC`,
    [sellerEmail],
  );
  return rows.map((row) => String(row.month));
}

/**
 * What each seller still has open from the months before `month`: a refund
 * that came after the payment, or a month nobody paid. It goes into the next payment.
 */
export async function listCarriedBalances(month: string, sellerEmail: string | null, conn: Queryable): Promise<Map<string, number>> {
  const { rows } = await conn.query(
    `SELECT seller_email, sum(amount) AS total FROM commissions
      WHERE competence < $1::date AND paid_at IS NULL AND cancelled_at IS NULL AND ($2::text IS NULL OR seller_email = $2)
      GROUP BY seller_email HAVING sum(amount) <> 0`,
    [competenceOf(month), sellerEmail],
  );
  return new Map(rows.map((row) => [String(row.seller_email), Number(row.total)]));
}

/**
 * "Marcar como paga": everything of one seller that is open up to the end of
 * `month`, the earlier months included, so a refund comes off the next payment.
 * Answers with how much was paid. With a balance that is not positive there is
 * nothing to pay, and the lines stay open.
 */
export async function payCommissions(sellerEmail: string, month: string, who: string, conn: Queryable): Promise<{ paid: number; entries: number }> {
  if (who.trim() === "") throw new Error("Falta dizer quem está pagando a comissão.");
  const { rows } = await conn.query(
    `WITH due AS (
       SELECT id, amount FROM commissions WHERE seller_email = $1 AND competence <= $2::date AND paid_at IS NULL AND cancelled_at IS NULL
     ), paid AS (
       UPDATE commissions m SET paid_at = now(), paid_by = $3
         FROM due WHERE m.id = due.id AND (SELECT sum(amount) FROM due) > 0
        RETURNING m.amount
     )
     SELECT (SELECT count(*)::int FROM due) AS open, (SELECT count(*)::int FROM paid) AS entries, (SELECT COALESCE(sum(amount), 0) FROM paid) AS total`,
    [sellerEmail.trim().toLowerCase(), competenceOf(month), who],
  );
  const result = rows[0];
  if (Number(result.open) === 0) throw new CommissionError("Não há comissão em aberto deste vendedor até este mês.");
  if (Number(result.entries) === 0) throw new CommissionError("O saldo em aberto não é positivo: não há o que pagar. Os estornos descontam do próximo pagamento.");
  return { paid: Number(result.total), entries: Number(result.entries) };
}

const ORDER_NUMBER = /^[0-9]{6}-[A-Z0-9]{4}$/;

export type ManualCommissionInput = {
  orderNumber: string;
  /** Positive reais. The direction decides the sign stored. */
  amount: number;
  direction: "credito" | "debito";
  /** `AAAA-MM`. */
  month: string;
  reason: string;
};

function manualAmount(amount: number, direction: ManualCommissionInput["direction"]): number {
  if (direction !== "credito" && direction !== "debito") throw new CommissionError("Escolha crédito ou débito.");
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) throw new CommissionError("Informe um valor em reais maior que zero.");
  return direction === "debito" ? -roundCents(amount) : roundCents(amount);
}

function assertManualReason(reason: string, who: string): string {
  const clean = reason.trim();
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando a comissão.");
  if (clean.length < 10) throw new CommissionError("Explique o motivo com pelo menos 10 caracteres.");
  return clean;
}

async function inTransaction<T>(conn: Queryable, run: (held: Queryable) => Promise<T>): Promise<T> {
  return withQueryableConnection(conn, async (held) => {
    await held.query("BEGIN");
    try {
      const result = await run(held);
      await held.query("COMMIT");
      return result;
    } catch (error) {
      await held.query("ROLLBACK");
      throw error;
    }
  });
}

/**
 * An administrative commission that did not come from a receipt. It stays tied
 * to the seller of the order. A credit is owed; a debit comes off the next payment.
 * The adjustment and the commission line commit together.
 */
export async function createManualCommission(input: ManualCommissionInput, who: string, conn: Queryable): Promise<number> {
  const reason = assertManualReason(input.reason, who);
  const signed = manualAmount(input.amount, input.direction);
  const competence = competenceOf(input.month);
  const orderNumber = input.orderNumber.trim().toUpperCase();
  if (!ORDER_NUMBER.test(orderNumber)) throw new CommissionError("Número do pedido fora do formato AAMMDD-XXXX.");
  return inTransaction(conn, async (held) => {
    const found = await held.query("SELECT id, seller_email FROM orders WHERE number = $1 FOR UPDATE", [orderNumber]);
    if (!found.rows[0]) throw new CommissionError("Pedido não encontrado.");
    const seller = String(found.rows[0].seller_email).trim().toLowerCase();
    if (!seller.includes("@")) throw new CommissionError("O pedido não tem um vendedor com e-mail válido.");
    const paymentDue = commissionPaymentDate(competence, await loadCommissionDay(held));
    const adjustment = await held.query(
      `INSERT INTO commission_adjustments (seller_email, order_id, action, amount, reason, changed_by)
       VALUES ($1, $2, 'incluir', $3, $4, $5) RETURNING id`,
      [seller, found.rows[0].id, signed, reason, who],
    );
    const written = await held.query(
      `-- gravar-comissao-manual
       INSERT INTO commissions (seller_email, adjustment_id, competence, base_amount, rate, amount, payment_due)
       VALUES ($1, $2, $3::date, $4, 0, $4, $5::date) RETURNING id`,
      [seller, adjustment.rows[0].id, competence, signed, paymentDue],
    );
    return Number(written.rows[0].id);
  });
}

/** Changes the amount of an unpaid manual commission. Receipt lines are corrected by a refund. */
export async function updateManualCommission(id: number, input: { amount: number; direction: "credito" | "debito"; reason: string }, who: string, conn: Queryable): Promise<void> {
  const reason = assertManualReason(input.reason, who);
  const signed = manualAmount(input.amount, input.direction);
  if (!Number.isSafeInteger(id) || id < 1) throw new CommissionError("Comissão inválida.");
  await inTransaction(conn, async (held) => {
    const current = await held.query(
      `SELECT m.id, m.seller_email, a.order_id
         FROM commissions m JOIN commission_adjustments a ON a.id = m.adjustment_id
        WHERE m.id = $1 AND m.paid_at IS NULL AND m.cancelled_at IS NULL
        FOR UPDATE OF m`,
      [id],
    );
    if (!current.rows[0]) throw new CommissionError("Só uma comissão manual, em aberto e não cancelada, pode ser alterada. Comissão de recebimento se corrige pelo estorno.");
    const adjustment = await held.query(
      `INSERT INTO commission_adjustments (seller_email, order_id, action, amount, reason, changed_by)
       VALUES ($1, $2, 'editar', $3, $4, $5) RETURNING id`,
      [String(current.rows[0].seller_email).trim().toLowerCase(), current.rows[0].order_id, signed, reason, who],
    );
    await held.query(
      `UPDATE commissions
          SET adjustment_id = $2, base_amount = $3, amount = $3
        WHERE id = $1 AND paid_at IS NULL AND cancelled_at IS NULL`,
      [id, adjustment.rows[0].id, signed],
    );
  });
}

/** Voids an unpaid manual commission. The line stays, so the month still shows what was launched. */
export async function cancelManualCommission(id: number, reason: string, who: string, conn: Queryable): Promise<void> {
  const clean = assertManualReason(reason, who);
  if (!Number.isSafeInteger(id) || id < 1) throw new CommissionError("Comissão inválida.");
  await inTransaction(conn, async (held) => {
    const current = await held.query(
      `SELECT m.id, m.seller_email, m.amount, a.order_id
         FROM commissions m JOIN commission_adjustments a ON a.id = m.adjustment_id
        WHERE m.id = $1 AND m.paid_at IS NULL AND m.cancelled_at IS NULL
        FOR UPDATE OF m`,
      [id],
    );
    if (!current.rows[0]) throw new CommissionError("Só uma comissão manual em aberto pode ser cancelada.");
    await held.query(
      `INSERT INTO commission_adjustments (seller_email, order_id, action, amount, reason, changed_by)
       VALUES ($1, $2, 'cancelar', $3, $4, $5)`,
      [String(current.rows[0].seller_email).trim().toLowerCase(), current.rows[0].order_id, current.rows[0].amount, clean, who],
    );
    const cancelled = await held.query(
      "UPDATE commissions SET cancelled_at = now(), cancelled_by = $2 WHERE id = $1 AND paid_at IS NULL AND cancelled_at IS NULL RETURNING id",
      [id, who],
    );
    if (cancelled.rows.length !== 1) throw new CommissionError("Só uma comissão manual em aberto pode ser cancelada.");
  });
}

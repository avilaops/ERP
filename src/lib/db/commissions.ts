import type { Queryable } from "@/lib/db/pool";
import { parseDate } from "@/lib/pricing/payment";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class CommissionError extends Error {}

/** One line of a seller's commission: a receipt (positive) or a refund (negative). */
export type CommissionEntry = {
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

const ENTRIES = `SELECT m.seller_email, o.seller_name, o.number AS order_number, COALESCE(c.trade_name, c.name) AS customer_name,
                        m.refund_id IS NOT NULL AS refund,
                        to_char(COALESCE(p.received_at, f.refunded_at) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS happened_on,
                        m.base_amount, m.rate, m.amount, to_char(m.payment_due, 'YYYY-MM-DD') AS payment_due, m.paid_at, m.paid_by
                   FROM commissions m
                   LEFT JOIN receipts p ON p.id = m.receipt_id
                   LEFT JOIN receivables r ON r.id = p.receivable_id
                   LEFT JOIN refunds f ON f.id = m.refund_id
                   JOIN orders o ON o.id = COALESCE(r.order_id, f.order_id)
                   LEFT JOIN customers c ON c.id = o.customer_id
                  WHERE m.competence = $1::date AND ($2::text IS NULL OR m.seller_email = $2)
                  ORDER BY lower(o.seller_name), m.seller_email, COALESCE(p.received_at, f.refunded_at), m.id`;

/**
 * The commissions of one month. `sellerEmail` is the scope: a seller receives
 * only their own lines from the database; `null` is everyone.
 */
export async function listCommissions(month: string, sellerEmail: string | null, conn: Queryable): Promise<CommissionEntry[]> {
  const { rows } = await conn.query(ENTRIES, [competenceOf(month), sellerEmail]);
  return rows.map((row) => ({
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
      WHERE competence < $1::date AND paid_at IS NULL AND ($2::text IS NULL OR seller_email = $2)
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
       SELECT id, amount FROM commissions WHERE seller_email = $1 AND competence <= $2::date AND paid_at IS NULL
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

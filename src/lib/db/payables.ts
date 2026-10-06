import type { Queryable } from "@/lib/db/pool";
import { assertAmount } from "@/lib/pricing/money";
import { parseDate } from "@/lib/pricing/payment";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class PayableError extends Error {}

export type PayableInput = {
  description: string;
  supplierId: number | null;
  category: string;
  amount: number;
  /** `AAAA-MM-DD`. */
  dueDate: string;
  method: string | null;
};

export type Payable = PayableInput & {
  id: number;
  supplierName: string | null;
  status: "aberta" | "paga";
  /** `AAAA-MM-DD`. */
  paidOn: string | null;
  paidAmount: number | null;
};

const COLUMNS = `p.id, p.description, p.supplier_id, COALESCE(s.trade_name, s.name) AS supplier_name, p.category, p.amount,
  to_char(p.due_date, 'YYYY-MM-DD') AS due_date, p.method, p.status, to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on, p.paid_amount`;

const payable = (row: Record<string, unknown>): Payable => ({
  id: Number(row.id),
  description: String(row.description),
  supplierId: row.supplier_id === null ? null : Number(row.supplier_id),
  supplierName: row.supplier_name === null ? null : String(row.supplier_name),
  category: String(row.category),
  amount: Number(row.amount),
  dueDate: String(row.due_date),
  method: row.method === null ? null : String(row.method),
  status: row.status as Payable["status"],
  paidOn: row.paid_on === null ? null : String(row.paid_on),
  paidAmount: row.paid_amount === null ? null : Number(row.paid_amount),
});

function date(value: string, label: string): void {
  try {
    parseDate(value);
  } catch {
    throw new PayableError(`${label}: informe uma data válida.`);
  }
}

function prepare(input: PayableInput, who: string): unknown[] {
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando a conta.");
  if (input.description.trim() === "") throw new PayableError("Informe a descrição da conta.");
  if (input.category.trim() === "") throw new PayableError("Escolha a categoria.");
  assertAmount(input.amount, "Valor");
  if (input.amount <= 0) throw new PayableError("Valor: informe um valor maior que zero.");
  date(input.dueDate, "Vencimento");
  return [input.description.trim(), input.supplierId, input.category.trim(), input.amount, input.dueDate, input.method?.trim() || null, who];
}

const ONE = `SELECT ${COLUMNS} FROM payables p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = $1`;

/** Every bill, the open ones first by due date, then the paid ones, newest payment first. */
export async function listPayables(conn: Queryable): Promise<Payable[]> {
  const { rows } = await conn.query(
    `SELECT ${COLUMNS} FROM payables p LEFT JOIN suppliers s ON s.id = p.supplier_id
      ORDER BY (p.status = 'paga'), CASE WHEN p.status = 'aberta' THEN p.due_date END, p.paid_on DESC, p.id`,
  );
  return rows.map(payable);
}

export async function createPayable(input: PayableInput, who: string, conn: Queryable): Promise<Payable> {
  const values = prepare(input, who);
  const { rows } = await conn.query(
    `INSERT INTO payables (description, supplier_id, category, amount, due_date, method, updated_by)
     VALUES ($1, $2, $3, $4, $5::date, $6, $7) RETURNING id`,
    values,
  );
  return payable((await conn.query(ONE, [rows[0].id])).rows[0]);
}

const NOT_OPEN = "Conta não encontrada ou já paga. Desfaça o pagamento para alterar.";

/** Changes a bill that was not paid yet. */
export async function updatePayable(id: number, input: PayableInput, who: string, conn: Queryable): Promise<Payable> {
  const values = prepare(input, who);
  const { rows } = await conn.query(
    `UPDATE payables SET description = $1, supplier_id = $2, category = $3, amount = $4, due_date = $5::date, method = $6,
            updated_at = now(), updated_by = $7
      WHERE id = $8 AND status = 'aberta' RETURNING id`,
    [...values, id],
  );
  if (rows.length === 0) throw new PayableError(NOT_OPEN);
  return payable((await conn.query(ONE, [id])).rows[0]);
}

export type PaymentInput = { paidOn: string; paidAmount: number; method: string | null };

/** "Pagar": the day, how much actually left (interest or discount included) and how. `today` is the day in São Paulo. */
export async function payPayable(id: number, payment: PaymentInput, who: string, today: string, conn: Queryable): Promise<void> {
  if (who.trim() === "") throw new Error("Falta dizer quem está pagando a conta.");
  date(payment.paidOn, "Pago em");
  if (parseDate(payment.paidOn) > parseDate(today)) throw new PayableError("A data do pagamento não pode ser no futuro.");
  assertAmount(payment.paidAmount, "Valor pago");
  if (payment.paidAmount <= 0) throw new PayableError("Valor pago: informe um valor maior que zero.");
  const { rows } = await conn.query(
    `UPDATE payables SET status = 'paga', paid_on = $2::date, paid_amount = $3, method = COALESCE($4, method), updated_at = now(), updated_by = $5
      WHERE id = $1 AND status = 'aberta' RETURNING id`,
    [id, payment.paidOn, payment.paidAmount, payment.method?.trim() || null, who],
  );
  if (rows.length === 0) throw new PayableError("Conta não encontrada ou já paga.");
}

/** "Desfazer pagamento": the bill is open again, as it was. */
export async function unpayPayable(id: number, who: string, conn: Queryable): Promise<void> {
  if (who.trim() === "") throw new Error("Falta dizer quem está desfazendo o pagamento.");
  const { rows } = await conn.query(
    `UPDATE payables SET status = 'aberta', paid_on = NULL, paid_amount = NULL, updated_at = now(), updated_by = $2
      WHERE id = $1 AND status = 'paga' RETURNING id`,
    [id, who],
  );
  if (rows.length === 0) throw new PayableError("Conta não encontrada ou ainda não paga.");
}

/** Removes a bill written by mistake. A paid one is not removed: the payment is undone first. */
export async function deletePayable(id: number, conn: Queryable): Promise<{ description: string }> {
  const { rows } = await conn.query("DELETE FROM payables WHERE id = $1 AND status = 'aberta' RETURNING description", [id]);
  if (rows.length === 0) throw new PayableError("Conta não encontrada ou já paga: conta paga não se exclui.");
  return { description: String(rows[0].description) };
}

/** A commission the company still owes a seller: one line per seller and month, never stored as a bill. */
export type CommissionDue = { sellerEmail: string; sellerName: string; month: string; dueDate: string; amount: number };

/**
 * What is open in commissions, by seller and month, for Contas a pagar to show
 * next to the bills. It is paid in Comissões, never here.
 */
export async function listCommissionsDue(conn: Queryable): Promise<CommissionDue[]> {
  const { rows } = await conn.query(
    `SELECT m.seller_email, to_char(m.competence, 'YYYY-MM') AS month, to_char(max(m.payment_due), 'YYYY-MM-DD') AS due_date,
            sum(m.amount) AS amount,
            (SELECT o.seller_name FROM orders o WHERE o.seller_email = m.seller_email ORDER BY o.id DESC LIMIT 1) AS seller_name
       FROM commissions m
      WHERE m.paid_at IS NULL
      GROUP BY m.seller_email, m.competence
     HAVING sum(m.amount) <> 0
      ORDER BY max(m.payment_due), m.seller_email`,
  );
  return rows.map((row) => ({
    sellerEmail: String(row.seller_email),
    sellerName: String(row.seller_name ?? row.seller_email),
    month: String(row.month),
    dueDate: String(row.due_date),
    amount: Number(row.amount),
  }));
}

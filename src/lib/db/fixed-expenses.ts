import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { assertAmount } from "@/lib/pricing/money";
import { parseDate } from "@/lib/pricing/payment";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class FixedExpenseError extends Error {}

/** One expense the company has every month. */
export type FixedExpenseInput = { label: string; category: string; amount: number; dueDay: number; active: boolean };
export type FixedExpense = FixedExpenseInput & { id: number };

const UNIQUE_VIOLATION = "23505";
const DUPLICATE = "Já existe uma despesa fixa com este nome.";
const COLUMNS = "id, label, category, amount, due_day, active";
/** The total of the list is the parameter the break-even is calculated with: both change in the same statement. */
const SYNC = `UPDATE pricing_params SET fixed_monthly_expenses = (SELECT COALESCE(sum(amount), 0) FROM fixed_expenses WHERE active)`;

const expense = (row: Record<string, unknown>): FixedExpense => ({
  id: Number(row.id),
  label: String(row.label),
  category: String(row.category),
  amount: Number(row.amount),
  dueDay: Number(row.due_day),
  active: row.active === true,
});

function prepare(input: FixedExpenseInput, who: string): unknown[] {
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando as despesas fixas.");
  if (input.label.trim() === "") throw new FixedExpenseError("Informe o nome da despesa.");
  if (input.category.trim() === "") throw new FixedExpenseError("Escolha a categoria.");
  try {
    assertAmount(input.amount, "Valor");
  } catch {
    throw new FixedExpenseError("Valor: informe um valor em reais maior que zero.");
  }
  if (input.amount <= 0) throw new FixedExpenseError("Valor: informe um valor em reais maior que zero.");
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 28) {
    throw new FixedExpenseError("Dia do vencimento: informe um número inteiro de 1 a 28.");
  }
  return [input.label.trim(), input.category.trim(), input.amount, input.dueDay, input.active, who];
}

/** Every fixed expense, the ones in use first, by due day. */
export async function listFixedExpenses(conn: Queryable): Promise<FixedExpense[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM fixed_expenses ORDER BY active DESC, due_day, lower(label)`);
  return rows.map(expense);
}

export async function createFixedExpense(input: FixedExpenseInput, who: string, conn: Queryable): Promise<void> {
  const values = prepare(input, who);
  try {
    await conn.query(
      `WITH added AS (
         INSERT INTO fixed_expenses (label, category, amount, due_day, active, updated_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING amount, active
       )
       UPDATE pricing_params
          SET fixed_monthly_expenses = (SELECT COALESCE(sum(amount), 0) FROM fixed_expenses WHERE active)
                                     + (SELECT COALESCE(sum(amount), 0) FROM added WHERE active)`,
      values,
    );
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new FixedExpenseError(DUPLICATE);
    throw error;
  }
}

/** Changes or turns off. Nothing is deleted: the bills already launched keep pointing to their expense. */
export async function updateFixedExpense(id: number, input: FixedExpenseInput, who: string, conn: Queryable): Promise<void> {
  const values = prepare(input, who);
  try {
    const { rows } = await conn.query(
      `UPDATE fixed_expenses SET label = $1, category = $2, amount = $3, due_day = $4, active = $5, updated_at = now(), updated_by = $6
        WHERE id = $7 RETURNING id`,
      [...values, id],
    );
    if (rows.length === 0) throw new FixedExpenseError("Despesa fixa não encontrada.");
    // A second statement on purpose: it has to read the list as the change left it.
    await conn.query(SYNC);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new FixedExpenseError(DUPLICATE);
    throw error;
  }
}

/**
 * "Lançar despesas fixas do mês": one bill for each expense in use, due on its
 * day of `month` (`AAAA-MM`). An expense already launched for the month is
 * skipped, so launching twice writes nothing the second time.
 */
export async function launchFixedExpenses(month: string, who: string, conn: Queryable): Promise<{ launched: number }> {
  if (who.trim() === "") throw new Error("Falta dizer quem está lançando as despesas.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Mês inválido: "${month}". Use AAAA-MM.`);
  parseDate(`${month}-01`);
  const { rows } = await conn.query(
    `INSERT INTO payables (description, category, amount, due_date, fixed_expense_id, reference_month, updated_by)
     SELECT f.label || ' (' || to_char($1::date, 'MM/YYYY') || ')', f.category, f.amount, $1::date + (f.due_day - 1), f.id, $1::date, $2
       FROM fixed_expenses f
      WHERE f.active
     ON CONFLICT (fixed_expense_id, reference_month) WHERE fixed_expense_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [`${month}-01`, who],
  );
  return { launched: rows.length };
}

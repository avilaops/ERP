import type { Queryable } from "@/lib/db/pool";
import { assertAmount } from "@/lib/pricing/money";
import { parseDate } from "@/lib/pricing/payment";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class GoalError extends Error {}

/** How much is to be sold in a month: by one seller, or by the whole team (`sellerEmail` null). */
export type SalesGoal = { sellerEmail: string | null; amount: number };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
function firstDay(month: string): string {
  if (!MONTH.test(month)) throw new Error(`Mês inválido: "${month}". Use AAAA-MM.`);
  parseDate(`${month}-01`);
  return `${month}-01`;
}

export async function listGoals(month: string, conn: Queryable): Promise<SalesGoal[]> {
  const { rows } = await conn.query("SELECT seller_email, amount FROM sales_goals WHERE month = $1::date ORDER BY seller_email NULLS FIRST", [
    firstDay(month),
  ]);
  return rows.map((row) => ({ sellerEmail: row.seller_email === null ? null : String(row.seller_email), amount: Number(row.amount) }));
}

/** Writes the goal of the team (`sellerEmail` null) or of one seller for the month. Zero is "no goal". */
export async function saveGoal(sellerEmail: string | null, month: string, amount: number, who: string, conn: Queryable): Promise<void> {
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando a meta.");
  try {
    assertAmount(amount, "Meta");
  } catch {
    throw new GoalError("Meta: informe um valor em reais, zero ou mais.");
  }
  const seller = sellerEmail === null ? null : sellerEmail.trim().toLowerCase();
  if (seller === "") throw new GoalError("Escolha o vendedor.");
  // One statement: changes the goal that exists, or writes the first one.
  await conn.query(
    `WITH changed AS (
       UPDATE sales_goals SET amount = $3, updated_at = now(), updated_by = $4
        WHERE month = $2::date AND seller_email IS NOT DISTINCT FROM $1
        RETURNING id
     )
     INSERT INTO sales_goals (seller_email, month, amount, updated_by)
     SELECT $1, $2::date, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM changed)`,
    [seller, firstDay(month), amount, who],
  );
}

/** Who sells: everyone who has an order, plus the active users registered as seller or manager. */
export async function listSellers(conn: Queryable): Promise<{ email: string; name: string }[]> {
  const { rows } = await conn.query(
    `SELECT email, max(name) AS name FROM (
       SELECT seller_email AS email, seller_name AS name FROM orders
       UNION ALL
       SELECT email, name FROM users WHERE active AND role IN ('VENDEDOR', 'GERENTE_COMERCIAL')
     ) people GROUP BY email ORDER BY lower(max(name)), email`,
  );
  return rows.map((row) => ({ email: String(row.email), name: String(row.name) }));
}

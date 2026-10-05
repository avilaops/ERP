import { db } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { DEFAULT_PARAMS, validateParams } from "@/lib/pricing/params";
import type { PricingParams } from "@/lib/pricing/params";
import { tableMultiplier } from "@/lib/pricing/table";

/** Field of PricingParams and its column, in the order of the table. */
const COLUMNS: [keyof PricingParams, string][] = [
  ["targetNetProfit", "target_net_profit"],
  ["freeDiscount", "free_discount"],
  ["safetyMargin", "safety_margin"],
  ["minDownPayment", "min_down_payment"],
  ["proposalValidityDays", "proposal_validity_days"],
  ["icmsSp", "icms_sp"],
  ["pisCofins", "pis_cofins"],
  ["ipi", "ipi"],
  ["incomeTax", "income_tax"],
  ["commission", "commission"],
  ["ads", "ads"],
  ["gateway", "gateway"],
  ["icmsInterstate", "icms_interstate"],
  ["otherSalesRate", "other_sales_rate"],
  ["fixedMonthlyExpenses", "fixed_monthly_expenses"],
];

const COLUMN_LIST = COLUMNS.map(([, column]) => column).join(", ");

/**
 * The directors' draft. Without a saved row the defaults of the engine apply.
 * What comes out of the database is validated before anyone uses it: an
 * invalid row throws instead of returning crooked parameters.
 */
export async function loadParams(conn: Queryable = db()): Promise<PricingParams> {
  const { rows } = await conn.query(`SELECT ${COLUMN_LIST} FROM pricing_params`);
  const row = rows[0];
  if (!row) return DEFAULT_PARAMS;

  // numeric columns arrive as text; Number() keeps the eight places stored.
  const params = Object.fromEntries(COLUMNS.map(([field, column]) => [field, Number(row[column])])) as PricingParams;
  validateParams(params);
  return params;
}

/** Validates, makes sure a table price exists for these parameters, then writes the single row. */
export async function saveParams(params: PricingParams, updatedBy: string, conn: Queryable = db()): Promise<void> {
  validateParams(params);
  tableMultiplier(params);
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está gravando os parâmetros.");

  const values = COLUMNS.map(([field]) => params[field]);
  const placeholders = COLUMNS.map((_, index) => `$${index + 1}`).join(", ");
  const updates = COLUMNS.map(([, column]) => `${column} = EXCLUDED.${column}`).join(", ");
  await conn.query(
    `INSERT INTO pricing_params (id, ${COLUMN_LIST}, updated_by)
     VALUES (true, ${placeholders}, $${COLUMNS.length + 1})
     ON CONFLICT (id) DO UPDATE SET ${updates}, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [...values, updatedBy],
  );
}

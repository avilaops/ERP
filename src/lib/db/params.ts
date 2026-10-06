import type { Queryable } from "@/lib/db/pool";
import { validateParams } from "@/lib/pricing/params";
import type { PricingParams, ScalarParams } from "@/lib/pricing/params";
import { UFS } from "@/lib/pricing/states";
import type { StateRates, Uf } from "@/lib/pricing/states";
import { tableMultiplier } from "@/lib/pricing/table";

/** Each one-number field of the parameters and its column, in the order of the table. */
export const PARAM_COLUMNS: [keyof ScalarParams, string][] = [
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
  ["lossProvision", "loss_provision"],
  ["warrantyProvision", "warranty_provision"],
  ["defaultProvision", "default_provision"],
  ["fixedFeePerOrder", "fixed_fee_per_order"],
  ["fixedMonthlyExpenses", "fixed_monthly_expenses"],
];

const COLUMNS = PARAM_COLUMNS;

/** The fifteen columns, as they go in a statement. */
export const PARAM_COLUMN_LIST = COLUMNS.map(([, column]) => column).join(", ");
const COLUMN_LIST = PARAM_COLUMN_LIST;

/** Rows of a table of rates by state (`uf`, `internal_icms`, `fcp`) as the engine takes them. */
export function rowsToStateRates(rows: Record<string, unknown>[]): StateRates {
  const rates: Partial<StateRates> = {};
  for (const row of rows) {
    rates[row.uf as Uf] = { internalIcms: Number(row.internal_icms), fcp: Number(row.fcp) };
  }
  return rates as StateRates;
}

/** The three columns of the rates by state, each as an array in the order of UFS: what `unnest` takes. */
export function stateRateArrays(rates: StateRates): [Uf[], number[], number[]] {
  return [[...UFS], UFS.map((uf) => rates[uf].internalIcms), UFS.map((uf) => rates[uf].fcp)];
}

/**
 * A row with the fifteen columns plus the rates by state, validated: a missing
 * state or an invalid rate throws. numeric columns arrive as text; Number()
 * keeps the eight places stored.
 */
export function rowToParams(row: Record<string, unknown>, stateRates: StateRates): PricingParams {
  const scalars = Object.fromEntries(COLUMNS.map(([field, column]) => [field, Number(row[column])])) as ScalarParams;
  const params = { ...scalars, stateRates };
  validateParams(params);
  return params;
}

/**
 * The directors' draft. The database is the only source: the row is created by
 * the migrations with the prototype's values and changed on the Parâmetros
 * screen. Without it there is nothing to price with, so this throws instead of
 * answering with values from the code. What comes out is validated before
 * anyone uses it: an invalid row throws instead of returning crooked parameters.
 */
export async function loadParams(conn: Queryable): Promise<PricingParams> {
  const { rows } = await conn.query(`SELECT ${COLUMN_LIST} FROM pricing_params`);
  const row = rows[0];
  if (!row) throw new Error("Parâmetros não cadastrados no banco. Rode `npm run db:migrate`.");

  const rates = await conn.query("SELECT uf, internal_icms, fcp FROM state_tax_rates");
  return rowToParams(row, rowsToStateRates(rates.rows));
}

/** Validates, makes sure a table price exists for these parameters, then writes the single row and the rates by state. */
export async function saveParams(params: PricingParams, updatedBy: string, conn: Queryable): Promise<void> {
  validateParams(params);
  tableMultiplier(params);
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está gravando os parâmetros.");

  const values = COLUMNS.map(([field]) => params[field]);
  const placeholders = COLUMNS.map((_, index) => `$${index + 5}`).join(", ");
  const updates = COLUMNS.map(([, column]) => `${column} = EXCLUDED.${column}`).join(", ");
  // One statement: the single row and the 27 states are written together or not at all.
  await conn.query(
    `WITH saved AS (
       INSERT INTO pricing_params (id, ${COLUMN_LIST}, updated_by)
       VALUES (true, ${placeholders}, $1)
       ON CONFLICT (id) DO UPDATE SET ${updates}, updated_at = now(), updated_by = EXCLUDED.updated_by
       RETURNING updated_by
     )
     INSERT INTO state_tax_rates (uf, internal_icms, fcp, updated_by)
     SELECT rate.uf, rate.internal_icms, rate.fcp, saved.updated_by
       FROM saved, unnest($2::text[], $3::numeric[], $4::numeric[]) AS rate (uf, internal_icms, fcp)
     ON CONFLICT (uf) DO UPDATE
        SET internal_icms = EXCLUDED.internal_icms, fcp = EXCLUDED.fcp, updated_at = now(), updated_by = EXCLUDED.updated_by
      WHERE state_tax_rates.internal_icms <> EXCLUDED.internal_icms OR state_tax_rates.fcp <> EXCLUDED.fcp`,
    [updatedBy, ...stateRateArrays(params.stateRates), ...values],
  );
}

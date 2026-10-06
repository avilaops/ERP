import { PARAM_COLUMN_LIST, PARAM_COLUMNS, rowsToStateRates, rowToParams, stateRateArrays } from "@/lib/db/params";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import type { PriceTableDraft } from "@/lib/price-table";
import { assertAmount, assertRate } from "@/lib/pricing/money";
import { validateParams } from "@/lib/pricing/params";
import type { PricingParams } from "@/lib/pricing/params";

export type PriceTableVersion = { version: number; publishedAt: Date; publishedBy: string };

/** What went into the price of one product and the price that came out, in cents. */
export type PriceTableItem = {
  productId: number;
  code: string | null;
  name: string;
  advisoryCost: number;
  taxCredit: number;
  packaging: number;
  table: number;
  tableWithIpi: number;
};

/** For the directors only: the parameters and the costs of a version. */
export type PublishedSnapshot = PriceTableVersion & { params: PricingParams; items: PriceTableItem[] };

/** What the team sees of one product. No cost, credit nor packaging. */
export type PublishedPrice = { productId: number; code: string | null; name: string; table: number; tableWithIpi: number };

/**
 * What the team sees of a version. Of the parameters, only the commercial
 * conditions a seller already reads on the proposal: none reveals cost or margin.
 */
export type PublishedTable = {
  version: number;
  publishedAt: Date;
  freeDiscount: number;
  ipi: number;
  /** Down payment the policy asks for, as a rate of the invoice total. */
  minDownPayment: number;
  proposalValidityDays: number;
  commission: number;
  items: PublishedPrice[];
};

/** A refusal the user can act on. The message goes to the screen as it is. */
export class PriceTableError extends Error {}

const ALREADY_PUBLISHED = "A tabela já foi publicada por outra pessoa. Confira o que está pendente e publique de novo.";
const PRODUCT_GONE = "Um equipamento foi excluído durante a publicação. Nada foi publicado; tente de novo.";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

const COLUMN_LIST = PARAM_COLUMN_LIST;

const toVersion = (row: Record<string, unknown>): PriceTableVersion => ({
  version: Number(row.version),
  publishedAt: row.published_at as Date,
  publishedBy: String(row.published_by),
});

/** The version the team sells with, or `null` before the first publication. */
export async function latestVersion(conn: Queryable): Promise<PriceTableVersion | null> {
  const { rows } = await conn.query(
    "SELECT version, published_at, published_by FROM price_table_versions ORDER BY version DESC LIMIT 1",
  );
  return rows[0] ? toVersion(rows[0]) : null;
}

/** A version with its parameters and costs. The parameters are validated on the way out. */
export async function loadPublishedSnapshot(version: number, conn: Queryable): Promise<PublishedSnapshot | null> {
  if (!Number.isSafeInteger(version) || version <= 0) return null;
  const { rows } = await conn.query(
    `SELECT version, published_at, published_by, ${COLUMN_LIST} FROM price_table_versions WHERE version = $1`,
    [version],
  );
  if (!rows[0]) return null;

  const items = await conn.query(
    `SELECT product_id, code, name, advisory_cost, tax_credit, packaging, table_price, table_price_with_ipi
       FROM price_table_items WHERE version = $1 ORDER BY product_id`,
    [version],
  );
  const rates = await conn.query("SELECT uf, internal_icms, fcp FROM price_table_state_rates WHERE version = $1", [version]);
  return {
    ...toVersion(rows[0]),
    params: rowToParams(rows[0], rowsToStateRates(rates.rows)),
    items: items.rows.map((row) => ({
      productId: Number(row.product_id),
      code: row.code === null ? null : String(row.code),
      name: String(row.name),
      advisoryCost: Number(row.advisory_cost),
      taxCredit: Number(row.tax_credit),
      packaging: Number(row.packaging),
      table: Number(row.table_price),
      tableWithIpi: Number(row.table_price_with_ipi),
    })),
  };
}

/** Everything is checked before the database is touched: an invalid draft throws and nothing is written. */
function assertDraft(draft: PriceTableDraft, version: number, publishedBy: string): void {
  validateParams(draft.params);
  if (publishedBy.trim() === "") throw new Error("Falta dizer quem está publicando a tabela.");
  if (!Number.isSafeInteger(version) || version <= 0) throw new Error("Número de versão inválido.");
  if (draft.items.length === 0) {
    throw new PriceTableError("Nenhum equipamento ativo com custo: não há o que publicar.");
  }

  const ids = new Set<number>();
  for (const item of draft.items) {
    if (!Number.isSafeInteger(item.productId) || item.productId <= 0) throw new Error("Equipamento sem identificação na tabela.");
    if (ids.has(item.productId)) throw new Error(`Equipamento repetido na tabela: ${item.productId}.`);
    ids.add(item.productId);
    if (item.name.trim() === "") throw new Error("Equipamento sem nome na tabela.");
    assertAmount(item.advisoryCost, "Custo da assessoria");
    assertRate(item.taxCredit, "Crédito de impostos");
    assertAmount(item.packaging, "Embalagem");
    assertAmount(item.table, "Preço de tabela");
    assertAmount(item.tableWithIpi, "Preço de tabela com IPI");
    if (item.advisoryCost === 0) throw new Error("Custo da assessoria precisa ser maior que zero.");
    if (item.table === 0) throw new Error("Preço de tabela precisa ser maior que zero.");
    if (item.tableWithIpi < item.table) throw new Error("Preço de tabela com IPI menor que o preço sem IPI.");
  }
}

/**
 * Publishes the draft as `version`, which has to be the next one: the screen sends
 * the number it showed, so nobody publishes over someone else's publication.
 * One statement, so the version and its items are written together or not at all.
 * There is no way back: a published version is never changed nor removed.
 */
export async function publishPriceTable(
  draft: PriceTableDraft,
  version: number,
  publishedBy: string,
  conn: Queryable,
): Promise<PriceTableVersion> {
  assertDraft(draft, version, publishedBy);

  const items = draft.items;
  // $1 to $13 are the version, who publishes, the items and the rates by state; the fifteen parameters come after.
  const placeholders = PARAM_COLUMNS.map((_, index) => `$${index + 14}::numeric`).join(", ");
  try {
    const { rows } = await conn.query(
      `WITH published AS (
         INSERT INTO price_table_versions (version, published_by, ${COLUMN_LIST})
         SELECT $1::integer, $2::text, ${placeholders}
          WHERE $1::integer = (SELECT COALESCE(MAX(version), 0) + 1 FROM price_table_versions)
         RETURNING version, published_at, published_by
       ), written AS (
         INSERT INTO price_table_items
           (version, product_id, code, name, advisory_cost, tax_credit, packaging, table_price, table_price_with_ipi)
         SELECT published.version, item.product_id, item.code, item.name, item.advisory_cost, item.tax_credit,
                item.packaging, item.table_price, item.table_price_with_ipi
           FROM published,
                unnest($3::integer[], $4::text[], $5::text[], $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[])
                  AS item (product_id, code, name, advisory_cost, tax_credit, packaging, table_price, table_price_with_ipi)
         RETURNING version
       ), rates AS (
         INSERT INTO price_table_state_rates (version, uf, internal_icms, fcp)
         SELECT published.version, rate.uf, rate.internal_icms, rate.fcp
           FROM published, unnest($11::text[], $12::numeric[], $13::numeric[]) AS rate (uf, internal_icms, fcp)
         RETURNING version
       )
       SELECT version, published_at, published_by FROM published
        WHERE EXISTS (SELECT 1 FROM written) AND EXISTS (SELECT 1 FROM rates)`,
      [
        version,
        publishedBy,
        items.map((item) => item.productId),
        items.map((item) => item.code),
        items.map((item) => item.name),
        items.map((item) => item.advisoryCost),
        items.map((item) => item.taxCredit),
        items.map((item) => item.packaging),
        items.map((item) => item.table),
        items.map((item) => item.tableWithIpi),
        ...stateRateArrays(draft.params.stateRates),
        ...PARAM_COLUMNS.map(([field]) => draft.params[field]),
      ],
    );
    // No row: the number asked for is not the next one any more.
    if (!rows[0]) throw new PriceTableError(ALREADY_PUBLISHED);
    return toVersion(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new PriceTableError(ALREADY_PUBLISHED);
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw new PriceTableError(PRODUCT_GONE);
    throw error;
  }
}

/**
 * The version as the team may see it. The cost never leaves the database here:
 * the statements name only the columns of the published price, so there is
 * nothing to leak to a seller's browser.
 */
export async function loadPublishedTable(version: number, conn: Queryable): Promise<PublishedTable | null> {
  if (!Number.isSafeInteger(version) || version <= 0) return null;
  const { rows } = await conn.query(
    `SELECT version, published_at, free_discount, ipi, min_down_payment, proposal_validity_days, commission
       FROM price_table_versions WHERE version = $1`,
    [version],
  );
  if (!rows[0]) return null;

  const items = await conn.query(
    "SELECT product_id, code, name, table_price, table_price_with_ipi FROM price_table_items WHERE version = $1 ORDER BY product_id",
    [version],
  );
  return {
    version: Number(rows[0].version),
    publishedAt: rows[0].published_at as Date,
    freeDiscount: Number(rows[0].free_discount),
    ipi: Number(rows[0].ipi),
    minDownPayment: Number(rows[0].min_down_payment),
    proposalValidityDays: Number(rows[0].proposal_validity_days),
    commission: Number(rows[0].commission),
    items: items.rows.map((row) => ({
      productId: Number(row.product_id),
      code: row.code === null ? null : String(row.code),
      name: String(row.name),
      table: Number(row.table_price),
      tableWithIpi: Number(row.table_price_with_ipi),
    })),
  };
}

/** Every publication, from the newest to the oldest. */
export async function listVersions(conn: Queryable): Promise<PriceTableVersion[]> {
  const { rows } = await conn.query(
    "SELECT version, published_at, published_by FROM price_table_versions ORDER BY version DESC",
  );
  return rows.map(toVersion);
}

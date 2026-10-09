import { MAIN_LINE } from "@/lib/product-line";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import type { AdvisoryCostRow } from "@/lib/advisory-paste";
import { assertAmount, assertRate } from "@/lib/pricing/money";
import type { ProductCost } from "@/lib/pricing/product";

export type Product = {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  supplierName: string | null;
  supplierModel: string | null;
  supplierPriceUsd: number | null;
  /** Cost quoted by the import advisory, in reais. `null` is a product without cost yet. */
  advisoryCost: number | null;
  /** Tax credits on entry, as a fraction of the advisory cost. Kept with eight places. */
  taxCredit: number;
  packaging: number;
  active: boolean;
  /** The product line it is sold in: its parameters and its published table. */
  lineId: number;
  /** Whether there is a photo. The bytes never come with the product: see product-photos.ts. */
  hasPhoto: boolean;
};

export type ProductInput = {
  name: string;
  code?: string | null;
  description?: string | null;
  supplierName?: string | null;
  supplierModel?: string | null;
  supplierPriceUsd?: number | null;
  advisoryCost?: number | null;
  taxCredit?: number;
  packaging?: number;
  active?: boolean;
  /** Without it, the main line. */
  lineId?: number;
};

/** Only the fields present are changed. `advisoryCost: null` takes the product back to "without cost". */
export type ProductPatch = Partial<ProductInput>;

/** A refusal the user can act on. The message goes to the screen as it is. */
export class ProductError extends Error {}

const COLUMNS =
  "id, name, code, description, supplier_name, supplier_model, supplier_price_usd, advisory_cost, tax_credit, packaging, active, line_id, " +
  "EXISTS (SELECT 1 FROM product_photos WHERE product_photos.product_id = products.id) AS has_photo";

const numberOrNull = (value: unknown) => (value === null ? null : Number(value));
const textOrNull = (value: unknown) => (value === null ? null : String(value));
/** Blank text is "not informed": stored as NULL, so two products without code do not collide. */
const blankToNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

function toProduct(row: Record<string, unknown>): Product {
  return {
    id: Number(row.id),
    name: String(row.name),
    code: textOrNull(row.code),
    description: textOrNull(row.description),
    supplierName: textOrNull(row.supplier_name),
    supplierModel: textOrNull(row.supplier_model),
    supplierPriceUsd: numberOrNull(row.supplier_price_usd),
    advisoryCost: numberOrNull(row.advisory_cost),
    taxCredit: Number(row.tax_credit),
    packaging: Number(row.packaging),
    active: row.active === true,
    lineId: Number(row.line_id),
    hasPhoto: row.has_photo === true,
  };
}

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

/** Field of a patch and its column. */
const PATCH_COLUMNS: [keyof ProductPatch, string][] = [
  ["name", "name"],
  ["code", "code"],
  ["description", "description"],
  ["supplierName", "supplier_name"],
  ["supplierModel", "supplier_model"],
  ["supplierPriceUsd", "supplier_price_usd"],
  ["advisoryCost", "advisory_cost"],
  ["taxCredit", "tax_credit"],
  ["packaging", "packaging"],
  ["active", "active"],
  ["lineId", "line_id"],
];

/** What goes to the column for one field of a patch, checked the same way as on creation. */
function patchValue(field: keyof ProductPatch, patch: ProductPatch): unknown {
  switch (field) {
    case "name": {
      const name = patch.name?.trim() ?? "";
      if (name === "") throw new ProductError("Produto sem nome.");
      return name;
    }
    case "code":
    case "description":
    case "supplierName":
    case "supplierModel":
      return blankToNull(patch[field]);
    case "supplierPriceUsd": {
      const price = patch.supplierPriceUsd ?? null;
      if (price !== null) assertAmount(price, "Preço do fornecedor");
      return price;
    }
    case "advisoryCost": {
      const cost = patch.advisoryCost ?? null;
      if (cost !== null) assertAmount(cost, "Custo da assessoria");
      return cost;
    }
    case "taxCredit":
      assertRate(patch.taxCredit as number, "Crédito de impostos");
      return patch.taxCredit;
    case "packaging":
      assertAmount(patch.packaging as number, "Embalagem");
      return patch.packaging;
    case "active":
      return patch.active === true;
    case "lineId":
      if (!isId(patch.lineId as number)) throw new ProductError(NO_LINE);
      return patch.lineId;
  }
}

const isId = (id: number) => Number.isSafeInteger(id) && id > 0;
const NO_LINE = "Linha de produto não encontrada. Recarregue a página.";

export async function createProduct(input: ProductInput, updatedBy: string, conn: Queryable): Promise<Product> {
  const name = input.name.trim();
  if (name === "") throw new ProductError("Produto sem nome.");
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está cadastrando o produto.");

  const code = blankToNull(input.code);
  const advisoryCost = input.advisoryCost ?? null;
  const supplierPriceUsd = input.supplierPriceUsd ?? null;
  const taxCredit = input.taxCredit ?? 0;
  const packaging = input.packaging ?? 0;
  if (advisoryCost !== null) assertAmount(advisoryCost, "Custo da assessoria");
  if (supplierPriceUsd !== null) assertAmount(supplierPriceUsd, "Preço do fornecedor");
  assertRate(taxCredit, "Crédito de impostos");
  assertAmount(packaging, "Embalagem");

  try {
    const { rows } = await conn.query(
      `INSERT INTO products
         (name, code, description, supplier_name, supplier_model, supplier_price_usd, advisory_cost, tax_credit, packaging, active, updated_by, line_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${COLUMNS}`,
      [
        name,
        code,
        blankToNull(input.description),
        blankToNull(input.supplierName),
        blankToNull(input.supplierModel),
        supplierPriceUsd,
        advisoryCost,
        taxCredit,
        packaging,
        input.active ?? true,
        updatedBy,
        input.lineId ?? MAIN_LINE,
      ],
    );
    return toProduct(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new ProductError(`Já existe produto com o código "${code}".`);
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw new ProductError(NO_LINE);
    throw error;
  }
}

/** Changes the fields present in the patch and answers with the row as it stayed. */
export async function updateProduct(
  id: number,
  patch: ProductPatch,
  updatedBy: string,
  conn: Queryable,
): Promise<Product> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está alterando o produto.");
  const changes = PATCH_COLUMNS.filter(([field]) => patch[field] !== undefined).map(
    ([field, column]) => [column, patchValue(field, patch)] as const,
  );
  if (!isId(id)) throw new ProductError("Produto não encontrado.");

  // Fixed column names only; every value goes as a parameter.
  const updates = [
    ...changes.map(([column], index) => `${column} = $${index + 2}`),
    "updated_at = now()",
    `updated_by = $${changes.length + 2}`,
  ].join(", ");

  try {
    const { rows } = await conn.query(`UPDATE products SET ${updates} WHERE id = $1 RETURNING ${COLUMNS}`, [
      id,
      ...changes.map(([, value]) => value),
      updatedBy,
    ]);
    if (rows.length === 0) throw new ProductError("Produto não encontrado.");
    return toProduct(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) {
      throw new ProductError(`Já existe produto com o código "${blankToNull(patch.code)}".`);
    }
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw new ProductError(NO_LINE);
    throw error;
  }
}

/** The text of a product: what the spreadsheet of photos and descriptions brings. */
export type ProductText = {
  name: string;
  description: string | null;
  supplierName: string | null;
  supplierModel: string | null;
  supplierPriceUsd: number | null;
};

/**
 * Rewrites name, description and supplier reference. Cost, tax credit,
 * packaging, code and `active` are never touched here.
 */
export async function updateProductText(
  id: number,
  text: ProductText,
  updatedBy: string,
  conn: Queryable,
): Promise<Product> {
  const { name, description, supplierName, supplierModel, supplierPriceUsd } = text;
  return updateProduct(id, { name, description, supplierName, supplierModel, supplierPriceUsd }, updatedBy, conn);
}

/** Codes are compared in capitals and without spaces around: `ld-b001` finds `LD-B001`. */
export const normalizeCode = (code: string) => code.trim().toUpperCase();

/** The product with this code, whatever the case it was typed in. An exact match wins. */
export async function findProductByCode(code: string, conn: Queryable): Promise<Product | null> {
  const wanted = normalizeCode(code);
  if (wanted === "") return null;
  const { rows } = await conn.query(
    `SELECT ${COLUMNS} FROM products WHERE upper(code) = $1 ORDER BY (code = $1) DESC, id LIMIT 1`,
    [wanted],
  );
  return rows.length === 0 ? null : toProduct(rows[0]);
}

/**
 * Removes the record and answers with what it was. Refused once anything else
 * points to the product. The photo is not history: it goes in the same
 * statement, and stays when the product is refused.
 */
export async function deleteProduct(id: number, conn: Queryable): Promise<Product> {
  if (!isId(id)) throw new ProductError("Produto não encontrado.");
  try {
    const { rows } = await conn.query(
      `WITH photo AS (DELETE FROM product_photos WHERE product_id = $1)
       DELETE FROM products WHERE id = $1 RETURNING ${COLUMNS}`,
      [id],
    );
    if (rows.length === 0) throw new ProductError("Produto não encontrado.");
    return toProduct(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      throw new ProductError("Este equipamento já tem histórico e não pode ser excluído. Desative-o.");
    }
    throw error;
  }
}

/**
 * The costs of the advisory's sheet, by code, in a single statement: either every
 * row is written or none. Does not create a product nor touch name, code or
 * `active`. A code that no longer exists simply does not come back in the answer.
 */
export async function applyAdvisoryCosts(
  rows: AdvisoryCostRow[],
  updatedBy: string,
  conn: Queryable,
): Promise<Product[]> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está lançando os custos.");
  const codes = new Set<string>();
  for (const { code, advisoryCost, taxCredit, packaging } of rows) {
    if (code.trim() === "" || code !== code.trim()) throw new Error("Custo da assessoria sem código do produto.");
    if (codes.has(code)) throw new Error(`Código repetido na lista de custos: "${code}".`);
    codes.add(code);
    assertAmount(advisoryCost, "Custo da assessoria");
    if (advisoryCost === 0) throw new Error("Custo da assessoria precisa ser maior que zero.");
    if (taxCredit !== undefined) assertRate(taxCredit, "Crédito de impostos");
    if (packaging !== undefined) assertAmount(packaging, "Embalagem");
  }
  if (rows.length === 0) return [];

  const { rows: updated } = await conn.query(
    `UPDATE products
        SET advisory_cost = pasted.cost,
            tax_credit = COALESCE(pasted.credit, tax_credit),
            packaging = COALESCE(pasted.package, packaging),
            updated_at = now(),
            updated_by = $5
       FROM unnest($1::text[], $2::numeric[], $3::numeric[], $4::numeric[]) AS pasted (pasted_code, cost, credit, package)
      WHERE code = pasted.pasted_code
      RETURNING ${COLUMNS}`,
    [
      rows.map((row) => row.code),
      rows.map((row) => row.advisoryCost),
      rows.map((row) => row.taxCredit ?? null),
      rows.map((row) => row.packaging ?? null),
      updatedBy,
    ],
  );
  return updated.map(toProduct);
}

/** Products by name. `active` filters one side and `lineId` one line; without them, all of them. */
export async function listProducts({ active, lineId }: { active?: boolean; lineId?: number } = {}, conn: Queryable): Promise<Product[]> {
  const { rows } = await conn.query(
    `SELECT ${COLUMNS} FROM products
      WHERE ($1::boolean IS NULL OR active = $1) AND ($2::integer IS NULL OR line_id = $2)
      ORDER BY name, id`,
    [active ?? null, lineId ?? null],
  );
  return rows.map(toProduct);
}

/** What the engine needs from the active products of a line that already have a cost. */
export async function listProductCosts(conn: Queryable, lineId: number = MAIN_LINE): Promise<ProductCost[]> {
  const products = await listProducts({ active: true, lineId }, conn);
  return products.flatMap(({ advisoryCost, taxCredit, packaging }) =>
    advisoryCost === null ? [] : [{ advisoryCost, taxCredit, packaging }],
  );
}

/** Dimensions and weight of an equipment, for the proposal. `null` is "not registered": the proposal leaves it out. */
export type ProductMeasures = { lengthMm: number | null; widthMm: number | null; heightMm: number | null; weightKg: number | null };

export async function loadProductMeasures(productId: number, conn: Queryable): Promise<ProductMeasures | null> {
  const { rows } = await conn.query("SELECT length_mm, width_mm, height_mm, weight_kg FROM products WHERE id = $1", [productId]);
  const row = rows[0];
  if (!row) return null;
  const number = (value: unknown) => (value === null ? null : Number(value));
  return { lengthMm: number(row.length_mm), widthMm: number(row.width_mm), heightMm: number(row.height_mm), weightKg: number(row.weight_kg) };
}

export async function saveProductMeasures(productId: number, measures: ProductMeasures, updatedBy: string, conn: Queryable): Promise<void> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está alterando as medidas do equipamento.");
  for (const [label, value] of [["Comprimento", measures.lengthMm], ["Largura", measures.widthMm], ["Altura", measures.heightMm]] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 99_999)) throw new ProductError(`${label}: informe em milímetros, número inteiro de 1 a 99.999, ou deixe em branco.`);
  }
  if (measures.weightKg !== null && (!Number.isFinite(measures.weightKg) || measures.weightKg <= 0 || measures.weightKg > 999_999)) {
    throw new ProductError("Peso: informe em quilos, maior que zero, ou deixe em branco.");
  }
  const { rows } = await conn.query(
    "UPDATE products SET length_mm = $2, width_mm = $3, height_mm = $4, weight_kg = $5, updated_at = now(), updated_by = $6 WHERE id = $1 RETURNING id",
    [productId, measures.lengthMm, measures.widthMm, measures.heightMm, measures.weightKg, updatedBy],
  );
  if (!rows[0]) throw new ProductError("Produto não encontrado.");
}

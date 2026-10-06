import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import type { AdvisoryCostRow } from "@/lib/advisory-paste";
import { assertAmount, assertRate } from "@/lib/pricing/money";
import type { ProductCost } from "@/lib/pricing/product";

export type Product = {
  id: number;
  name: string;
  code: string | null;
  supplierName: string | null;
  supplierModel: string | null;
  supplierPriceUsd: number | null;
  /** Cost quoted by the import advisory, in reais. `null` is a product without cost yet. */
  advisoryCost: number | null;
  /** Tax credits on entry, as a fraction of the advisory cost. Kept with eight places. */
  taxCredit: number;
  packaging: number;
  active: boolean;
};

export type ProductInput = {
  name: string;
  code?: string | null;
  supplierName?: string | null;
  supplierModel?: string | null;
  supplierPriceUsd?: number | null;
  advisoryCost?: number | null;
  taxCredit?: number;
  packaging?: number;
  active?: boolean;
};

/** Only the fields present are changed. `advisoryCost: null` takes the product back to "without cost". */
export type ProductPatch = Partial<ProductInput>;

/** A refusal the user can act on. The message goes to the screen as it is. */
export class ProductError extends Error {}

const COLUMNS =
  "id, name, code, supplier_name, supplier_model, supplier_price_usd, advisory_cost, tax_credit, packaging, active";

const numberOrNull = (value: unknown) => (value === null ? null : Number(value));
const textOrNull = (value: unknown) => (value === null ? null : String(value));
/** Blank text is "not informed": stored as NULL, so two products without code do not collide. */
const blankToNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

function toProduct(row: Record<string, unknown>): Product {
  return {
    id: Number(row.id),
    name: String(row.name),
    code: textOrNull(row.code),
    supplierName: textOrNull(row.supplier_name),
    supplierModel: textOrNull(row.supplier_model),
    supplierPriceUsd: numberOrNull(row.supplier_price_usd),
    advisoryCost: numberOrNull(row.advisory_cost),
    taxCredit: Number(row.tax_credit),
    packaging: Number(row.packaging),
    active: row.active === true,
  };
}

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

/** Field of a patch and its column. */
const PATCH_COLUMNS: [keyof ProductPatch, string][] = [
  ["name", "name"],
  ["code", "code"],
  ["supplierName", "supplier_name"],
  ["supplierModel", "supplier_model"],
  ["supplierPriceUsd", "supplier_price_usd"],
  ["advisoryCost", "advisory_cost"],
  ["taxCredit", "tax_credit"],
  ["packaging", "packaging"],
  ["active", "active"],
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
  }
}

const isId = (id: number) => Number.isSafeInteger(id) && id > 0;

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
         (name, code, supplier_name, supplier_model, supplier_price_usd, advisory_cost, tax_credit, packaging, active, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${COLUMNS}`,
      [
        name,
        code,
        blankToNull(input.supplierName),
        blankToNull(input.supplierModel),
        supplierPriceUsd,
        advisoryCost,
        taxCredit,
        packaging,
        input.active ?? true,
        updatedBy,
      ],
    );
    return toProduct(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new ProductError(`Já existe produto com o código "${code}".`);
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
    throw error;
  }
}

/** Removes the record and answers with what it was. Refused once anything else points to the product. */
export async function deleteProduct(id: number, conn: Queryable): Promise<Product> {
  if (!isId(id)) throw new ProductError("Produto não encontrado.");
  try {
    const { rows } = await conn.query(`DELETE FROM products WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
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

/** Products by name. `active` filters one side; without it, all of them. */
export async function listProducts({ active }: { active?: boolean } = {}, conn: Queryable): Promise<Product[]> {
  const { rows } =
    active === undefined
      ? await conn.query(`SELECT ${COLUMNS} FROM products ORDER BY name, id`)
      : await conn.query(`SELECT ${COLUMNS} FROM products WHERE active = $1 ORDER BY name, id`, [active]);
  return rows.map(toProduct);
}

/** What the engine needs from the active products that already have a cost. */
export async function listProductCosts(conn: Queryable): Promise<ProductCost[]> {
  const products = await listProducts({ active: true }, conn);
  return products.flatMap(({ advisoryCost, taxCredit, packaging }) =>
    advisoryCost === null ? [] : [{ advisoryCost, taxCredit, packaging }],
  );
}

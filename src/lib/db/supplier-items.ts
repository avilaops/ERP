import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { normalizePhoto } from "@/lib/photos/normalize";

/** One thing the supplier sells, as its catalogue describes it. */
export type SupplierItemInput = {
  supplier: string;
  catalog: string;
  line: string | null;
  code: string;
  name: string;
  description: string | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  weightKg: number | null;
  loadType: string | null;
  /** Code of the company's own equipment it corresponds to, or `null`. */
  productCode: string | null;
};

export type SupplierItem = SupplierItemInput & { id: number; hasPhoto: boolean; productId: number | null; productName: string | null };

/** A refusal the user can act on. The message goes to the screen as it is. */
export class SupplierItemError extends Error {}

const UNIQUE_VIOLATION = "23505";
const DUPLICATE = "Já existe um item com este código neste catálogo do fornecedor.";

const blank = (value: string | null) => (value?.trim() ? value.trim() : null);
const positive = (value: number | null) => (value !== null && Number.isFinite(value) && value > 0 ? value : null);
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const number = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/**
 * Writes one item of the supplier's catalogue, or changes the one that already
 * has this supplier, catalogue and code. The photo, when given, is normalized
 * like every photo of the system. Answers whether anything was created.
 */
export async function upsertSupplierItem(input: SupplierItemInput, photo: Uint8Array | null, updatedBy: string, conn: Queryable): Promise<{ id: number; created: boolean }> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está gravando o catálogo do fornecedor.");
  for (const [value, label] of [[input.supplier, "fornecedor"], [input.catalog, "catálogo"], [input.code, "código"], [input.name, "nome"]] as const) {
    if (value.trim() === "") throw new Error(`Item do catálogo sem ${label}.`);
  }
  const picture = photo ? await normalizePhoto(photo) : null;
  const { rows } = await conn.query(
    `INSERT INTO supplier_items (supplier, catalog, line, code, name, description, length_mm, width_mm, height_mm, weight_kg, load_type,
                                 product_code, photo, photo_sha256, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (supplier, catalog, code) DO UPDATE
        SET line = EXCLUDED.line, name = EXCLUDED.name, description = EXCLUDED.description, length_mm = EXCLUDED.length_mm,
            width_mm = EXCLUDED.width_mm, height_mm = EXCLUDED.height_mm, weight_kg = EXCLUDED.weight_kg, load_type = EXCLUDED.load_type,
            product_code = EXCLUDED.product_code,
            photo = COALESCE(EXCLUDED.photo, supplier_items.photo),
            photo_sha256 = COALESCE(EXCLUDED.photo_sha256, supplier_items.photo_sha256),
            updated_at = now(), updated_by = EXCLUDED.updated_by
     RETURNING id, (xmax = 0) AS created`,
    [
      input.supplier.trim(), input.catalog.trim(), blank(input.line), input.code.trim(), input.name.trim(), blank(input.description),
      positive(input.lengthMm), positive(input.widthMm), positive(input.heightMm), positive(input.weightKg), blank(input.loadType),
      blank(input.productCode), picture?.bytes ?? null, picture?.sha256 ?? null, updatedBy,
    ],
  );
  return { id: Number(rows[0].id), created: rows[0].created === true };
}

/** The whole catalogue, by catalogue and code, each item with the company's equipment it corresponds to. Never the photo itself. */
export async function listSupplierItems(conn: Queryable): Promise<SupplierItem[]> {
  const { rows } = await conn.query(
    `SELECT s.id, s.supplier, s.catalog, s.line, s.code, s.name, s.description, s.length_mm, s.width_mm, s.height_mm, s.weight_kg,
            s.load_type, s.product_code, s.photo IS NOT NULL AS has_photo, p.id AS product_id, p.name AS product_name
       FROM supplier_items s
       LEFT JOIN products p ON p.code = s.product_code
      ORDER BY s.supplier, s.catalog, s.code`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    supplier: String(row.supplier),
    catalog: String(row.catalog),
    line: text(row.line),
    code: String(row.code),
    name: String(row.name),
    description: text(row.description),
    lengthMm: number(row.length_mm),
    widthMm: number(row.width_mm),
    heightMm: number(row.height_mm),
    weightKg: number(row.weight_kg),
    loadType: text(row.load_type),
    productCode: text(row.product_code),
    hasPhoto: row.has_photo === true,
    productId: number(row.product_id),
    productName: text(row.product_name),
  }));
}

/** The supplier's items that correspond to one equipment of the company, by its code. */
export async function listSupplierItemsOf(productCode: string | null, conn: Queryable): Promise<SupplierItem[]> {
  if (!productCode) return [];
  return (await listSupplierItems(conn)).filter((item) => item.productCode === productCode);
}

export async function loadSupplierItemPhoto(id: number, conn: Queryable): Promise<{ bytes: Buffer; sha256: string } | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const { rows } = await conn.query("SELECT photo, photo_sha256 FROM supplier_items WHERE id = $1 AND photo IS NOT NULL", [id]);
  return rows.length === 0 ? null : { bytes: rows[0].photo as Buffer, sha256: String(rows[0].photo_sha256) };
}

function checked(input: SupplierItemInput, who: string): unknown[] {
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando o catálogo do fornecedor.");
  for (const [value, label] of [[input.supplier, "o fornecedor"], [input.catalog, "o catálogo"], [input.code, "o código do fornecedor"], [input.name, "o nome"]] as const) {
    if (value.trim() === "") throw new SupplierItemError(`Informe ${label}.`);
  }
  for (const [value, label] of [[input.lengthMm, "Comprimento"], [input.widthMm, "Largura"], [input.heightMm, "Altura"], [input.weightKg, "Peso"]] as const) {
    if (value !== null && !(Number.isFinite(value) && value > 0)) throw new SupplierItemError(`${label}: informe um número maior que zero, ou deixe em branco.`);
  }
  return [
    input.supplier.trim(), input.catalog.trim(), blank(input.line), input.code.trim(), input.name.trim(), blank(input.description),
    input.lengthMm === null ? null : Math.round(input.lengthMm), input.widthMm === null ? null : Math.round(input.widthMm),
    input.heightMm === null ? null : Math.round(input.heightMm), input.weightKg, blank(input.loadType), blank(input.productCode)?.toUpperCase() ?? null, who,
  ];
}

export async function getSupplierItem(id: number, conn: Queryable): Promise<SupplierItem | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return (await listSupplierItems(conn)).find((item) => item.id === id) ?? null;
}

/** "Adicionar": a new item typed on the screen. One that already exists in the catalogue is refused, not overwritten. */
export async function createSupplierItem(input: SupplierItemInput, who: string, conn: Queryable): Promise<{ id: number }> {
  const values = checked(input, who);
  try {
    const { rows } = await conn.query(
      `INSERT INTO supplier_items (supplier, catalog, line, code, name, description, length_mm, width_mm, height_mm, weight_kg, load_type, product_code, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      values,
    );
    return { id: Number(rows[0].id) };
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new SupplierItemError(DUPLICATE);
    throw error;
  }
}

/** "Salvar": every field of the item, the code of the company's equipment included. The photo is changed apart. */
export async function updateSupplierItem(id: number, input: SupplierItemInput, who: string, conn: Queryable): Promise<void> {
  const values = checked(input, who);
  try {
    const { rows } = await conn.query(
      `UPDATE supplier_items
          SET supplier = $1, catalog = $2, line = $3, code = $4, name = $5, description = $6, length_mm = $7, width_mm = $8, height_mm = $9,
              weight_kg = $10, load_type = $11, product_code = $12, updated_at = now(), updated_by = $13
        WHERE id = $14 RETURNING id`,
      [...values, id],
    );
    if (rows.length === 0) throw new SupplierItemError("Item não encontrado.");
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new SupplierItemError(DUPLICATE);
    throw error;
  }
}

/** Replaces the photo of an item, normalized like every photo of the system. */
export async function saveSupplierItemPhoto(id: number, photo: Uint8Array, who: string, conn: Queryable): Promise<void> {
  if (who.trim() === "") throw new Error("Falta dizer quem está enviando a foto.");
  const picture = await normalizePhoto(photo);
  const { rows } = await conn.query(
    "UPDATE supplier_items SET photo = $2, photo_sha256 = $3, updated_at = now(), updated_by = $4 WHERE id = $1 RETURNING id",
    [id, picture.bytes, picture.sha256, who],
  );
  if (rows.length === 0) throw new SupplierItemError("Item não encontrado.");
}

/** "Remover": the item leaves the catalogue with its photo. Nothing points to it: the link to the equipment is by code. */
export async function deleteSupplierItem(id: number, conn: Queryable): Promise<{ code: string }> {
  const { rows } = await conn.query("DELETE FROM supplier_items WHERE id = $1 RETURNING code", [id]);
  if (rows.length === 0) throw new SupplierItemError("Item não encontrado.");
  return { code: String(rows[0].code) };
}

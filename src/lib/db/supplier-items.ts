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

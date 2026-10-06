import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { ProductError } from "@/lib/db/products";
import { normalizePhoto } from "@/lib/photos/normalize";

export type ProductPhoto = {
  mimeType: string;
  bytes: Buffer;
  sha256: string;
  updatedAt: Date;
};

const FOREIGN_KEY_VIOLATION = "23503";
const isId = (id: number) => Number.isSafeInteger(id) && id > 0;

/**
 * The only way a photo gets into the database: normalized first, one per
 * product. Sending the same image again changes nothing (`changed: false`, and
 * `updated_at` stays). Throws `PhotoError` for an image refused and
 * `ProductError` when the product does not exist in this company.
 */
export async function saveProductPhoto(
  productId: number,
  input: Uint8Array,
  updatedBy: string,
  conn: Queryable,
): Promise<{ sha256: string; changed: boolean }> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está enviando a foto.");
  if (!isId(productId)) throw new ProductError("Produto não encontrado.");
  const photo = await normalizePhoto(input);

  try {
    const { rows } = await conn.query(
      `INSERT INTO product_photos (product_id, mime_type, bytes, width, height, sha256, updated_by)
       VALUES ($1, 'image/jpeg', $2, $3, $4, $5, $6)
       ON CONFLICT (product_id) DO UPDATE
          SET bytes = EXCLUDED.bytes, width = EXCLUDED.width, height = EXCLUDED.height,
              sha256 = EXCLUDED.sha256, updated_at = now(), updated_by = EXCLUDED.updated_by
        WHERE product_photos.sha256 <> EXCLUDED.sha256
       RETURNING product_id`,
      [productId, photo.bytes, photo.width, photo.height, photo.sha256, updatedBy],
    );
    return { sha256: photo.sha256, changed: rows.length > 0 };
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw new ProductError("Produto não encontrado.");
    throw error;
  }
}

export async function loadProductPhoto(productId: number, conn: Queryable): Promise<ProductPhoto | null> {
  if (!isId(productId)) return null;
  const { rows } = await conn.query(
    "SELECT mime_type, bytes, sha256, updated_at FROM product_photos WHERE product_id = $1",
    [productId],
  );
  if (rows.length === 0) return null;
  const [row] = rows;
  return {
    mimeType: String(row.mime_type),
    bytes: row.bytes as Buffer,
    sha256: String(row.sha256),
    updatedAt: row.updated_at as Date,
  };
}

/** `true` when there was a photo to remove. */
export async function deleteProductPhoto(productId: number, conn: Queryable): Promise<boolean> {
  if (!isId(productId)) return false;
  const { rows } = await conn.query("DELETE FROM product_photos WHERE product_id = $1 RETURNING product_id", [productId]);
  return rows.length > 0;
}

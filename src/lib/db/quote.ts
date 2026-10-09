import type { Queryable } from "@/lib/db/pool";

import { measuresText } from "@/lib/quote/document";

/**
 * What the quotation shows of a product beyond the published price: the line
 * under its name (dimensions and weight, as registered today) and the photo.
 * The commercial description of the equipment is not printed: the customer asked for the measures in its place.
 */
export type QuoteProduct = { description: string | null; photo: Uint8Array | null };

/**
 * Description and stored photo of the products asked for, in one query. A product
 * that does not exist in this company is simply not in the map. Nothing of the
 * product's price is read here.
 */
export async function loadQuoteProducts(productIds: number[], conn: Queryable): Promise<Map<number, QuoteProduct>> {
  const ids = [...new Set(productIds)].filter((id) => Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647);
  if (ids.length === 0) return new Map();

  const { rows } = await conn.query(
    `SELECT p.id, p.length_mm, p.width_mm, p.height_mm, p.weight_kg, ph.bytes
       FROM products p
       LEFT JOIN product_photos ph ON ph.product_id = p.id
      WHERE p.id = ANY($1::integer[])`,
    [ids],
  );
  return new Map(
    rows.map((row) => [
      Number(row.id),
      {
        description: measuresText({
          lengthMm: row.length_mm === null ? null : Number(row.length_mm),
          widthMm: row.width_mm === null ? null : Number(row.width_mm),
          heightMm: row.height_mm === null ? null : Number(row.height_mm),
          weightKg: row.weight_kg === null ? null : Number(row.weight_kg),
        }),
        photo: (row.bytes as Buffer | null) ?? null,
      },
    ]),
  );
}

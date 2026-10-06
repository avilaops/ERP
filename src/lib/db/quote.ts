import type { Queryable } from "@/lib/db/pool";

/** What the quotation shows of a product beyond the published price: the description and the photo, as registered today. */
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
    `SELECT p.id, p.description, ph.bytes
       FROM products p
       LEFT JOIN product_photos ph ON ph.product_id = p.id
      WHERE p.id = ANY($1::integer[])`,
    [ids],
  );
  return new Map(
    rows.map((row) => [
      Number(row.id),
      { description: row.description === null ? null : String(row.description), photo: (row.bytes as Buffer | null) ?? null },
    ]),
  );
}

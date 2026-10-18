import type { PriceTableItem } from "@/lib/db/price-table";
import type { Product } from "@/lib/db/products";
import type { Queryable } from "@/lib/db/pool";
import { listResult } from "@/lib/list-query";
import type { ListQuery, ListResult } from "@/lib/list-query";
import type { ReviewCategory } from "@/lib/price-table-review";

export type RawPriceTableReviewRow = { category: ReviewCategory; current: Product | null; published: PriceTableItem | null };

const normalizedSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

const REVIEW_CTE = `WITH current_items AS (
      SELECT id, name, code, advisory_cost, tax_credit, packaging, line_id
        FROM products
       WHERE line_id = $1 AND active AND advisory_cost > 0
         AND advisory_cost * (1 - tax_credit) * (1 + $3::numeric) + packaging > 0
    ), old_items AS (
      SELECT * FROM price_table_items WHERE version = $2
    ), compared AS (
      SELECT c.id AS current_id, c.name AS current_name, c.code AS current_code,
             c.advisory_cost AS current_cost, c.tax_credit AS current_credit, c.packaging AS current_packaging, c.line_id,
             old.product_id AS old_id, old.name AS old_name, old.code AS old_code,
             old.advisory_cost AS old_cost, old.tax_credit AS old_credit, old.packaging AS old_packaging,
             old.table_price AS old_table, old.table_price_with_ipi AS old_table_ipi,
             CASE
               WHEN old.product_id IS NULL THEN 'novos'
               WHEN c.id IS NULL THEN 'removidos'
               WHEN c.advisory_cost IS DISTINCT FROM old.advisory_cost OR c.tax_credit IS DISTINCT FROM old.tax_credit OR c.packaging IS DISTINCT FROM old.packaging THEN 'custos'
               WHEN c.name IS DISTINCT FROM old.name OR c.code IS DISTINCT FROM old.code THEN 'cadastro'
               WHEN $4::boolean THEN 'regras'
               ELSE NULL
             END AS category
        FROM current_items c
        FULL JOIN old_items old ON old.product_id = c.id
    ), filtered AS (
      SELECT * FROM compared
       WHERE category IS NOT NULL
         AND ($5 = '' OR strpos(translate(lower(COALESCE(current_name, old_name, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), $5) > 0
           OR strpos(translate(lower(COALESCE(current_code, old_code, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), $5) > 0)
         AND ($6::text IS NULL OR category = $6)
    )`;
const REVIEW_COUNT_SQL = `${REVIEW_CTE} SELECT count(*) AS total FROM filtered`;
const reviewPageSql = (direction: "ASC" | "DESC") => `${REVIEW_CTE} SELECT * FROM filtered
      ORDER BY lower(COALESCE(current_name, old_name)) ${direction}, COALESCE(current_id, old_id) ${direction}
      LIMIT $7 OFFSET $8`;

/** One database page of changed products; unchanged products appear only when changed rules affect them. */
export async function queryPriceTableReview(
  query: ListQuery<"nome">,
  lineId: number,
  publishedVersion: number | null,
  rulesChanged: boolean,
  safetyMargin: number,
  conn: Queryable,
): Promise<ListResult<RawPriceTableReviewRow>> {
  const category = query.filters.categoria?.[0] ?? null;
  const values: unknown[] = [lineId, publishedVersion ?? 0, safetyMargin, rulesChanged, normalizedSearch(query.search), category];
  const counted = await conn.query(REVIEW_COUNT_SQL, values);
  const total = Number(counted.rows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(pages, query.page);
  const dataValues = [...values, query.pageSize, (page - 1) * query.pageSize];
  const { rows } = await conn.query(reviewPageSql(query.direction === "asc" ? "ASC" : "DESC"), dataValues);
  const number = (value: unknown) => Number(value);
  const nullableText = (value: unknown) => value === null ? null : String(value);
  return listResult(rows.map((row): RawPriceTableReviewRow => ({
    category: row.category as ReviewCategory,
    current: row.current_id === null ? null : {
      id: number(row.current_id), name: String(row.current_name), code: nullableText(row.current_code),
      description: null, supplierName: null, supplierModel: null, supplierPriceUsd: null,
      advisoryCost: number(row.current_cost), taxCredit: number(row.current_credit), packaging: number(row.current_packaging),
      active: true, lineId: number(row.line_id), hasPhoto: false, ncm: null, plateLoaded: false,
    },
    published: row.old_id === null ? null : {
      productId: number(row.old_id), name: String(row.old_name), code: nullableText(row.old_code),
      advisoryCost: number(row.old_cost), taxCredit: number(row.old_credit), packaging: number(row.old_packaging),
      table: number(row.old_table), tableWithIpi: number(row.old_table_ipi),
    },
  })), total, page, query.pageSize);
}

import { PARAM_COLUMN_LIST } from "@/lib/db/params";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";

const COLUMN_LIST = PARAM_COLUMN_LIST;
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

export type ProductLine = { id: number; name: string; products: number; versions: number };

/** A problem the directors can fix on the screen. */
export class ProductLineError extends Error {}

const SAME_NAME = "Já existe uma linha com esse nome.";
const IN_USE = "Esta linha tem equipamentos ou tabela publicada: mova os equipamentos para outra linha antes. Linha que já publicou tabela não é removida.";

const toLine = (row: Record<string, unknown>): ProductLine => ({
  id: Number(row.id),
  name: String(row.name),
  products: Number(row.products ?? 0),
  versions: Number(row.versions ?? 0),
});

/** Every line, the oldest first, with how many equipments and publications each has. */
export async function listLines(conn: Queryable): Promise<ProductLine[]> {
  const { rows } = await conn.query(
    `SELECT l.id, l.name,
            (SELECT count(*) FROM products p WHERE p.line_id = l.id) AS products,
            (SELECT count(*) FROM price_table_versions v WHERE v.line_id = l.id) AS versions
       FROM product_lines l ORDER BY l.id`,
  );
  return rows.map(toLine);
}

function assertNameAndAuthor(name: string, updatedBy: string): string {
  const clean = name.trim();
  if (clean === "") throw new ProductLineError("Informe o nome da linha.");
  if (clean.length > 60) throw new ProductLineError("Nome da linha com até 60 letras.");
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está gravando a linha.");
  return clean;
}

/**
 * A new line, born with a copy of the parameters and of the rates by state of
 * `copyFrom`: the directors change what differs. One statement: the line, its
 * parameters and its 27 states are written together or not at all.
 */
export async function createLine(name: string, copyFrom: number, updatedBy: string, conn: Queryable): Promise<ProductLine> {
  const clean = assertNameAndAuthor(name, updatedBy);
  try {
    const { rows } = await conn.query(
      `WITH source AS (
         SELECT ${COLUMN_LIST} FROM pricing_params WHERE line_id = $2
       ), created AS (
         INSERT INTO product_lines (name, updated_by)
         SELECT $1, $3 WHERE EXISTS (SELECT 1 FROM source)
         RETURNING id, name
       ), params AS (
         INSERT INTO pricing_params (line_id, ${COLUMN_LIST}, updated_by)
         SELECT created.id, ${COLUMN_LIST}, $3 FROM created, source
         RETURNING line_id
       ), rates AS (
         INSERT INTO state_tax_rates (line_id, uf, internal_icms, fcp, outbound_icms, updated_by)
         SELECT created.id, rate.uf, rate.internal_icms, rate.fcp, rate.outbound_icms, $3
           FROM created, state_tax_rates rate WHERE rate.line_id = $2
         RETURNING line_id
       )
       SELECT id, name FROM created WHERE EXISTS (SELECT 1 FROM params) AND EXISTS (SELECT 1 FROM rates)`,
      [clean, copyFrom, updatedBy],
    );
    if (!rows[0]) throw new ProductLineError("A linha de origem dos parâmetros não existe mais. Recarregue a página.");
    return toLine(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new ProductLineError(SAME_NAME);
    throw error;
  }
}

export async function renameLine(id: number, name: string, updatedBy: string, conn: Queryable): Promise<ProductLine> {
  const clean = assertNameAndAuthor(name, updatedBy);
  try {
    const { rows } = await conn.query(
      "UPDATE product_lines SET name = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING id, name",
      [id, clean, updatedBy],
    );
    if (!rows[0]) throw new ProductLineError("Linha não encontrada. Recarregue a página.");
    return toLine(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new ProductLineError(SAME_NAME);
    throw error;
  }
}

/**
 * Removes a line that has no equipment and never published a table, with its
 * parameters and rates. One statement: the foreign keys are checked at its end. The last line of the company stays.
 */
export async function deleteLine(id: number, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query(
      `WITH free AS (
         SELECT id FROM product_lines l
          WHERE l.id = $1
            AND (SELECT count(*) FROM product_lines) > 1
            AND NOT EXISTS (SELECT 1 FROM products p WHERE p.line_id = l.id)
            AND NOT EXISTS (SELECT 1 FROM price_table_versions v WHERE v.line_id = l.id)
       ), rates AS (
         DELETE FROM state_tax_rates WHERE line_id IN (SELECT id FROM free) RETURNING line_id
       ), params AS (
         DELETE FROM pricing_params WHERE line_id IN (SELECT id FROM free) RETURNING line_id
       ), fiscal AS (
         DELETE FROM fiscal_rules WHERE line_id IN (SELECT id FROM free) RETURNING line_id
       ), gone AS (
         DELETE FROM product_lines WHERE id IN (SELECT id FROM free) RETURNING id
       )
       SELECT id, (SELECT count(*) FROM rates) AS rates, (SELECT count(*) FROM params) AS params FROM gone`,
      [id],
    );
    if (!rows[0]) {
      const lines = await listLines(conn);
      if (!lines.some((line) => line.id === id)) throw new ProductLineError("Linha não encontrada. Recarregue a página.");
      throw new ProductLineError(lines.length === 1 ? "A empresa precisa de pelo menos uma linha." : IN_USE);
    }
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw new ProductLineError(IN_USE);
    throw error;
  }
}

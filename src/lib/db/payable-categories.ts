import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class PayableCategoryError extends Error {}

export type PayableCategory = { id: number; label: string; position: number; active: boolean };

const UNIQUE_VIOLATION = "23505";
const DUPLICATE = "Já existe uma categoria com este nome.";

const method = (row: Record<string, unknown>): PayableCategory => ({
  id: Number(row.id),
  label: String(row.label),
  position: Number(row.position),
  active: row.active === true,
});

function check(label: string, position: number, who: string): void {
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando as categorias.");
  if (label.trim() === "") throw new PayableCategoryError("Informe o nome da categoria.");
  if (label.trim().length > 60) throw new PayableCategoryError("O nome da categoria tem no máximo 60 caracteres.");
  if (!Number.isSafeInteger(position) || position < 0 || position > 9999) {
    throw new PayableCategoryError("Ordem: informe um número inteiro de 0 a 9999.");
  }
}

/** Every category of the company, the ones turned off too, in the order of the lists. */
export async function listAllPayableCategories(conn: Queryable): Promise<PayableCategory[]> {
  const { rows } = await conn.query("SELECT id, label, position, active FROM payable_categories ORDER BY position, label");
  return rows.map(method);
}

/** A new category goes to the end of the list. */
export async function createPayableCategory(label: string, who: string, conn: Queryable): Promise<PayableCategory> {
  check(label, 0, who);
  try {
    const { rows } = await conn.query(
      `INSERT INTO payable_categories (label, position, updated_by)
       SELECT $1, COALESCE(max(position), 0) + 1, $2 FROM payable_categories
       RETURNING id, label, position, active`,
      [label.trim(), who],
    );
    return method(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new PayableCategoryError(DUPLICATE);
    throw error;
  }
}

/**
 * Renames, reorders or turns a category off. Nothing is deleted: bills keep the
 * name of the category as it was when written, and one turned off only leaves the lists.
 */
export async function updatePayableCategory(
  id: number,
  change: { label: string; position: number; active: boolean },
  who: string,
  conn: Queryable,
): Promise<PayableCategory> {
  check(change.label, change.position, who);
  try {
    const { rows } = await conn.query(
      `UPDATE payable_categories SET label = $2, position = $3, active = $4, updated_at = now(), updated_by = $5
        WHERE id = $1 RETURNING id, label, position, active`,
      [id, change.label.trim(), change.position, change.active, who],
    );
    if (rows.length === 0) throw new PayableCategoryError("Categoria não encontrada.");
    return method(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new PayableCategoryError(DUPLICATE);
    throw error;
  }
}

/** The categories a new bill may take, in the order of the lists. */
export async function listPayableCategories(conn: Queryable): Promise<string[]> {
  const { rows } = await conn.query("SELECT label FROM payable_categories WHERE active ORDER BY position, label");
  return rows.map((row) => String(row.label));
}

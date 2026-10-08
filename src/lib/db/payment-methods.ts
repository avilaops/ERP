import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class PaymentMethodError extends Error {}

export type PaymentMethod = { id: number; label: string; position: number; active: boolean };

const UNIQUE_VIOLATION = "23505";
const DUPLICATE = "Já existe uma forma de pagamento com este nome.";

const method = (row: Record<string, unknown>): PaymentMethod => ({
  id: Number(row.id),
  label: String(row.label),
  position: Number(row.position),
  active: row.active === true,
});

function check(label: string, position: number, who: string): void {
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando as formas de pagamento.");
  if (label.trim() === "") throw new PaymentMethodError("Informe o nome da forma de pagamento.");
  if (label.trim().length > 60) throw new PaymentMethodError("O nome da forma de pagamento tem no máximo 60 caracteres.");
  if (!Number.isSafeInteger(position) || position < 0 || position > 9999) {
    throw new PaymentMethodError("Ordem: informe um número inteiro de 0 a 9999.");
  }
}

/** Every form of payment of the company, the ones turned off too, in the order of the lists. */
export async function listAllPaymentMethods(conn: Queryable): Promise<PaymentMethod[]> {
  const { rows } = await conn.query("SELECT id, label, position, active FROM payment_methods ORDER BY position, label");
  return rows.map(method);
}

/** A new form goes to the end of the list. */
export async function createPaymentMethod(label: string, who: string, conn: Queryable): Promise<PaymentMethod> {
  check(label, 0, who);
  try {
    const { rows } = await conn.query(
      `INSERT INTO payment_methods (label, position, updated_by)
       SELECT $1, COALESCE(max(position), 0) + 1, $2 FROM payment_methods
       RETURNING id, label, position, active`,
      [label.trim(), who],
    );
    return method(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new PaymentMethodError(DUPLICATE);
    throw error;
  }
}

/**
 * Renames, reorders or turns a form off. Nothing is deleted: orders keep the
 * name of the form as it was when chosen, and a form turned off only leaves the lists.
 */
export async function updatePaymentMethod(
  id: number,
  change: { label: string; position: number; active: boolean },
  who: string,
  conn: Queryable,
): Promise<PaymentMethod> {
  check(change.label, change.position, who);
  try {
    const { rows } = await conn.query(
      `UPDATE payment_methods SET label = $2, position = $3, active = $4, updated_at = now(), updated_by = $5
        WHERE id = $1 RETURNING id, label, position, active`,
      [id, change.label.trim(), change.position, change.active, who],
    );
    if (rows.length === 0) throw new PaymentMethodError("Forma de pagamento não encontrada.");
    return method(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new PaymentMethodError(DUPLICATE);
    throw error;
  }
}

/** Removes a form of payment. Orders keep the name they were written with, so nothing else changes. */
export async function deletePaymentMethod(id: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("DELETE FROM payment_methods WHERE id = $1 RETURNING id", [id]);
  if (rows.length === 0) throw new PaymentMethodError("Forma de pagamento não encontrada.");
}

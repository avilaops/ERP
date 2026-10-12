import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { isColorPart } from "@/lib/plates";
import type { ColorPart } from "@/lib/plates";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class ColorError extends Error {}

export type EquipmentColor = { id: number; part: ColorPart; name: string; position: number };

const UNIQUE_VIOLATION = "23505";
const DUPLICATE = "Esta cor já está na lista.";
const COLUMNS = "id, part, name, position";

const color = (row: Record<string, unknown>): EquipmentColor => ({ id: Number(row.id), part: row.part as ColorPart, name: String(row.name), position: Number(row.position) });

function check(name: string, position: number, who: string): void {
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando as cores.");
  if (name.trim() === "") throw new ColorError("Informe o nome da cor.");
  if (name.trim().length > 60) throw new ColorError("O nome da cor tem no máximo 60 caracteres.");
  if (!Number.isSafeInteger(position) || position < 0 || position > 9999) throw new ColorError("Ordem: informe um número inteiro de 0 a 9999.");
}

/** The colours an order may choose, by part, in the order of the lists. */
export async function listEquipmentColors(conn: Queryable): Promise<EquipmentColor[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM equipment_colors ORDER BY part DESC, position, name`);
  return rows.map(color);
}

/** A new colour goes to the end of the list of its part. */
export async function createEquipmentColor(part: string, name: string, who: string, conn: Queryable): Promise<EquipmentColor> {
  if (!isColorPart(part)) throw new ColorError("Escolha se a cor é da estrutura ou do braço articulado.");
  check(name, 0, who);
  try {
    const { rows } = await conn.query(
      `INSERT INTO equipment_colors (part, name, position, updated_by)
       SELECT $1, $2, COALESCE(max(position), 0) + 1, $3 FROM equipment_colors WHERE part = $1
       RETURNING ${COLUMNS}`,
      [part, name.trim(), who],
    );
    return color(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new ColorError(DUPLICATE);
    throw error;
  }
}

/** Renames or reorders. Orders keep the name they chose, as it was. */
export async function updateEquipmentColor(id: number, change: { name: string; position: number }, who: string, conn: Queryable): Promise<EquipmentColor> {
  check(change.name, change.position, who);
  try {
    const { rows } = await conn.query(
      `UPDATE equipment_colors SET name = $2, position = $3, updated_at = now(), updated_by = $4 WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, change.name.trim(), change.position, who],
    );
    if (rows.length === 0) throw new ColorError("Cor não encontrada.");
    return color(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new ColorError(DUPLICATE);
    throw error;
  }
}

/** Takes a colour out of the list. Orders already made keep it. */
export async function deleteEquipmentColor(id: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("DELETE FROM equipment_colors WHERE id = $1 RETURNING id", [id]);
  if (rows.length === 0) throw new ColorError("Cor não encontrada.");
}

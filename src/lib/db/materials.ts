import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class MaterialError extends Error {}

export const MATERIAL_UNITS = { un: "unidade", kg: "kg", m: "metro", m2: "m²", L: "litro", pc: "peça", cx: "caixa" } as const;
export type MaterialUnit = keyof typeof MATERIAL_UNITS;

export type Material = { id: number; name: string; unit: MaterialUnit; stock: number; minimum: number; /** In how many lists of materials it is used. */ usedIn: number };

const COLUMNS = "m.id, m.name, m.unit, m.stock, m.minimum, (SELECT count(*) FROM product_materials b WHERE b.material_id = m.id) AS used_in";
const toMaterial = (row: Record<string, unknown>): Material => ({ id: Number(row.id), name: String(row.name), unit: row.unit as MaterialUnit, stock: Number(row.stock), minimum: Number(row.minimum), usedIn: Number(row.used_in) });

/** Every material, the ones below their minimum first, then by name. */
export async function listMaterials(conn: Queryable): Promise<Material[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM materials m ORDER BY (m.stock < m.minimum) DESC, lower(m.name), m.id`);
  return rows.map(toMaterial);
}

const NOT_FOUND = "Material não encontrado. Recarregue a página.";
const amount = (value: number) => Number.isFinite(value) && Math.abs(value) < 100_000_000;

/** Creates a material (with the stock it starts with) or changes the name, the unit and the minimum of the one with `id`. */
export async function saveMaterial(id: number | null, input: { name: string; unit: string; minimum: number; stock?: number }, who: string, conn: Queryable): Promise<void> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const problems: string[] = [];
  if (name.length < 2 || name.length > 80) problems.push("Nome do material: de 2 a 80 letras.");
  if (!(input.unit in MATERIAL_UNITS)) problems.push("Escolha a unidade.");
  if (!amount(input.minimum) || input.minimum < 0) problems.push("Estoque mínimo: um número, zero ou mais.");
  const start = input.stock ?? 0;
  if (id === null && (!amount(start) || start < 0)) problems.push("Estoque inicial: um número, zero ou mais.");
  if (problems.length > 0) throw new MaterialError(problems.join(" "));
  try {
    if (id === null) {
      await conn.query(
        `WITH made AS (INSERT INTO materials (name, unit, stock, minimum, updated_by) VALUES ($1, $2, $3, $4, $5) RETURNING id)
         INSERT INTO material_moves (material_id, kind, quantity, note, created_by) SELECT id, 'entrada', $3, 'Estoque inicial', $5 FROM made WHERE $3 <> 0`,
        [name, input.unit, start, input.minimum, who],
      );
      return;
    }
    const { rows } = await conn.query("UPDATE materials SET name = $2, unit = $3, minimum = $4, updated_at = now(), updated_by = $5 WHERE id = $1 RETURNING id", [id, name, input.unit, input.minimum, who]);
    if (rows.length === 0) throw new MaterialError(NOT_FOUND);
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new MaterialError("Já existe um material com esse nome.");
    throw error;
  }
}

/** Removes a material no list uses, with the record of its entries and exits. */
export async function deleteMaterial(id: number, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query(
      "WITH target AS (SELECT id FROM materials WHERE id = $1), moved AS (DELETE FROM material_moves v USING target WHERE v.material_id = target.id) DELETE FROM materials m USING target WHERE m.id = target.id RETURNING m.id",
      [id],
    );
    if (rows.length === 0) throw new MaterialError(NOT_FOUND);
  } catch (error) {
    if (pgErrorCode(error) === "23503") throw new MaterialError("Este material está na lista de algum equipamento. Tire-o das listas antes de remover.");
    throw error;
  }
}

/**
 * An entry, an exit or a count by hand. Entry and exit take how much came in
 * or went out; a count takes how much there is, and the difference is what is
 * written down. The balance and the record change together.
 */
export async function moveMaterial(id: number, input: { kind: string; quantity: number; note: string | null }, who: string, conn: Queryable): Promise<void> {
  if (!["entrada", "saida", "ajuste"].includes(input.kind)) throw new MaterialError("Escolha entrada, saída ou contagem.");
  const note = input.note?.trim().replace(/\s+/g, " ").slice(0, 200) || null;
  if (!amount(input.quantity) || input.quantity < 0 || (input.kind !== "ajuste" && input.quantity === 0)) throw new MaterialError("Quantidade: um número maior que zero (na contagem, zero vale).");
  const { rows } = await conn.query(
    `WITH target AS (SELECT id, stock FROM materials WHERE id = $1 FOR UPDATE),
          delta AS (SELECT id, round(CASE $2 WHEN 'entrada' THEN $3::numeric WHEN 'saida' THEN -$3::numeric ELSE $3::numeric - stock END, 3) AS quantity FROM target),
          written AS (INSERT INTO material_moves (material_id, kind, quantity, note, created_by) SELECT id, $2, quantity, $4, $5 FROM delta WHERE quantity <> 0),
          changed AS (UPDATE materials m SET stock = m.stock + delta.quantity, updated_at = now(), updated_by = $5 FROM delta WHERE m.id = delta.id)
     SELECT id FROM target`,
    [id, input.kind, input.quantity, note, who],
  );
  if (rows.length === 0) throw new MaterialError(NOT_FOUND);
}

export type MaterialMove = { kind: string; quantity: number; note: string | null; productionNumber: string | null; at: Date; by: string };

/** The last entries and exits of one material, the newest first. */
export async function listMaterialMoves(id: number, conn: Queryable): Promise<MaterialMove[]> {
  const { rows } = await conn.query(
    "SELECT v.kind, v.quantity, v.note, w.number, v.created_at, v.created_by FROM material_moves v LEFT JOIN production_orders w ON w.id = v.production_order_id WHERE v.material_id = $1 ORDER BY v.id DESC LIMIT 15",
    [id],
  );
  return rows.map((row) => ({ kind: String(row.kind), quantity: Number(row.quantity), note: row.note === null ? null : String(row.note), productionNumber: row.number === null ? null : String(row.number), at: row.created_at as Date, by: String(row.created_by) }));
}

export type ListedProduct = { id: number; code: string; name: string; materials: number };

/** The equipment of the catalogue, with how many materials each list has. No price, no cost. */
export async function listProductsForMaterials(conn: Queryable): Promise<ListedProduct[]> {
  const { rows } = await conn.query(
    "SELECT p.id, COALESCE(p.code, '') AS code, p.name, (SELECT count(*) FROM product_materials b WHERE b.product_id = p.id) AS materials FROM products p WHERE p.active ORDER BY (SELECT count(*) FROM product_materials b WHERE b.product_id = p.id) = 0, p.code, p.name",
  );
  return rows.map((row) => ({ id: Number(row.id), code: String(row.code), name: String(row.name), materials: Number(row.materials) }));
}

export type BillLine = { materialId: number; name: string; unit: MaterialUnit; quantity: number; stock: number };

/** The list of materials of one equipment: what goes in one unit of it. `null` when the equipment does not exist. */
export async function getBill(productId: number, conn: Queryable): Promise<{ product: { id: number; code: string; name: string }; lines: BillLine[] } | null> {
  const product = await conn.query("SELECT id, COALESCE(code, '') AS code, name FROM products WHERE id = $1", [productId]);
  if (!product.rows[0]) return null;
  const { rows } = await conn.query("SELECT b.material_id, m.name, m.unit, b.quantity, m.stock FROM product_materials b JOIN materials m ON m.id = b.material_id WHERE b.product_id = $1 ORDER BY lower(m.name)", [productId]);
  return {
    product: { id: Number(product.rows[0].id), code: String(product.rows[0].code), name: String(product.rows[0].name) },
    lines: rows.map((row) => ({ materialId: Number(row.material_id), name: String(row.name), unit: row.unit as MaterialUnit, quantity: Number(row.quantity), stock: Number(row.stock) })),
  };
}

/** Puts a material in the list of an equipment, or changes how much of it goes in. */
export async function setBillLine(productId: number, materialId: number, quantity: number, who: string, conn: Queryable): Promise<void> {
  if (!amount(quantity) || quantity <= 0) throw new MaterialError("Quantidade por equipamento: um número maior que zero.");
  try {
    await conn.query(
      `INSERT INTO product_materials (product_id, material_id, quantity, updated_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, material_id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [productId, materialId, quantity, who],
    );
  } catch (error) {
    if (pgErrorCode(error) === "23503") throw new MaterialError("Equipamento ou material não encontrado. Recarregue a página.");
    throw error;
  }
}

export async function removeBillLine(productId: number, materialId: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("DELETE FROM product_materials WHERE product_id = $1 AND material_id = $2 RETURNING material_id", [productId, materialId]);
  if (rows.length === 0) throw new MaterialError("Este material não está na lista. Recarregue a página.");
}

/**
 * Makes the stock agree with one production order: a finished order has taken
 * the materials of its list (times its quantity), and one that is not finished
 * has taken none. Whatever is missing or over is written as a consumption or
 * its reversal, so calling this twice changes nothing. `gone` is for an order
 * about to leave production: everything it took comes back.
 */
export async function settleConsumption(productionOrderId: number, who: string, conn: Queryable, { gone = false }: { gone?: boolean } = {}): Promise<void> {
  await conn.query(
    `WITH job AS (SELECT w.id, w.product_id, w.quantity, w.finished_at IS NOT NULL AND NOT $3::boolean AS done FROM production_orders w WHERE w.id = $1),
          taken AS (SELECT v.material_id, -sum(v.quantity) AS quantity FROM material_moves v WHERE v.production_order_id = $1 GROUP BY v.material_id),
          due AS (SELECT b.material_id, round(b.quantity * job.quantity, 3) AS quantity FROM job JOIN product_materials b ON b.product_id = job.product_id WHERE job.done),
          delta AS (SELECT COALESCE(due.material_id, taken.material_id) AS material_id, COALESCE(taken.quantity, 0) - COALESCE(due.quantity, 0) AS quantity FROM due FULL JOIN taken ON taken.material_id = due.material_id),
          written AS (INSERT INTO material_moves (material_id, kind, quantity, production_order_id, created_by)
                      SELECT material_id, CASE WHEN quantity < 0 THEN 'consumo' ELSE 'estorno' END, quantity, $1, $2 FROM delta WHERE quantity <> 0 AND EXISTS (SELECT 1 FROM job))
     UPDATE materials m SET stock = m.stock + delta.quantity, updated_at = now(), updated_by = $2 FROM delta WHERE m.id = delta.material_id AND delta.quantity <> 0 AND EXISTS (SELECT 1 FROM job)`,
    [productionOrderId, who, gone],
  );
}

export type MaterialNeed = { materialId: number; name: string; unit: MaterialUnit; needed: number; stock: number; missing: number; orders: number };

/**
 * What the orders still in production will take, material by material, against
 * what there is: the ones that will run short first. A finished order already
 * took its share, and is not counted.
 */
export async function materialNeeds(conn: Queryable): Promise<{ needs: MaterialNeed[]; withoutList: number }> {
  const { rows } = await conn.query(
    `SELECT m.id, m.name, m.unit, m.stock, sum(round(b.quantity * w.quantity, 3)) AS needed, count(DISTINCT w.id) AS orders
       FROM production_orders w JOIN product_materials b ON b.product_id = w.product_id JOIN materials m ON m.id = b.material_id
      WHERE w.finished_at IS NULL GROUP BY m.id ORDER BY (m.stock - sum(round(b.quantity * w.quantity, 3))), lower(m.name)`,
  );
  const bare = await conn.query("SELECT count(*) AS total FROM production_orders w WHERE w.finished_at IS NULL AND NOT EXISTS (SELECT 1 FROM product_materials b WHERE b.product_id = w.product_id)");
  return {
    needs: rows.map((row) => ({ materialId: Number(row.id), name: String(row.name), unit: row.unit as MaterialUnit, needed: Number(row.needed), stock: Number(row.stock), missing: Math.max(0, Number(row.needed) - Number(row.stock)), orders: Number(row.orders) })),
    withoutList: Number(bare.rows[0].total),
  };
}

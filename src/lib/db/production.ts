import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { completionDate } from "@/lib/order-quote";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class ProductionError extends Error {}

export type ProductionStage = { id: number; name: string; position: number; kind: "andamento" | "pronta"; orders: number };

/** The stages in the order of the factory floor, the one where an order ends last. */
export async function listProductionStages(conn: Queryable): Promise<ProductionStage[]> {
  const { rows } = await conn.query(
    "SELECT s.id, s.name, s.position, s.kind, (SELECT count(*) FROM production_orders o WHERE o.stage_id = s.id) AS orders FROM production_stages s ORDER BY (s.kind = 'pronta'), s.position, s.id",
  );
  return rows.map((row) => ({ id: Number(row.id), name: String(row.name), position: Number(row.position), kind: row.kind as ProductionStage["kind"], orders: Number(row.orders) }));
}

const stageName = (name: string): string => {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 40) throw new ProductionError("Nome da etapa: de 2 a 40 letras.");
  return clean;
};
const SAME_NAME = "Já existe uma etapa com esse nome.";
const STAGE_GONE = "Etapa não encontrada. Recarregue a página.";

/** A new stage of the floor, after the last one and before "ready". */
export async function createProductionStage(name: string, who: string, conn: Queryable): Promise<void> {
  try {
    await conn.query("INSERT INTO production_stages (name, position, kind, updated_by) VALUES ($1, COALESCE((SELECT max(position) FROM production_stages WHERE kind = 'andamento'), 0) + 1, 'andamento', $2)", [stageName(name), who]);
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new ProductionError(SAME_NAME);
    throw error;
  }
}

export async function renameProductionStage(id: number, name: string, who: string, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query("UPDATE production_stages SET name = $2, updated_at = now(), updated_by = $3 WHERE id = $1 RETURNING id", [id, stageName(name), who]);
    if (rows.length === 0) throw new ProductionError(STAGE_GONE);
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new ProductionError(SAME_NAME);
    throw error;
  }
}

/** Swaps a stage of the floor with its neighbour. "Ready" is always the last. */
export async function moveProductionStage(id: number, direction: "antes" | "depois", who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `WITH target AS (SELECT id, position FROM production_stages WHERE id = $1 AND kind = 'andamento'),
          neighbour AS (
            SELECT s.id, s.position FROM production_stages s, target
             WHERE s.kind = 'andamento' AND CASE WHEN $2 = 'antes' THEN s.position < target.position ELSE s.position > target.position END
             ORDER BY CASE WHEN $2 = 'antes' THEN -s.position ELSE s.position END LIMIT 1)
     UPDATE production_stages s SET position = CASE WHEN s.id = target.id THEN neighbour.position ELSE target.position END, updated_at = now(), updated_by = $3
       FROM target, neighbour WHERE s.id IN (target.id, neighbour.id) RETURNING s.id`,
    [id, direction, who],
  );
  if (rows.length === 0) throw new ProductionError("Esta etapa já está na ponta, ou não pode ser movida.");
}

/** Removes a stage of the floor no order is in. "Ready" and the last stage of the floor always stay. */
export async function deleteProductionStage(id: number, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query(
      `WITH target AS (SELECT id FROM production_stages WHERE id = $1 AND kind = 'andamento' AND (SELECT count(*) FROM production_stages WHERE kind = 'andamento') > 1),
            -- The history keeps the name of the stage; only the reference to it goes.
            freed AS (UPDATE production_moves m SET stage_id = NULL FROM target WHERE m.stage_id = target.id)
       DELETE FROM production_stages s USING target WHERE s.id = target.id RETURNING s.id`,
      [id],
    );
    if (rows.length === 0) throw new ProductionError("Esta etapa não pode ser removida: é a de pronto ou a única da fábrica.");
  } catch (error) {
    if (pgErrorCode(error) === "23503") throw new ProductionError("Há ordens nesta etapa. Mova-as para outra etapa antes de remover.");
    throw error;
  }
}

export type WaitingOrder = { number: string; customer: string; closedAt: Date; items: number; pieces: number };

/** The closed orders that are not in production yet, the oldest first. */
export async function listOrdersToProduce(conn: Queryable): Promise<WaitingOrder[]> {
  const { rows } = await conn.query(
    `SELECT o.number, COALESCE(c.trade_name, c.name, '') AS customer, k.closed_at, count(i.product_id) AS items, COALESCE(sum(i.quantity), 0) AS pieces
       FROM orders o JOIN order_closings k ON k.order_id = o.id AND k.reopened_at IS NULL LEFT JOIN customers c ON c.id = o.customer_id JOIN order_items i ON i.order_id = o.id
      WHERE o.status = 'fechado' AND NOT EXISTS (SELECT 1 FROM production_orders p WHERE p.order_id = o.id)
      GROUP BY o.id, c.trade_name, c.name, k.closed_at ORDER BY k.closed_at, o.id`,
  );
  return rows.map((row) => ({ number: String(row.number), customer: String(row.customer), closedAt: row.closed_at as Date, items: Number(row.items), pieces: Number(row.pieces) }));
}

/**
 * Sends a closed order to production: one production order for each
 * equipment of it, in the first stage of the floor, due on the day the order
 * promised (its production time counted from the closing). An order already
 * in production is not sent twice.
 */
export async function sendToProduction(orderNumber: string, who: string, conn: Queryable): Promise<number> {
  const found = await conn.query(
    `SELECT o.id, o.production_days, o.production_unit, to_char(k.closed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS closed
       FROM orders o JOIN order_closings k ON k.order_id = o.id AND k.reopened_at IS NULL WHERE o.number = $1 AND o.status = 'fechado'`,
    [orderNumber],
  );
  const order = found.rows[0];
  if (!order) throw new ProductionError("Só pedido fechado vai para a produção. Recarregue a página.");
  const due = completionDate(String(order.closed), order.production_days === null ? null : Number(order.production_days), order.production_unit === "uteis" ? "uteis" : "corridos");
  try {
    const { rows } = await conn.query(
      `WITH first AS (SELECT id, name FROM production_stages WHERE kind = 'andamento' ORDER BY position, id LIMIT 1),
            made AS (
              INSERT INTO production_orders (number, order_id, product_id, quantity, stage_id, due_on, created_by, updated_by)
              SELECT $2 || '/' || row_number() OVER (ORDER BY p.code, p.id), $1, i.product_id, i.quantity, first.id, $3::date, $4, $4
                FROM order_items i JOIN products p ON p.id = i.product_id, first WHERE i.order_id = $1 RETURNING id, stage_id),
            walked AS (INSERT INTO production_moves (production_order_id, stage_id, stage_name, moved_by) SELECT made.id, made.stage_id, first.name, $4 FROM made, first)
       SELECT id FROM made`,
      [order.id, orderNumber, due, who],
    );
    if (rows.length === 0) throw new ProductionError("Este pedido não tem equipamentos para produzir.");
    return rows.length;
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new ProductionError("Este pedido já está na produção.");
    throw error;
  }
}

export type ProductionOrder = {
  id: number;
  number: string;
  orderNumber: string;
  customer: string;
  productCode: string;
  productName: string;
  quantity: number;
  stageId: number;
  stageName: string;
  stageKind: "andamento" | "pronta";
  dueOn: string | null;
  notes: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

const COLUMNS = `w.id, w.number, o.number AS order_number, COALESCE(c.trade_name, c.name, '') AS customer, COALESCE(p.code, '') AS product_code, p.name AS product_name, w.quantity,
  w.stage_id, s.name AS stage_name, s.kind AS stage_kind, w.due_on::text AS due_on, w.notes, w.created_at, w.finished_at`;
const FROM = "production_orders w JOIN orders o ON o.id = w.order_id LEFT JOIN customers c ON c.id = o.customer_id JOIN products p ON p.id = w.product_id JOIN production_stages s ON s.id = w.stage_id";

const toOrder = (row: Record<string, unknown>): ProductionOrder => ({
  id: Number(row.id), number: String(row.number), orderNumber: String(row.order_number), customer: String(row.customer), productCode: String(row.product_code), productName: String(row.product_name),
  quantity: Number(row.quantity), stageId: Number(row.stage_id), stageName: String(row.stage_name), stageKind: row.stage_kind as ProductionOrder["stageKind"], dueOn: row.due_on === null ? null : String(row.due_on),
  notes: row.notes === null ? null : String(row.notes), createdAt: row.created_at as Date, finishedAt: (row.finished_at as Date | null) ?? null,
});

/** The production orders of one stage: the ones due first on top; in "ready", the last finished first. */
export async function listProductionOrders(stageId: number, conn: Queryable): Promise<ProductionOrder[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE w.stage_id = $1 ORDER BY w.finished_at DESC NULLS LAST, w.due_on NULLS LAST, w.id`, [stageId]);
  return rows.map(toOrder);
}

export async function getProductionOrder(id: number, conn: Queryable): Promise<ProductionOrder | null> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM ${FROM} WHERE w.id = $1`, [id]);
  return rows[0] ? toOrder(rows[0]) : null;
}

const ORDER_GONE = "Ordem de produção não encontrada. Recarregue a página.";

/** Moves a production order to a stage. Reaching "ready" marks when it was finished; leaving it clears the mark. */
export async function moveProductionOrder(id: number, stageId: number, who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `WITH stage AS (SELECT id, name, kind FROM production_stages WHERE id = $2),
          moved AS (
            UPDATE production_orders w SET stage_id = stage.id, finished_at = CASE WHEN stage.kind = 'pronta' THEN COALESCE(w.finished_at, now()) END, updated_at = now(), updated_by = $3
              FROM stage WHERE w.id = $1 AND w.stage_id <> stage.id RETURNING w.id),
          walked AS (INSERT INTO production_moves (production_order_id, stage_id, stage_name, moved_by) SELECT moved.id, stage.id, stage.name, $3 FROM moved, stage)
     SELECT (SELECT count(*) FROM stage) AS stages, (SELECT count(*) FROM moved) AS moved, EXISTS (SELECT 1 FROM production_orders WHERE id = $1) AS found`,
    [id, stageId, who],
  );
  if (!rows[0].found) throw new ProductionError(ORDER_GONE);
  if (Number(rows[0].stages) === 0) throw new ProductionError(STAGE_GONE);
}

/** Changes the day an order is due and what is noted on it. */
export async function saveProductionOrder(id: number, input: { dueOn: string | null; notes: string | null }, who: string, conn: Queryable): Promise<void> {
  const dueOn = input.dueOn?.trim() || null;
  const notes = input.notes?.replace(/\r\n?/g, "\n").trim() || null;
  const problems: string[] = [];
  if (dueOn !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn) || Number.isNaN(Date.parse(`${dueOn}T12:00:00Z`)))) problems.push("Data inválida.");
  if (notes !== null && notes.length > 2000) problems.push("Observações: até 2.000 letras.");
  if (problems.length > 0) throw new ProductionError(problems.join(" "));
  const { rows } = await conn.query("UPDATE production_orders SET due_on = $2::date, notes = $3, updated_at = now(), updated_by = $4 WHERE id = $1 RETURNING id", [id, dueOn, notes, who]);
  if (rows.length === 0) throw new ProductionError(ORDER_GONE);
}

/** Takes an order out of production, with its history. The sales order is not touched, and can be sent again. */
export async function deleteProductionOrder(id: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `WITH target AS (SELECT id FROM production_orders WHERE id = $1), walked AS (DELETE FROM production_moves m USING target WHERE m.production_order_id = target.id)
     DELETE FROM production_orders w USING target WHERE w.id = target.id RETURNING w.id`,
    [id],
  );
  if (rows.length === 0) throw new ProductionError(ORDER_GONE);
}

export type ProductionMove = { stageName: string; movedAt: Date; movedBy: string };

export async function listProductionMoves(id: number, conn: Queryable): Promise<ProductionMove[]> {
  const { rows } = await conn.query("SELECT stage_name, moved_at, moved_by FROM production_moves WHERE production_order_id = $1 ORDER BY id", [id]);
  return rows.map((row) => ({ stageName: String(row.stage_name), movedAt: row.moved_at as Date, movedBy: String(row.moved_by) }));
}

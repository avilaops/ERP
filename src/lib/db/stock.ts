import type { Plates } from "@/lib/plates";
import type { Queryable } from "@/lib/db/pool";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class StockError extends Error {}

/**
 * The stock of ready equipment. `physical` is what is in the warehouse (every
 * move added up); `committed` is what closed orders still have to take out;
 * `available` is what can still be promised; `incoming` is what was bought and
 * has not arrived. Quantities only: no cost lives here.
 */
export type StockRow = { productId: number; code: string | null; name: string; line: string; physical: number; committed: number; available: number; incoming: number };

/** An order counts as shipped while its moves take more out than they brought back. */
const SHIPPED = "(SELECT m.order_id FROM stock_moves m WHERE m.order_id IS NOT NULL GROUP BY m.order_id HAVING sum(m.quantity) < 0)";

const STOCK = `
  SELECT p.id, p.code, p.name, l.name AS line,
         COALESCE((SELECT sum(m.quantity) FROM stock_moves m WHERE m.product_id = p.id), 0) AS physical,
         COALESCE((SELECT sum(i.quantity) FROM order_items i JOIN orders o ON o.id = i.order_id
                    WHERE i.product_id = p.id AND o.status = 'fechado' AND o.id NOT IN ${SHIPPED}), 0) AS committed,
         COALESCE((SELECT sum(i.quantity) FROM purchase_items i JOIN purchases b ON b.id = i.purchase_id
                    WHERE i.product_id = p.id AND b.status IN ('pedido', 'em_transito')), 0) AS incoming
    FROM products p JOIN product_lines l ON l.id = p.line_id
   WHERE p.active OR EXISTS (SELECT 1 FROM stock_moves m WHERE m.product_id = p.id)
   ORDER BY l.name, p.code NULLS LAST, lower(p.name), p.id`;

const stockRow = (row: Record<string, unknown>): StockRow => {
  const [physical, committed] = [Number(row.physical), Number(row.committed)];
  return { productId: Number(row.id), code: row.code === null ? null : String(row.code), name: String(row.name), line: String(row.line), physical, committed, available: physical - committed, incoming: Number(row.incoming) };
};

export async function listStock(conn: Queryable): Promise<StockRow[]> {
  const { rows } = await conn.query(STOCK);
  return rows.map(stockRow);
}

export async function productStock(productId: number, conn: Queryable): Promise<StockRow | null> {
  if (!Number.isSafeInteger(productId)) return null;
  return (await listStock(conn)).find((row) => row.productId === productId) ?? (await bareProduct(productId, conn));
}

/** An inactive product that never moved is not in the list, but its screen still opens. */
async function bareProduct(productId: number, conn: Queryable): Promise<StockRow | null> {
  const { rows } = await conn.query("SELECT p.id, p.code, p.name, l.name AS line, 0 AS physical, 0 AS committed, 0 AS incoming FROM products p JOIN product_lines l ON l.id = p.line_id WHERE p.id = $1", [productId]);
  return rows[0] ? stockRow(rows[0]) : null;
}

export type StockMove = { id: number; kind: "compra" | "venda" | "ajuste" | "estorno"; quantity: number; note: string | null; orderNumber: string | null; purchaseId: number | null; at: Date; by: string };

export async function listProductMoves(productId: number, limit: number, conn: Queryable): Promise<StockMove[]> {
  const { rows } = await conn.query(
    `SELECT m.id, m.kind, m.quantity, m.note, o.number AS order_number, m.purchase_id, m.created_at, m.created_by
       FROM stock_moves m LEFT JOIN orders o ON o.id = m.order_id
      WHERE m.product_id = $1 ORDER BY m.id DESC LIMIT $2`,
    [productId, limit],
  );
  return rows.map((row) => ({ id: Number(row.id), kind: row.kind as StockMove["kind"], quantity: Number(row.quantity), note: row.note === null ? null : String(row.note), orderNumber: row.order_number === null ? null : String(row.order_number), purchaseId: row.purchase_id === null ? null : Number(row.purchase_id), at: row.created_at as Date, by: String(row.created_by) }));
}

/**
 * The count of the warehouse: the person says how many there are, and the
 * difference to what the system had becomes one move. Counting what the system
 * already has writes nothing. One statement, so two counts at once cannot both
 * use the same starting balance.
 */
export async function countStock(productId: number, counted: number, note: string, who: string, conn: Queryable): Promise<{ difference: number }> {
  if (who.trim() === "") throw new Error("Falta dizer quem está contando o estoque.");
  if (!Number.isFinite(counted) || counted < 0 || counted > 100_000_000 || Math.round(counted * 10_000) / 10_000 !== counted) throw new StockError("Contagem: informe zero ou mais, com até quatro casas decimais.");
  const text = note.trim();
  if (text.length > 200) throw new StockError("Observação: até 200 letras.");
  const { rows } = await conn.query(
    `WITH product AS (SELECT id FROM products WHERE id = $1 FOR UPDATE),
          balance AS (SELECT $2::integer - COALESCE((SELECT sum(quantity) FROM stock_moves WHERE product_id = $1), 0)::integer AS difference FROM product),
          written AS (INSERT INTO stock_moves (product_id, kind, quantity, note, created_by)
                      SELECT $1, 'ajuste', difference, $3, $4 FROM balance WHERE difference <> 0 RETURNING quantity)
     SELECT (SELECT count(*) FROM product) AS found, COALESCE((SELECT quantity FROM written), 0) AS difference`,
    [productId, counted, text === "" ? null : text, who],
  );
  if (Number(rows[0].found) === 0) throw new StockError("Equipamento não encontrado.");
  return { difference: Number(rows[0].difference) };
}

export type OrderToShip = { number: string; customer: string | null; closedOn: string; shipped: boolean; items: { name: string; code: string | null; quantity: number; physical: number; plates: Plates | null; frameColor: string | null; armColor: string | null }[] };

const ORDERS = `
  SELECT o.number, c.name AS customer, to_char(o.closed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS closed_on, o.id IN ${SHIPPED} AS shipped,
         (SELECT json_agg(json_build_object('name', p.name, 'code', p.code, 'quantity', i.quantity, 'plates', i.plates, 'frameColor', i.frame_color, 'armColor', i.arm_color,
                 'physical', COALESCE((SELECT sum(m.quantity) FROM stock_moves m WHERE m.product_id = p.id), 0)) ORDER BY p.name)
            FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = o.id) AS items
    FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
   WHERE o.status = 'fechado' AND (o.id IN ${SHIPPED}) = $1
   ORDER BY o.closed_at DESC, o.id DESC LIMIT 200`;

/** Closed orders waiting to leave the warehouse (`shipped` false) or the ones that already left (`true`). */
export async function listOrdersToShip(shipped: boolean, conn: Queryable): Promise<OrderToShip[]> {
  const { rows } = await conn.query(ORDERS, [shipped]);
  return rows.map((row) => ({ number: String(row.number), customer: row.customer === null ? null : String(row.customer), closedOn: String(row.closed_on), shipped: row.shipped === true, items: (row.items ?? []) as OrderToShip["items"] }));
}

const SHIP = `
  WITH target AS (SELECT o.id FROM orders o WHERE o.number = $1 AND o.status = 'fechado' AND o.id NOT IN ${SHIPPED} FOR UPDATE),
       written AS (INSERT INTO stock_moves (product_id, kind, quantity, order_id, created_by)
                   SELECT i.product_id, 'venda', -i.quantity, i.order_id, $2 FROM order_items i JOIN target t ON t.id = i.order_id RETURNING id)
  SELECT count(*) AS items FROM written`;

const UNSHIP = `
  WITH target AS (SELECT o.id FROM orders o WHERE o.number = $1 AND o.id IN ${SHIPPED} FOR UPDATE),
       balance AS (SELECT m.product_id, m.order_id, sum(m.quantity) AS out FROM stock_moves m JOIN target t ON t.id = m.order_id GROUP BY m.product_id, m.order_id HAVING sum(m.quantity) <> 0),
       written AS (INSERT INTO stock_moves (product_id, kind, quantity, order_id, note, created_by)
                   SELECT product_id, 'estorno', -out, order_id, 'Saída desfeita', $2 FROM balance RETURNING id)
  SELECT count(*) AS items FROM written`;

/**
 * The equipment of a closed order leaves the warehouse: one move per item. An
 * order leaves once; the stock may go negative, which is how a count that was
 * never made shows itself, and the screen says so before.
 */
export async function shipOrder(orderNumber: string, who: string, conn: Queryable): Promise<{ items: number }> {
  if (who.trim() === "") throw new Error("Falta dizer quem está dando a saída.");
  const { rows } = await conn.query(SHIP, [orderNumber, who]);
  const items = Number(rows[0].items);
  if (items === 0) throw new StockError("Pedido não encontrado, não fechado ou já expedido.");
  return { items };
}

/** Undoes the shipping of an order: what its moves took out comes back, item by item. */
export async function unshipOrder(orderNumber: string, who: string, conn: Queryable): Promise<{ items: number }> {
  if (who.trim() === "") throw new Error("Falta dizer quem está desfazendo a saída.");
  const { rows } = await conn.query(UNSHIP, [orderNumber, who]);
  const items = Number(rows[0].items);
  if (items === 0) throw new StockError("Pedido não encontrado ou sem saída para desfazer.");
  return { items };
}

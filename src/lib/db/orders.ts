import { taxpayerFromRegistration } from "@/lib/customer";
import { getCustomer } from "@/lib/db/customers";
import type { Customer } from "@/lib/db/customers";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { loadPublishedSnapshot } from "@/lib/db/price-table";
import { engineOrder } from "@/lib/order-quote";
import { ORDER_NUMBER } from "@/lib/order-number";
import { assertAmount } from "@/lib/pricing/money";
import { orderBand } from "@/lib/pricing/order";
import type { DiscountBand } from "@/lib/pricing/order";
import { UFS } from "@/lib/pricing/states";
import type { Uf } from "@/lib/pricing/states";

export type OrderStatus = "em_negociacao" | "aguardando_aprovacao" | "fechado" | "perdido" | "cancelado";

export type Order = {
  id: number;
  /** `260930-BBMN`, without the `#`. */
  number: string;
  status: OrderStatus;
  sellerEmail: string;
  sellerName: string;
  customer: Customer | null;
  /** The version the order was made in. It never changes: it is where the prices come from. */
  priceTableVersion: number;
  discount: number;
  deliveryUf: Uf | null;
  taxpayer: boolean;
  productionDays: number | null;
  /** Freight paid by Ludus, in reais. */
  freight: number;
  notes: string | null;
  downPayment: number;
  /** `AAAA-MM-DD`, or `null`. */
  downPaymentDate: string | null;
  updatedAt: Date;
  closedAt: Date | null;
  items: { productId: number; quantity: number }[];
};

/** Whose orders a session reaches. `null` is everyone's; a seller gets only their own. */
export type OrderScope = { sellerEmail: string | null };

/** A refusal the user can act on. The message goes to the screen as it is. */
export class OrderError extends Error {}

const NOT_EDITABLE = "Pedido não encontrado ou já fechado. Reabra o pedido para alterar.";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

// The date goes out as text: a `date` read as a JS Date would shift with the server's time zone.
const COLUMNS = `id, number, status, seller_email, seller_name, customer_id, price_table_version, discount, delivery_uf,
  taxpayer, production_days, freight, notes, down_payment, to_char(down_payment_date, 'YYYY-MM-DD') AS down_payment_date,
  updated_at, closed_at`;

const notInTable = (version: number) => new OrderError(`Este equipamento não está na tabela v${version}.`);

function assertQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 100_000) {
    throw new OrderError("Quantidade precisa ser um número inteiro maior que zero.");
  }
}

function assertWho(who: string): void {
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando o pedido.");
}

/**
 * Creates the order with its first item, in one statement. `newNumber` draws a
 * number; one already taken is drawn again, up to five times.
 */
export async function createOrder(
  {
    seller,
    version,
    productId,
    quantity,
  }: { seller: { email: string; name: string }; version: number; productId: number; quantity: number },
  newNumber: () => string,
  conn: Queryable,
): Promise<string> {
  assertQuantity(quantity);
  if (seller.email.trim() === "" || seller.name.trim() === "") throw new Error("Pedido sem vendedor.");

  for (let attempt = 1; ; attempt += 1) {
    const number = newNumber();
    if (!ORDER_NUMBER.test(number)) throw new Error("Número de pedido fora do formato AAMMDD-XXXX.");
    try {
      await conn.query(
        `WITH created AS (
           INSERT INTO orders (number, seller_email, seller_name, price_table_version, updated_by)
           VALUES ($1, $2, $3, $4, $2)
           RETURNING id, price_table_version
         )
         INSERT INTO order_items (order_id, price_table_version, product_id, quantity)
         SELECT id, price_table_version, $5::integer, $6::integer FROM created`,
        [number, seller.email, seller.name, version, productId, quantity],
      );
      return number;
    } catch (error) {
      if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw notInTable(version);
      if (pgErrorCode(error) !== UNIQUE_VIOLATION || attempt >= 5) throw error;
    }
  }
}

/** The order, its items and the customer linked to it. An order outside the scope does not exist. */
export async function getOrder(number: string, scope: OrderScope, conn: Queryable): Promise<Order | null> {
  if (!ORDER_NUMBER.test(number)) return null;
  const { rows } = await conn.query(
    `SELECT ${COLUMNS} FROM orders WHERE number = $1 AND ($2::text IS NULL OR seller_email = $2)`,
    [number, scope.sellerEmail],
  );
  const row = rows[0];
  if (!row) return null;

  const items = await conn.query("SELECT product_id, quantity FROM order_items WHERE order_id = $1 ORDER BY product_id", [
    row.id,
  ]);
  return {
    id: Number(row.id),
    number: String(row.number),
    status: row.status as OrderStatus,
    sellerEmail: String(row.seller_email),
    sellerName: String(row.seller_name),
    customer: row.customer_id === null ? null : await getCustomer(Number(row.customer_id), conn),
    priceTableVersion: Number(row.price_table_version),
    discount: Number(row.discount),
    deliveryUf: row.delivery_uf as Uf | null,
    taxpayer: row.taxpayer === true,
    productionDays: row.production_days === null ? null : Number(row.production_days),
    freight: Number(row.freight),
    notes: row.notes === null ? null : String(row.notes),
    downPayment: Number(row.down_payment),
    downPaymentDate: row.down_payment_date === null ? null : String(row.down_payment_date),
    updatedAt: row.updated_at as Date,
    closedAt: row.closed_at as Date | null,
    items: items.rows.map((item) => ({ productId: Number(item.product_id), quantity: Number(item.quantity) })),
  };
}

/** Adds an item of the same version. A product already in the order has its quantity summed. */
export async function addOrderItem(
  number: string,
  productId: number,
  quantity: number,
  who: string,
  scope: OrderScope,
  conn: Queryable,
): Promise<void> {
  assertQuantity(quantity);
  assertWho(who);
  const order = await getOrder(number, scope, conn);
  if (!order || order.status !== "em_negociacao") throw new OrderError(NOT_EDITABLE);

  try {
    const { rows } = await conn.query(
      `WITH target AS (
         UPDATE orders SET updated_at = now(), updated_by = $4
          WHERE number = $1 AND status = 'em_negociacao' AND ($5::text IS NULL OR seller_email = $5)
         RETURNING id, price_table_version
       )
       INSERT INTO order_items (order_id, price_table_version, product_id, quantity)
       SELECT id, price_table_version, $2::integer, $3::integer FROM target
       ON CONFLICT (order_id, product_id) DO UPDATE SET quantity = order_items.quantity + EXCLUDED.quantity
       RETURNING order_id`,
      [number, productId, quantity, who, scope.sellerEmail],
    );
    if (rows.length === 0) throw new OrderError(NOT_EDITABLE);
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw notInTable(order.priceTableVersion);
    throw error;
  }
}

export async function setOrderItemQuantity(
  number: string,
  productId: number,
  quantity: number,
  who: string,
  scope: OrderScope,
  conn: Queryable,
): Promise<void> {
  assertQuantity(quantity);
  assertWho(who);
  const { rows } = await conn.query(
    `WITH target AS (
       UPDATE orders SET updated_at = now(), updated_by = $4
        WHERE number = $1 AND status = 'em_negociacao' AND ($5::text IS NULL OR seller_email = $5)
       RETURNING id
     ), changed AS (
       UPDATE order_items SET quantity = $3 FROM target WHERE order_id = target.id AND product_id = $2 RETURNING 1
     )
     SELECT (SELECT count(*) FROM target)::int AS found, (SELECT count(*) FROM changed)::int AS changed`,
    [number, productId, quantity, who, scope.sellerEmail],
  );
  if (rows[0].found === 0) throw new OrderError(NOT_EDITABLE);
  if (rows[0].changed === 0) throw new OrderError("Este equipamento não está no pedido.");
}

/** Takes an item out. The last one stays: an order needs at least one product. */
export async function removeOrderItem(
  number: string,
  productId: number,
  who: string,
  scope: OrderScope,
  conn: Queryable,
): Promise<void> {
  assertWho(who);
  const order = await getOrder(number, scope, conn);
  if (!order || order.status !== "em_negociacao") throw new OrderError(NOT_EDITABLE);
  if (!order.items.some((item) => item.productId === productId)) throw new OrderError("Este equipamento não está no pedido.");
  const LAST = "O pedido precisa de pelo menos um equipamento.";
  if (order.items.length <= 1) throw new OrderError(LAST);

  // The count is checked again in the statement itself: two removals at once never empty the order.
  const { rows } = await conn.query(
    `WITH target AS (
       UPDATE orders SET updated_at = now(), updated_by = $3
        WHERE number = $1 AND status = 'em_negociacao' AND ($4::text IS NULL OR seller_email = $4)
          AND (SELECT count(*) FROM order_items WHERE order_id = orders.id) > 1
       RETURNING id
     ), removed AS (
       DELETE FROM order_items USING target WHERE order_id = target.id AND product_id = $2 RETURNING 1
     )
     SELECT (SELECT count(*) FROM target)::int AS found`,
    [number, productId, who, scope.sellerEmail],
  );
  if (rows[0].found === 0) throw new OrderError(LAST);
}

export type OrderTerms = {
  discount: number;
  deliveryUf: Uf | null;
  taxpayer: boolean;
  productionDays: number | null;
  freight: number;
  notes: string | null;
};

/**
 * Delivery, conditions and discount. "Contribuinte" only holds for a company
 * with a state registration in numbers: for anyone else it is written as false,
 * whatever was sent.
 */
export async function saveOrderTerms(
  number: string,
  terms: OrderTerms,
  who: string,
  scope: OrderScope,
  conn: Queryable,
): Promise<void> {
  assertWho(who);
  if (!(terms.discount >= 0 && terms.discount < 1)) throw new OrderError("Desconto precisa ser de 0% até menos de 100%.");
  if (terms.deliveryUf !== null && !UFS.includes(terms.deliveryUf)) throw new OrderError("Estado de entrega inválido.");
  if (terms.productionDays !== null && (!Number.isSafeInteger(terms.productionDays) || terms.productionDays <= 0)) {
    throw new OrderError("Prazo de fabricação precisa ser um número inteiro de dias, maior que zero.");
  }
  assertAmount(terms.freight, "Frete");

  const order = await getOrder(number, scope, conn);
  if (!order || order.status !== "em_negociacao") throw new OrderError(NOT_EDITABLE);
  const customer = order.customer;
  const taxpayer = terms.taxpayer && customer !== null && taxpayerFromRegistration(customer.kind, customer.stateRegistration);

  const { rows } = await conn.query(
    `UPDATE orders
        SET discount = $2, delivery_uf = $3, taxpayer = $4, production_days = $5, freight = $6, notes = $7,
            updated_at = now(), updated_by = $8
      WHERE number = $1 AND status = 'em_negociacao' AND ($9::text IS NULL OR seller_email = $9)
      RETURNING id`,
    [
      number,
      terms.discount,
      terms.deliveryUf,
      taxpayer,
      terms.productionDays,
      terms.freight,
      terms.notes?.trim() ? terms.notes.trim() : null,
      who,
      scope.sellerEmail,
    ],
  );
  if (rows.length === 0) throw new OrderError(NOT_EDITABLE);
}

/**
 * Links the customer. The delivery state follows the customer's when the order
 * has none yet, and "contribuinte" follows the state registration.
 */
export async function linkOrderCustomer(
  number: string,
  customerId: number,
  who: string,
  scope: OrderScope,
  conn: Queryable,
): Promise<void> {
  assertWho(who);
  const customer = await getCustomer(customerId, conn);
  if (!customer) throw new OrderError("Cliente não encontrado.");

  const { rows } = await conn.query(
    `UPDATE orders
        SET customer_id = $2, delivery_uf = COALESCE(delivery_uf, $3), taxpayer = $4, updated_at = now(), updated_by = $5
      WHERE number = $1 AND status = 'em_negociacao' AND ($6::text IS NULL OR seller_email = $6)
      RETURNING id`,
    [number, customer.id, customer.uf, taxpayerFromRegistration(customer.kind, customer.stateRegistration), who, scope.sellerEmail],
  );
  if (rows.length === 0) throw new OrderError(NOT_EDITABLE);
}

/** How the order stands, in what the whole team may know: only the name of the band. */
export type OrderStanding = { band: DiscountBand | null };

/**
 * The only reading of cost made for an order of someone outside Diretoria. The
 * costs of the version are used here, on the server, to place the discount in a
 * band, and nothing of them leaves: only the band. `null` without delivery state.
 */
export async function loadOrderStanding(order: Order, conn: Queryable): Promise<OrderStanding> {
  if (order.deliveryUf === null) return { band: null };
  const snapshot = await loadPublishedSnapshot(order.priceTableVersion, conn);
  if (!snapshot) throw new Error(`Tabela v${order.priceTableVersion} não encontrada.`);
  const input = engineOrder(order, snapshot);
  return { band: input ? orderBand(input, snapshot.params) : null };
}

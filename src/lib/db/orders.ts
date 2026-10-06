import { createHash } from "node:crypto";
import { taxpayerFromRegistration } from "@/lib/customer";
import { getCustomer } from "@/lib/db/customers";
import type { Customer } from "@/lib/db/customers";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { loadPublishedSnapshot, loadPublishedTable } from "@/lib/db/price-table";
import { isoDate } from "@/lib/format";
import { closingProblems, engineOrder, paymentOf, receivableColumns, saleOf } from "@/lib/order-quote";
import { ORDER_NUMBER } from "@/lib/order-number";
import { assertAmount } from "@/lib/pricing/money";
import { orderBand, policyCheck, quoteSale } from "@/lib/pricing/order";
import type { ApprovalReason, DiscountBand, PolicyCheck } from "@/lib/pricing/order";
import { parseDate } from "@/lib/pricing/payment";
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
  downPaymentMethod: string | null;
  /** `AAAA-MM-DD`, or `null`: paid when the order is confirmed. */
  downPaymentDate: string | null;
  balanceMethod: string | null;
  installmentCount: number | null;
  firstInstallmentDays: number | null;
  installmentIntervalDays: number | null;
  paymentNotes: string | null;
  updatedAt: Date;
  /** `updated_at` exactly as the database holds it: what "nobody changed it since I read it" is checked against. */
  revision: string;
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
  taxpayer, production_days, freight, notes, down_payment, down_payment_method,
  to_char(down_payment_date, 'YYYY-MM-DD') AS down_payment_date, balance_method, installment_count,
  first_installment_days, installment_interval_days, payment_notes, updated_at, updated_at::text AS revision, closed_at`;

const textOrNull = (value: unknown) => (value === null ? null : String(value));
const numberOrNull = (value: unknown) => (value === null ? null : Number(value));
const blankToNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

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
    downPaymentMethod: textOrNull(row.down_payment_method),
    downPaymentDate: textOrNull(row.down_payment_date),
    balanceMethod: textOrNull(row.balance_method),
    installmentCount: numberOrNull(row.installment_count),
    firstInstallmentDays: numberOrNull(row.first_installment_days),
    installmentIntervalDays: numberOrNull(row.installment_interval_days),
    paymentNotes: textOrNull(row.payment_notes),
    updatedAt: row.updated_at as Date,
    revision: String(row.revision),
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

/**
 * How the order stands, in what the whole team may know: the name of the band
 * and whether the policy sends it to approval, with the reasons. No limit, no
 * cost, no profit.
 */
export type OrderStanding = { band: DiscountBand | null; policy: PolicyCheck | null };

/**
 * The only reading of cost made for an order of someone outside Diretoria. The
 * costs of the version are used here, on the server, to place the discount in a
 * band and to check the policy, and nothing of them leaves. Without delivery
 * state there is neither.
 */
export async function loadOrderStanding(order: Order, conn: Queryable): Promise<OrderStanding> {
  if (order.deliveryUf === null) return { band: null, policy: null };
  const snapshot = await loadPublishedSnapshot(order.priceTableVersion, conn);
  if (!snapshot) throw new Error(`Tabela v${order.priceTableVersion} não encontrada.`);
  const input = engineOrder(order, snapshot);
  if (!input) return { band: null, policy: null };

  const band = orderBand(input, snapshot.params);
  const { invoiceTotal } = quoteSale(input, snapshot.params);
  return {
    band,
    policy: policyCheck({ discount: order.discount, downPayment: order.downPayment, invoiceTotal, band }, snapshot.params),
  };
}

export type OrderPayment = {
  downPayment: number;
  downPaymentMethod: string | null;
  /** `AAAA-MM-DD`, or `null`: on confirmation of the order. */
  downPaymentDate: string | null;
  balanceMethod: string | null;
  installmentCount: number | null;
  firstInstallmentDays: number | null;
  installmentIntervalDays: number | null;
  paymentNotes: string | null;
};

const wholeOrNull = (value: number | null, minimum: number) =>
  value === null || (Number.isSafeInteger(value) && value >= minimum);

/** "Forma de pagamento", as agreed with the customer. The down payment never exceeds the invoice total. */
export async function savePayment(
  number: string,
  payment: OrderPayment,
  who: string,
  scope: OrderScope,
  conn: Queryable,
): Promise<void> {
  assertWho(who);
  assertAmount(payment.downPayment, "Entrada");
  if (payment.downPaymentDate !== null) parseDate(payment.downPaymentDate);
  if (!wholeOrNull(payment.installmentCount, 1)) throw new OrderError("Parcelas: informe um número inteiro maior que zero.");
  if (!wholeOrNull(payment.firstInstallmentDays, 0) || !wholeOrNull(payment.installmentIntervalDays, 0)) {
    throw new OrderError("Prazos das parcelas precisam ser dias inteiros, sem valor negativo.");
  }

  const order = await getOrder(number, scope, conn);
  if (!order || order.status !== "em_negociacao") throw new OrderError(NOT_EDITABLE);
  const table = await loadPublishedTable(order.priceTableVersion, conn);
  if (!table) throw new Error(`Tabela v${order.priceTableVersion} não encontrada.`);
  const { invoiceTotal } = saleOf(order, table);
  if (payment.downPayment > invoiceTotal) {
    throw new OrderError("A entrada não pode ser maior que o total da nota.");
  }

  const { rows } = await conn.query(
    `UPDATE orders
        SET down_payment = $2, down_payment_method = $3, down_payment_date = $4, balance_method = $5,
            installment_count = $6, first_installment_days = $7, installment_interval_days = $8, payment_notes = $9,
            updated_at = now(), updated_by = $10
      WHERE number = $1 AND status = 'em_negociacao' AND ($11::text IS NULL OR seller_email = $11)
      RETURNING id`,
    [
      number,
      payment.downPayment,
      blankToNull(payment.downPaymentMethod),
      payment.downPaymentDate,
      blankToNull(payment.balanceMethod),
      payment.installmentCount,
      payment.firstInstallmentDays,
      payment.installmentIntervalDays,
      blankToNull(payment.paymentNotes),
      who,
      scope.sellerEmail,
    ],
  );
  if (rows.length === 0) throw new OrderError(NOT_EDITABLE);
}

export type CloseResult = {
  /** How the order ended up. Unchanged when something is missing. */
  status: OrderStatus;
  /** Why it went to approval instead of closing. */
  reasons: ApprovalReason[];
  /** What is missing to close. With any, nothing was written. */
  missing: string[];
};

/**
 * A digest of what price and policy depend on. The request for approval keeps
 * it: an approval is about this order exactly as it was.
 */
export function orderSignature(
  order: Pick<Order, "priceTableVersion" | "items" | "discount" | "deliveryUf" | "taxpayer" | "freight" | "downPayment">,
): string {
  const parts = [
    order.priceTableVersion,
    order.items.map((item) => [item.productId, item.quantity]),
    order.discount,
    order.deliveryUf,
    order.taxpayer,
    order.freight,
    order.downPayment,
  ];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

const CHANGED = "O pedido foi alterado por outra pessoa enquanto você fechava. Confira e feche de novo.";

/**
 * "Fechar pedido". Everything is read and checked again here, on the server:
 * what is missing, then the policy. Inside the policy the order is closed; outside
 * it waits for approval, with the reasons. The write only happens if the order is
 * still exactly as it was read.
 */
export async function closeOrder(number: string, who: string, scope: OrderScope, conn: Queryable): Promise<CloseResult> {
  assertWho(who);
  const order = await getOrder(number, scope, conn);
  if (!order || order.status !== "em_negociacao") throw new OrderError(NOT_EDITABLE);
  const table = await loadPublishedTable(order.priceTableVersion, conn);
  if (!table) throw new Error(`Tabela v${order.priceTableVersion} não encontrada.`);
  const sale = saleOf(order, table);

  const missing = closingProblems(order, sale);
  if (missing.length > 0) return { status: order.status, reasons: [], missing };
  const { policy } = await loadOrderStanding(order, conn);
  if (!policy) throw new Error("Pedido sem estado de entrega chegou à política.");

  const status: OrderStatus = policy.needsApproval ? "aguardando_aprovacao" : "fechado";
  const plan = receivableColumns(paymentOf(order, sale, table, isoDate(new Date())));
  // One statement: the order changes and, when it closes, the closing is recorded with it.
  const { rows } = await conn.query(
    `WITH closed AS (
       UPDATE orders
          SET status = $2, closed_at = CASE WHEN $2 = 'fechado' THEN now() END, updated_at = now(), updated_by = $3
        WHERE number = $1 AND status = 'em_negociacao' AND updated_at::text = $4
          AND ($5::text IS NULL OR seller_email = $5)
        RETURNING id, status
     ), recorded AS (
       INSERT INTO order_closings (order_id, closed_by, invoice_total)
       SELECT id, $3, $6::numeric FROM closed WHERE status = 'fechado'
     ), requested AS (
       INSERT INTO order_approvals (order_id, requested_by, revision_hash, reasons)
       SELECT id, $3, $7, $8::text[] FROM closed WHERE status = 'aguardando_aprovacao'
     ), receivable AS (
       -- What the order expects to receive, from the plan. Closing again after a reopening
       -- rewrites what was not received yet.
       INSERT INTO receivables (order_id, kind, number, due_date, amount, method, updated_by)
       SELECT closed.id, plan.kind, plan.number, plan.due_date::date, plan.amount, plan.method, $3
         FROM closed,
              unnest($9::text[], $10::int[], $11::text[], $12::numeric[], $13::text[]) AS plan (kind, number, due_date, amount, method)
        WHERE closed.status = 'fechado'
       ON CONFLICT (order_id, kind, number) DO UPDATE
          SET due_date = EXCLUDED.due_date, amount = EXCLUDED.amount, method = EXCLUDED.method,
              status = 'aberta', updated_at = now(), updated_by = EXCLUDED.updated_by
        WHERE receivables.status <> 'recebida'
     )
     SELECT id FROM closed`,
    [
      number,
      status,
      who,
      order.revision,
      scope.sellerEmail,
      sale.invoiceTotal,
      orderSignature(order),
      policy.reasons,
      plan.kinds,
      plan.numbers,
      plan.dueDates,
      plan.amounts,
      plan.methods,
    ],
  );
  if (rows.length === 0) throw new OrderError(CHANGED);
  return { status, reasons: policy.reasons, missing: [] };
}

/**
 * Back to negotiation, from closed or from waiting for approval. The version of
 * the table does not change: the order keeps the prices it was made with.
 */
export async function reopenOrder(number: string, who: string, scope: OrderScope, conn: Queryable): Promise<void> {
  assertWho(who);
  const received = await conn.query(
    `SELECT 1 FROM receivables r JOIN orders o ON o.id = r.order_id
      WHERE o.number = $1 AND ($2::text IS NULL OR o.seller_email = $2) AND r.status = 'recebida' LIMIT 1`,
    [number, scope.sellerEmail],
  );
  if (received.rows.length > 0) {
    throw new OrderError("Este pedido já tem valor recebido e não pode ser reaberto. Fale com o financeiro.");
  }
  const { rows } = await conn.query(
    `WITH reopened AS (
       UPDATE orders
          SET status = 'em_negociacao', closed_at = NULL, updated_at = now(), updated_by = $2
        WHERE number = $1 AND status IN ('fechado', 'aguardando_aprovacao')
          AND ($3::text IS NULL OR seller_email = $3)
          AND NOT EXISTS (SELECT 1 FROM receivables r WHERE r.order_id = orders.id AND r.status = 'recebida')
        RETURNING id
     ), cancelled AS (
       -- What was still to be received leaves with the closing.
       UPDATE receivables SET status = 'cancelada', updated_at = now(), updated_by = $2
         FROM reopened WHERE order_id = reopened.id AND status = 'aberta'
     ), marked AS (
       UPDATE order_closings SET reopened_at = now(), reopened_by = $2
         FROM reopened WHERE order_id = reopened.id AND reopened_at IS NULL
     ), withdrawn AS (
       -- A request nobody decided leaves with the order: it is asked again at the next closing.
       DELETE FROM order_approvals USING reopened WHERE order_id = reopened.id AND status = 'pendente'
     )
     SELECT id FROM reopened`,
    [number, who, scope.sellerEmail],
  );
  if (rows.length === 0) throw new OrderError("Pedido não encontrado, ou não está fechado nem aguardando aprovação.");
}

/**
 * Removes an order in negotiation, items and order in the same statement. An
 * order that was once closed, approved or refused has history and is refused by the database.
 * Answers with who the seller was, for the log.
 */
export async function deleteOrder(number: string, scope: OrderScope, conn: Queryable): Promise<{ sellerEmail: string }> {
  try {
    const { rows } = await conn.query(
      `WITH target AS (
         SELECT id, seller_email FROM orders
          WHERE number = $1 AND status = 'em_negociacao' AND ($2::text IS NULL OR seller_email = $2)
       ), items AS (
         DELETE FROM order_items USING target WHERE order_id = target.id RETURNING order_id
       ), removed AS (
         DELETE FROM orders USING target WHERE orders.id = target.id RETURNING target.seller_email
       )
       SELECT seller_email FROM removed`,
      [number, scope.sellerEmail],
    );
    if (rows.length === 0) throw new OrderError("Pedido não encontrado ou fora de negociação: só pedido em negociação pode ser excluído.");
    return { sellerEmail: String(rows[0].seller_email) };
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      throw new OrderError("Este pedido tem histórico (fechamento ou aprovação) e não pode ser excluído.");
    }
    throw error;
  }
}

/** One order of the list: what identifies it and what the sale is made of. No sum here. */
export type OrderSummary = {
  number: string;
  status: OrderStatus;
  sellerEmail: string;
  sellerName: string;
  customerName: string | null;
  customerDocument: string | null;
  deliveryUf: Uf | null;
  taxpayer: boolean;
  discount: number;
  /** IPI rate of the version the order was made in. */
  ipi: number;
  updatedAt: Date;
  closedAt: Date | null;
  items: { quantity: number; tableUnitPrice: number }[];
};

/** Every order the scope reaches, newest change first, each with the table price of its own version. */
export async function listOrders(scope: OrderScope, conn: Queryable): Promise<OrderSummary[]> {
  const { rows } = await conn.query(
    `SELECT o.number, o.status, o.seller_email, o.seller_name, c.name AS customer_name, c.trade_name,
            c.document AS customer_document, o.delivery_uf, o.taxpayer, o.discount, v.ipi, o.updated_at, o.closed_at,
            (SELECT json_agg(json_build_object('quantity', i.quantity, 'price', p.table_price) ORDER BY i.product_id)
               FROM order_items i
               JOIN price_table_items p ON p.version = i.price_table_version AND p.product_id = i.product_id
              WHERE i.order_id = o.id) AS items
       FROM orders o
       JOIN price_table_versions v ON v.version = o.price_table_version
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE ($1::text IS NULL OR o.seller_email = $1)
      ORDER BY o.updated_at DESC, o.id DESC`,
    [scope.sellerEmail],
  );
  return rows.map((row) => ({
    number: String(row.number),
    status: row.status as OrderStatus,
    sellerEmail: String(row.seller_email),
    sellerName: String(row.seller_name),
    customerName: textOrNull(row.trade_name ?? row.customer_name),
    customerDocument: textOrNull(row.customer_document),
    deliveryUf: row.delivery_uf as Uf | null,
    taxpayer: row.taxpayer === true,
    discount: Number(row.discount),
    ipi: Number(row.ipi),
    updatedAt: row.updated_at as Date,
    closedAt: row.closed_at as Date | null,
    items: ((row.items as { quantity: number; price: number }[] | null) ?? []).map((item) => ({
      quantity: Number(item.quantity),
      tableUnitPrice: Number(item.price),
    })),
  }));
}

/** The payment methods the company offers, in the order of the lists. */
export async function listPaymentMethods(conn: Queryable): Promise<string[]> {
  const { rows } = await conn.query("SELECT label FROM payment_methods WHERE active ORDER BY position, label");
  return rows.map((row) => String(row.label));
}

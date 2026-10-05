import type { Order } from "@/lib/db/orders";
import type { PublishedSnapshot, PublishedTable } from "@/lib/db/price-table";
import { isoDate } from "@/lib/format";
import { orderMaxDiscounts, quoteOrder, quoteSale } from "@/lib/pricing/order";
import type { OrderInput, OrderQuote, SaleQuote } from "@/lib/pricing/order";
import { addDays } from "@/lib/pricing/payment";
import { realCost } from "@/lib/pricing/product";
import type { MaxDiscounts } from "@/lib/pricing/table";

/** What the functions here need from an order: no more than the database row and its items. */
type OrderData = Pick<
  Order,
  "items" | "discount" | "deliveryUf" | "taxpayer" | "freight" | "productionDays" | "downPaymentDate" | "updatedAt" | "closedAt"
>;

/**
 * The sale as the whole team sees it: each item at the table price of the
 * version of the order, in cents. Nothing here reads a cost.
 */
export function saleOf(order: Pick<Order, "items" | "discount">, table: PublishedTable): SaleQuote {
  const prices = new Map(table.items.map((item) => [item.productId, item.table]));
  const items = order.items.map(({ productId, quantity }) => {
    const tableUnitPrice = prices.get(productId);
    if (tableUnitPrice === undefined) throw new Error(`Equipamento ${productId} não está na tabela v${table.version}.`);
    return { quantity, tableUnitPrice };
  });
  return quoteSale({ items, discount: order.discount }, table);
}

/**
 * The order as the engine takes it, with the costs of its version: real cost in
 * full precision, never the rounded one. `null` while there is no delivery state,
 * because taxes depend on it.
 */
export function engineOrder(order: OrderData, snapshot: PublishedSnapshot): OrderInput | null {
  if (order.deliveryUf === null) return null;
  const costs = new Map(snapshot.items.map((item) => [item.productId, item]));
  const items = order.items.map(({ productId, quantity }) => {
    const item = costs.get(productId);
    if (!item) throw new Error(`Equipamento ${productId} não está na tabela v${snapshot.version}.`);
    return {
      quantity,
      tableUnitPrice: item.table,
      unitRealCost: realCost(item, snapshot.params),
      unitAdvisoryCost: item.advisoryCost,
    };
  });
  return {
    items,
    discount: order.discount,
    destination: { uf: order.deliveryUf, taxpayer: order.taxpayer },
    freight: order.freight,
  };
}

/** The "Só o diretor vê" board and the limits of the discount. */
export type DirectorBoard = { quote: OrderQuote; max: MaxDiscounts; targetNetProfit: number };

/** Only for who `seesCosts`: the caller reads the snapshot only for them. `null` without delivery state. */
export function directorOf(order: OrderData, snapshot: PublishedSnapshot): DirectorBoard | null {
  const input = engineOrder(order, snapshot);
  if (!input) return null;
  return {
    quote: quoteOrder(input, snapshot.params),
    max: orderMaxDiscounts(input, snapshot.params),
    targetNetProfit: snapshot.params.targetNetProfit,
  };
}

export type DueDates = {
  /** Until when the proposal holds: counted from the last change of the order. */
  proposalValidUntil: string;
  /** When production ends, or `null` without a production time. */
  completion: string | null;
};

/**
 * The dates of the order, as `AAAA-MM-DD`. Production counts from the payment of
 * the down payment; without that date, from the closing; without it, from `today`.
 */
export function dueDates(order: OrderData, table: PublishedTable, today: string): DueDates {
  const base = order.downPaymentDate ?? (order.closedAt ? isoDate(order.closedAt) : today);
  return {
    proposalValidUntil: addDays(isoDate(order.updatedAt), table.proposalValidityDays),
    completion: order.productionDays === null ? null : addDays(base, order.productionDays),
  };
}

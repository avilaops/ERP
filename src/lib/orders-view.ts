import { formatDocument, normalizeDocument } from "@/lib/customer";
import type { OrderStatus, OrderSummary } from "@/lib/db/orders";
import { isoDate, showDateTime, showMoney, showPercent } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/order-form";
import { orderIndicators } from "@/lib/pricing/indicators";
import type { OrderIndicators } from "@/lib/pricing/indicators";
import { quoteSale } from "@/lib/pricing/order";
import { ORIGIN_UF } from "@/lib/pricing/states";
import { matchesText } from "@/lib/products-view";

/** The tabs of Pedidos, in the order of the screen. The first is the default. */
export const ORDER_TABS = [
  { key: "abertos", label: "Em aberto", statuses: ["em_negociacao"] },
  { key: "aprovacao", label: "Com aprovação", statuses: ["aguardando_aprovacao"] },
  { key: "fechados", label: "Fechados", statuses: ["fechado"] },
  { key: "perdidos", label: "Perdidos", statuses: ["perdido"] },
  { key: "todos", label: "Todos", statuses: null },
] as const satisfies readonly { key: string; label: string; statuses: readonly OrderStatus[] | null }[];

export type OrderTab = (typeof ORDER_TABS)[number]["key"];

/** The tab named in the address; anything unknown falls back to Em aberto. */
export function parseOrderTab(value: string | undefined): OrderTab {
  return ORDER_TABS.find((tab) => tab.key === value)?.key ?? "abertos";
}

const inTab = (order: OrderSummary, tab: OrderTab) => {
  const statuses: readonly OrderStatus[] | null = ORDER_TABS.find((item) => item.key === tab)?.statuses ?? null;
  return statuses === null || statuses.includes(order.status);
};

/** Customer name, CNPJ/CPF with or without punctuation, or the number with or without `#`. */
export function matchesOrder(order: OrderSummary, search: string): boolean {
  const wanted = search.trim();
  if (wanted === "") return true;
  if (matchesText([order.customerName], wanted)) return true;
  const number = wanted.replace(/^#/, "").toUpperCase();
  if (number !== "" && order.number.includes(number)) return true;
  const document = normalizeDocument(wanted);
  return document !== "" && (order.customerDocument ?? "").includes(document);
}

/** The total of the order as the team sees it, from the engine. */
const invoiceTotal = (order: OrderSummary) =>
  order.items.length === 0 ? 0 : quoteSale({ items: order.items, discount: order.discount }, { ipi: order.ipi }).invoiceTotal;

export type OrderRow = {
  number: string;
  /** Customer name, or "sem cliente". */
  customer: string;
  /** `#260930-BBMN · MA s/ IE · 2 un.` */
  detail: string;
  document: string | null;
  seller: string;
  total: string;
  discount: string;
  status: OrderStatus;
  statusLabel: string;
  updated: string;
};

export type OrdersView = {
  rows: OrderRow[];
  /** How many orders each tab has, before the search. */
  counts: Record<OrderTab, number>;
  indicators: OrderIndicators;
};

/**
 * The orders list, already as text. `orders` are the ones the session reaches;
 * `me` is the e-mail of who is looking, shown as "Você". The indicators cover
 * everything received, whatever the tab and the search.
 */
export function ordersView(
  orders: OrderSummary[],
  { tab, search, me, month }: { tab: OrderTab; search: string; me: string; month: string },
): OrdersView {
  const rows = orders
    .filter((order) => inTab(order, tab) && matchesOrder(order, search))
    .map((order) => {
      const units = order.items.reduce((total, item) => total + item.quantity, 0);
      const place =
        order.deliveryUf === null
          ? null
          : `${order.deliveryUf}${order.deliveryUf !== ORIGIN_UF && !order.taxpayer ? " s/ IE" : ""}`;
      return {
        number: order.number,
        customer: order.customerName ?? "sem cliente",
        detail: [`#${order.number}`, place, `${units} un.`].filter(Boolean).join(" · "),
        document: order.customerDocument ? formatDocument(order.customerDocument) : null,
        seller: order.sellerEmail === me ? "Você" : order.sellerName,
        total: showMoney(invoiceTotal(order)),
        discount: showPercent(order.discount),
        status: order.status,
        statusLabel: STATUS_LABELS[order.status],
        updated: showDateTime(order.updatedAt),
      };
    });

  const counts = Object.fromEntries(
    ORDER_TABS.map((item) => [item.key, orders.filter((order) => inTab(order, item.key)).length]),
  ) as Record<OrderTab, number>;

  const indicators = orderIndicators(
    orders.map((order) => ({
      status: order.status,
      discount: order.discount,
      invoiceTotal: invoiceTotal(order),
      closedOn: order.closedAt ? isoDate(order.closedAt) : null,
    })),
    month,
  );
  return { rows, counts, indicators };
}

/** `2 pedidos`, `1 pedido`. */
export const ordersCount = (count: number, suffix = "") =>
  `${count} ${count === 1 ? "pedido" : "pedidos"}${suffix}`;

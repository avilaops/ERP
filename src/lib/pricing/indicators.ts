import { roundCents } from "@/lib/pricing/money";

/** What the indicators need from an order: its totals already come from the engine. */
export type IndicatorOrder = {
  status: string;
  discount: number;
  invoiceTotal: number;
  /** Day it was closed, `AAAA-MM-DD`, or `null`. */
  closedOn: string | null;
};

export type OrderIndicators = {
  /** Orders in negotiation: value with IPI and how many. */
  open: { total: number; count: number };
  /** Orders closed in the month asked for. */
  closedInMonth: { total: number; count: number };
  /** Closed ÷ (closed + lost), over everything received. `null` with neither. */
  closeRate: number | null;
  /** Simple average of the discount of the closed orders. `null` without any. */
  averageClosedDiscount: number | null;
};

/**
 * The four cards of the orders list. The sums live here, not on the screen nor
 * in SQL. `month` is `AAAA-MM`.
 */
export function orderIndicators(orders: IndicatorOrder[], month: string): OrderIndicators {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Mês inválido: "${month}". Use AAAA-MM.`);
  const sum = (list: IndicatorOrder[]) => roundCents(list.reduce((total, order) => total + order.invoiceTotal, 0));

  const open = orders.filter((order) => order.status === "em_negociacao");
  const closed = orders.filter((order) => order.status === "fechado");
  const lost = orders.filter((order) => order.status === "perdido");
  const inMonth = closed.filter((order) => order.closedOn?.startsWith(month));

  return {
    open: { total: sum(open), count: open.length },
    closedInMonth: { total: sum(inMonth), count: inMonth.length },
    closeRate: closed.length + lost.length === 0 ? null : closed.length / (closed.length + lost.length),
    averageClosedDiscount:
      closed.length === 0 ? null : closed.reduce((total, order) => total + order.discount, 0) / closed.length,
  };
}

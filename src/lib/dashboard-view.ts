import type { DashboardOrder } from "@/lib/db/dashboard";
import { roundCents } from "@/lib/pricing/money";
import { quoteSale } from "@/lib/pricing/order";

export const PERIODS = [
  { key: "mes", label: "Este mês", months: 1 },
  { key: "3m", label: "3 meses", months: 3 },
  { key: "ano", label: "Ano", months: 0 },
  { key: "12m", label: "12 meses", months: 12 },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

/** The period named in the address; anything unknown falls back to Este mês. */
export function parsePeriod(value: string | undefined): PeriodKey {
  return PERIODS.find((period) => period.key === value)?.key ?? "mes";
}

/** `AAAA-MM` moved by a number of months. */
export function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + (number - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The first month of a period that ends in the month of `today` (`AAAA-MM-DD`). "Ano" starts in January. */
export function periodStart(period: PeriodKey, today: string): string {
  const month = today.slice(0, 7);
  const months = PERIODS.find((item) => item.key === period)?.months ?? 1;
  return months === 0 ? `${month.slice(0, 4)}-01` : shiftMonth(month, 1 - months);
}

/** What an order is worth as the team sees it, from the engine: without and with IPI. */
function worth(order: DashboardOrder) {
  if (order.items.length === 0) return { netSale: 0, invoiceTotal: 0 };
  const quote = quoteSale({ items: order.items, discount: order.discount }, { ipi: order.ipi });
  return { netSale: quote.netSale, invoiceTotal: quote.invoiceTotal };
}

export type Bar = { label: string; value: number };

export type DashboardView = {
  /** Closed in the period, with IPI. */
  closed: { total: number; count: number };
  averageTicket: number | null;
  /** Closed over closed plus lost, among the orders created in the period. */
  conversion: number | null;
  /** Simple average of the discount of the orders closed in the period. */
  averageDiscount: number | null;
  /** The orders created in the period, by where they are now. */
  funnel: { created: number; negotiating: number; waiting: number; closed: number; lost: number };
  /** Closed by month, with IPI: the twelve months that end in the month of `today`, oldest first. */
  byMonth: Bar[];
  bySeller: Bar[];
  /** Top 8, value without IPI, after the discount of the order. */
  byProduct: Bar[];
  byState: Bar[];
  /** The numbers of the orders closed in the period, for the profit the directors see. */
  closedNumbers: string[];
};

const ranked = (totals: Map<string, number>, limit = Infinity): Bar[] =>
  [...totals.entries()]
    .map(([label, value]) => ({ label, value: roundCents(value) }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"))
    .slice(0, limit);

const add = (totals: Map<string, number>, key: string, value: number) => totals.set(key, (totals.get(key) ?? 0) + value);

const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** `2026-10` → `out/26`. */
export const shortMonth = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]}/${month.slice(2, 4)}`;

/**
 * Every figure of the dashboard, from the orders the session reaches. An order
 * counts as closed in the month it was closed, and in the funnel in the month it
 * was created. `today` is the day in São Paulo.
 */
export function dashboardView(orders: DashboardOrder[], period: PeriodKey, today: string): DashboardView {
  const month = today.slice(0, 7);
  const start = periodStart(period, today);
  const within = (date: string | null) => date !== null && date.slice(0, 7) >= start && date.slice(0, 7) <= month;

  const closed = orders.filter((order) => order.status === "fechado" && within(order.closedOn));
  const created = orders.filter((order) => within(order.createdOn));
  const count = (status: DashboardOrder["status"]) => created.filter((order) => order.status === status).length;
  const decided = count("fechado") + count("perdido");

  const bySeller = new Map<string, number>();
  const byProduct = new Map<string, number>();
  const byState = new Map<string, number>();
  let total = 0;
  for (const order of closed) {
    const { invoiceTotal } = worth(order);
    total += invoiceTotal;
    add(bySeller, order.sellerName, invoiceTotal);
    add(byState, order.deliveryUf ?? "sem UF", invoiceTotal);
    for (const item of order.items) add(byProduct, item.name, item.quantity * item.tableUnitPrice * (1 - order.discount));
  }

  const months = Array.from({ length: 12 }, (_, index) => shiftMonth(month, index - 11));
  const monthly = new Map(months.map((item) => [item, 0]));
  for (const order of orders) {
    const key = order.status === "fechado" && order.closedOn ? order.closedOn.slice(0, 7) : null;
    if (key !== null && monthly.has(key)) add(monthly, key, worth(order).invoiceTotal);
  }

  return {
    closed: { total: roundCents(total), count: closed.length },
    averageTicket: closed.length === 0 ? null : roundCents(total / closed.length),
    conversion: decided === 0 ? null : count("fechado") / decided,
    averageDiscount: closed.length === 0 ? null : closed.reduce((sum, order) => sum + order.discount, 0) / closed.length,
    funnel: { created: created.length, negotiating: count("em_negociacao"), waiting: count("aguardando_aprovacao"), closed: count("fechado"), lost: count("perdido") },
    byMonth: months.map((item) => ({ label: shortMonth(item), value: roundCents(monthly.get(item) ?? 0) })),
    bySeller: ranked(bySeller),
    byProduct: ranked(byProduct, 8),
    byState: ranked(byState),
    closedNumbers: closed.map((order) => order.number),
  };
}

/** One person of "Quem está vendendo": how many orders, open and closed, and how much was closed with IPI. */
export type SellerRow = { sellerEmail: string; sellerName: string; orders: number; open: number; closed: number; closedTotal: number };

export function sellersView(orders: DashboardOrder[]): SellerRow[] {
  const rows = new Map<string, SellerRow>();
  for (const order of orders) {
    const row = rows.get(order.sellerEmail) ?? { sellerEmail: order.sellerEmail, sellerName: order.sellerName, orders: 0, open: 0, closed: 0, closedTotal: 0 };
    row.orders += 1;
    if (order.status === "em_negociacao" || order.status === "aguardando_aprovacao") row.open += 1;
    if (order.status === "fechado") {
      row.closed += 1;
      row.closedTotal = roundCents(row.closedTotal + worth(order).invoiceTotal);
    }
    rows.set(order.sellerEmail, row);
  }
  return [...rows.values()].sort((a, b) => b.closedTotal - a.closedTotal || a.sellerName.localeCompare(b.sellerName, "pt-BR"));
}

/** A goal next to what was closed: how far it got. `null` rate when there is no goal. */
export type GoalProgress = { label: string; sellerEmail: string | null; goal: number; closed: number; rate: number | null };

/**
 * The goals of a month (`AAAA-MM`) against what each one closed in it, with IPI.
 * The team comes first; then every seller with a goal or with something closed.
 */
export function goalsView(
  orders: DashboardOrder[],
  goals: { sellerEmail: string | null; amount: number }[],
  sellers: { email: string; name: string }[],
  month: string,
): GoalProgress[] {
  const closed = new Map<string, number>();
  let team = 0;
  for (const order of orders) {
    if (order.status !== "fechado" || order.closedOn?.slice(0, 7) !== month) continue;
    const { invoiceTotal } = worth(order);
    team += invoiceTotal;
    add(closed, order.sellerEmail, invoiceTotal);
  }
  const goalOf = new Map(goals.map((goal) => [goal.sellerEmail, goal.amount]));
  const row = (label: string, sellerEmail: string | null, done: number): GoalProgress => {
    const goal = goalOf.get(sellerEmail) ?? 0;
    return { label, sellerEmail, goal, closed: roundCents(done), rate: goal > 0 ? done / goal : null };
  };
  const names = new Map(sellers.map((seller) => [seller.email, seller.name]));
  const emails = [...new Set([...sellers.map((seller) => seller.email), ...closed.keys(), ...goals.flatMap((goal) => (goal.sellerEmail ? [goal.sellerEmail] : []))])];
  return [
    row("Toda a equipe", null, team),
    ...emails
      .map((email) => row(names.get(email) ?? email, email, closed.get(email) ?? 0))
      .filter((item) => item.goal > 0 || item.closed > 0)
      .sort((a, b) => b.closed - a.closed || a.label.localeCompare(b.label, "pt-BR")),
  ];
}

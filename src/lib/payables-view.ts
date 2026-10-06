import type { CommissionDue, Payable } from "@/lib/db/payables";
import { roundCents } from "@/lib/pricing/money";

export const PAYABLE_TABS = [
  { key: "abertas", label: "A pagar" },
  { key: "pagas", label: "Pagas" },
  { key: "todas", label: "Todas" },
] as const;
export type PayableTab = (typeof PAYABLE_TABS)[number]["key"];

/** The tab named in the address; anything unknown falls back to A pagar. */
export function parsePayableTab(value: string | undefined): PayableTab {
  return PAYABLE_TABS.find((tab) => tab.key === value)?.key ?? "abertas";
}

export const inPayableTab = (payable: Pick<Payable, "status">, tab: PayableTab) =>
  tab === "todas" || (tab === "abertas") === (payable.status === "aberta");

type Total = { total: number; count: number };
export type PayablesSummary = { open: Total; overdue: Total; nextDays: Total; paidInMonth: Total };

const total = (amounts: number[]): Total => ({ total: roundCents(amounts.reduce((sum, amount) => sum + amount, 0)), count: amounts.length });

/**
 * The cards of Contas a pagar. The commissions the company owes count as bills
 * to pay (only the positive balances: a negative one is a discount on the next
 * payment, not a bill). Dates are days in São Paulo, `AAAA-MM-DD`; `month` is `AAAA-MM`.
 */
export function payablesSummary(
  payables: Payable[],
  commissions: CommissionDue[],
  { today, inSevenDays, month }: { today: string; inSevenDays: string; month: string },
): PayablesSummary {
  const due = [
    ...payables.filter((item) => item.status === "aberta").map((item) => ({ dueDate: item.dueDate, amount: item.amount })),
    ...commissions.filter((item) => item.amount > 0).map((item) => ({ dueDate: item.dueDate, amount: item.amount })),
  ];
  const paid = payables.filter((item) => item.status === "paga" && item.paidOn !== null && item.paidOn.startsWith(month));
  return {
    open: total(due.map((item) => item.amount)),
    overdue: total(due.filter((item) => item.dueDate < today).map((item) => item.amount)),
    nextDays: total(due.filter((item) => item.dueDate >= today && item.dueDate <= inSevenDays).map((item) => item.amount)),
    paidInMonth: total(paid.map((item) => item.paidAmount ?? 0)),
  };
}

const cell = (value: string | number | null) => {
  const text = value === null ? "" : typeof value === "number" ? value.toFixed(2).replace(".", ",") : value;
  // A cell that starts like a formula is neutralised: the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value !== "number" ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const brDate = (date: string | null) => (date === null ? "" : date.split("-").reverse().join("/"));

/** The bills as a spreadsheet file: `;` between cells and decimal comma, as Excel in pt-BR opens it. */
export function payablesCsv(payables: Payable[]): string {
  const header = ["Descrição", "Fornecedor", "Categoria", "Valor", "Vencimento", "Forma", "Situação", "Pago em", "Valor pago"];
  const rows = payables.map((item) => [
    item.description, item.supplierName, item.category, item.amount, brDate(item.dueDate), item.method,
    item.status === "paga" ? "Paga" : "A pagar", brDate(item.paidOn), item.paidAmount,
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

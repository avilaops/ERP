import { managesCommissions, seesAllOrders } from "@/lib/auth/permissions";
import type { Powered } from "@/lib/auth/permissions";
import type { Cell, Column, ReportData, ReportInfo } from "@/lib/db/reports";
import { showMoney } from "@/lib/format";

/** The ready-made periods of a report. Dates are days in São Paulo, `AAAA-MM-DD`. */
export const PERIODS = [
  { key: "mes", label: "Este mês" },
  { key: "mes-passado", label: "Mês passado" },
  { key: "ano", label: "Este ano" },
  { key: "tudo", label: "Tudo" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];
export type Period = { key: PeriodKey | "datas"; from: string | null; to: string | null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (value: string | undefined): value is string => value !== undefined && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The period the address asks for. Two valid dates win over the ready-made
 * ones; anything unknown falls back to the year so far, which is never empty
 * for a company that sold something.
 */
export function parsePeriod(query: { periodo?: string; de?: string; ate?: string }, today: string): Period {
  if (isDay(query.de) && isDay(query.ate) && query.de <= query.ate) return { key: "datas", from: query.de, to: query.ate };
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  switch (PERIODS.find((period) => period.key === query.periodo)?.key ?? "ano") {
    case "mes":
      return { key: "mes", from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay(year, month))}` };
    case "mes-passado": {
      const [y, m] = month === 1 ? [year - 1, 12] : [year, month - 1];
      return { key: "mes-passado", from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
    }
    case "tudo":
      return { key: "tudo", from: null, to: null };
    default:
      return { key: "ano", from: `${year}-01-01`, to: `${year}-12-31` };
  }
}

/** Whose records the person reads in this report: `null` is everyone's, an e-mail is only their own. */
export function personOf(report: Pick<ReportInfo, "scope">, session: Powered & { email: string }): string | null {
  if (report.scope === "team") return seesAllOrders(session) ? null : session.email;
  if (report.scope === "commissions") return managesCommissions(session) ? null : session.email;
  return null;
}

export const brDate = (date: string) => date.split("-").reverse().join("/");

/** One cell as the screen shows it. An empty one is a dash, so a hole is seen as a hole. */
export function showCell(value: Cell, kind: Column["kind"]): string {
  if (value === null || value === "") return "—";
  if (kind === "money") return showMoney(Number(value));
  if (kind === "date") return brDate(String(value));
  return String(value);
}

export const showFigure = (figure: { value: number; kind: "money" | "count" }) => (figure.kind === "money" ? showMoney(figure.value) : String(figure.value));

const csvCell = (value: Cell, kind: Column["kind"]) => {
  const text = value === null ? "" : kind === "money" ? Number(value).toFixed(2).replace(".", ",") : kind === "date" ? brDate(String(value)) : String(value);
  // A cell that starts like a formula is neutralised: the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) && kind !== "money" && kind !== "count" ? `'${text}` : text;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The report as a spreadsheet file: `;` between cells and decimal comma, as Excel in pt-BR opens it. */
export function reportCsv(data: Pick<ReportData, "columns" | "rows">): string {
  const header = data.columns.map((column) => csvCell(column.label, "text")).join(";");
  const rows = data.rows.map((row) => row.map((value, index) => csvCell(value, data.columns[index].kind)).join(";"));
  return [header, ...rows].join("\r\n") + "\r\n";
}

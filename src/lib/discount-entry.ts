import { formatMoney, formatPercent, parseMoney, parsePercent } from "@/lib/format";
import { roundCents } from "@/lib/pricing/money";

/** The largest discount the field in reais turns into a percentage. */
const LARGEST = 0.95;

/**
 * The discount typed in reais, as the percentage the order keeps (eight
 * decimals of the rate, as the column). `null` while the text is not an amount
 * or there is no table total to divide by.
 */
export function percentFromValue(text: string, tableTotal: number): string | null {
  if (text.trim() === "") return "0";
  const value = parseMoney(text);
  if (value === null || tableTotal <= 0) return null;
  const rate = Math.min(LARGEST, value / tableTotal);
  return formatPercent(Math.round(rate * 1e8) / 1e8);
}

/** The discount typed in %, in reais over the table total. Blank at zero or while the text is not a percentage. */
export function valueFromPercent(text: string, tableTotal: number): string {
  const rate = text.trim() === "" ? 0 : parsePercent(text.trim().replace(/\s*%$/, ""));
  if (rate === null || rate === 0 || tableTotal <= 0) return "";
  return formatMoney(roundCents(tableTotal * rate));
}

/**
 * "Cliente quer pagar": the total the customer accepts, as the percentage of
 * discount that gives it. `invoiceFactor` is what the total has over the sale
 * (1 + IPI). A total above the table is no discount.
 */
export function percentFromTotal(text: string, tableTotal: number, invoiceFactor: number): string | null {
  const total = parseMoney(text);
  if (total === null || total === 0 || tableTotal <= 0 || invoiceFactor <= 0) return null;
  const rate = Math.max(0, Math.min(LARGEST, 1 - total / (tableTotal * invoiceFactor)));
  return formatPercent(Math.round(rate * 1e8) / 1e8);
}

/** The down payment typed in reais, as the percentage of the total of the order it is (one decimal: `44,9`). `null` while the text is not an amount. */
export function sharePercentFromValue(text: string, total: number): string | null {
  const value = parseMoney(text);
  if (value === null || total <= 0) return null;
  return (Math.round((value / total) * 1000) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** The down payment typed in %, in reais over the total of the order. Blank while the text is not a percentage from 0 to 100. */
export function valueFromSharePercent(text: string, total: number): string {
  const typed = text.trim().replace(/\s*%$/, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(typed) || total <= 0) return "";
  const percent = Number(typed);
  return percent > 100 ? "" : formatMoney(roundCents((total * percent) / 100));
}

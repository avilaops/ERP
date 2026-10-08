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

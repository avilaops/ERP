/**
 * Brazilian number formats for forms and screens: comma for decimals, dot for
 * thousands. Reading shifts the decimal point in the text instead of dividing,
 * so "9,25" becomes exactly 0.0925.
 */

const PERCENT_TEXT = /^\d+([.,]\d+)?$/;
const MONEY_TEXT = /^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/;
const DAYS_TEXT = /^\d+$/;

/** `"9,25"` → `0.0925`. `null` when the text is not a percentage from 0 to less than 100. */
export function parsePercent(text: string): number | null {
  const clean = text.trim();
  if (!PERCENT_TEXT.test(clean)) return null;
  const [whole, decimals = ""] = clean.replace(",", ".").split(".");
  // Two places to the left: "9" + "25" → "0.0925".
  const rate = Number(`0.${whole.padStart(2, "0").slice(-2)}${decimals}`) + Number(whole.slice(0, -2) || "0");
  return Number.isFinite(rate) && rate >= 0 && rate < 1 ? rate : null;
}

/** `0.0925` → `"9,25"`, without trailing zeros. */
export function formatPercent(rate: number): string {
  return String(Number((rate * 100).toPrecision(12))).replace(".", ",");
}

/** A percentage for reading, with a fixed number of decimals: `0.373` → `"37,3%"`. */
export function showPercent(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits).replace(".", ",")}%`;
}

/** `"1.234,56"` → `1234.56`. `null` when the text is not an amount in reais, zero or more. */
export function parseMoney(text: string): number | null {
  const clean = text.trim().replace(/^R\$\s*/, "");
  if (!MONEY_TEXT.test(clean)) return null;
  const value = Number(clean.replaceAll(".", "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** `1234.5` → `"1.234,50"`. */
export function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Whole reais when there are no cents, as the prototype shows: `"R$ 0"`, `"R$ 1.234,50"`. */
export function showMoney(value: number): string {
  const digits = Number.isInteger(value) ? 0 : 2;
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`;
}

/** A multiplier with three decimals: `3.1227…` → `"3,123"`. */
export function showMultiplier(value: number): string {
  return value.toFixed(3).replace(".", ",");
}

/** `"7"` → `7`. `null` unless it is a whole number greater than zero. */
export function parseDays(text: string): number | null {
  const clean = text.trim();
  if (!DAYS_TEXT.test(clean)) return null;
  const days = Number(clean);
  return Number.isSafeInteger(days) && days > 0 ? days : null;
}

/** A date for reading, as it is in São Paulo whatever the server's clock zone: `05/10/2026`. */
export function showDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}

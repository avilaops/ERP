const STOCK_COUNT = /^\d{1,8}(?:[,.]\d{1,4})?$/;

export function parseStockCount(value: string): number | null {
  const typed = value.trim();
  if (!STOCK_COUNT.test(typed)) return null;
  const parsed = Number(typed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

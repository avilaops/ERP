/**
 * How many rows of a list fit the screen of who is looking. The browser
 * measures it once (`FitRows`) and leaves the number in a cookie; the server
 * cuts every paged list by it, so a list fills the screen without passing it.
 */
export const ROWS_COOKIE = "erp_linhas";
/** Before the browser measured: few enough for the smallest phone. */
export const DEFAULT_ROWS = 4;
export const MIN_ROWS = 3;
export const MAX_ROWS = 30;

export function rowsPerPage(cookie: string | undefined): number {
  if (!cookie || !/^\d{1,2}$/.test(cookie)) return DEFAULT_ROWS;
  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, Number(cookie)));
}

/** Which slice of a list a page shows. `page` asked beyond the end falls on the last one. */
export function pageOf<Row>(rows: Row[], asked: string | undefined, size: number): { rows: Row[]; page: number; pages: number; from: number; to: number; total: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, /^\d{1,6}$/.test(asked ?? "") ? Number(asked) : 1));
  const from = (page - 1) * size;
  return { rows: rows.slice(from, from + size), page, pages, from: rows.length === 0 ? 0 : from + 1, to: Math.min(rows.length, from + size), total: rows.length };
}

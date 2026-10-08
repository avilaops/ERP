import type { ProductLine } from "@/lib/db/product-lines";

/** The name of the address parameter that says which product line a screen shows. */
export const LINE_PARAM = "linha";

/** The line asked for in the address, or the first one. `lines` is never empty: every company has at least one. */
export function pickLine(lines: ProductLine[], asked: string | string[] | undefined): ProductLine {
  const text = Array.isArray(asked) ? asked[0] : asked;
  const id = text && /^[1-9]\d{0,8}$/.test(text) ? Number(text) : null;
  const line = lines.find((item) => item.id === id) ?? lines[0];
  if (!line) throw new Error("Nenhuma linha de produto cadastrada. Rode `npm run db:migrate`.");
  return line;
}

/**
 * The line a form says it is writing to, or `null`. A write never falls back to
 * another line: saving the parameters of one line over another would be silent.
 */
export function exactLine(lines: ProductLine[], sent: FormDataEntryValue | null): ProductLine | null {
  if (typeof sent !== "string" || !/^[1-9]\d{0,8}$/.test(sent)) return null;
  return lines.find((item) => item.id === Number(sent)) ?? null;
}

/** The address of a screen in one line, keeping the other parameters given. */
export function lineHref(path: string, lineId: number, others: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  query.set(LINE_PARAM, String(lineId));
  for (const [key, value] of Object.entries(others)) if (value) query.set(key, value);
  return `${path}?${query}`;
}

import type { Product } from "@/lib/db/products";
import { formatMoney, formatPercent, parseMoney, parsePercent } from "@/lib/format";

/** One line read from the advisory's sheet. Credit and packaging left out keep what the product has. */
export type AdvisoryCostRow = { code: string; advisoryCost: number; taxCredit?: number; packaging?: number };

/** A row that can be applied, with where it came from in the pasted text. */
export type PastedRow = AdvisoryCostRow & { line: number; text: string };

export type InvalidLine = { line: number; text: string; reason: string };

export type ParsedPaste = { rows: PastedRow[]; invalid: InvalidLine[]; headerSkipped: boolean };

export const PASTE_MAX_LINES = 1000;
export const PASTE_MAX_CHARS = 100_000;

/** Why the whole paste is refused, or `null` when its size is fine. */
export function pasteSizeProblem(text: string): string | null {
  if (text.length > PASTE_MAX_CHARS) {
    return "A colagem passa de 100.000 caracteres. Cole em partes menores.";
  }
  if (text.split("\n").filter((line) => line.trim() !== "").length > PASTE_MAX_LINES) {
    return "A colagem passa de 1.000 linhas. Cole em partes menores.";
  }
  return null;
}

/** Columns come separated by TAB (copied from a sheet) or, when the line has no TAB, by semicolon. */
function cells(line: string): string[] {
  const parts = line.split(line.includes("\t") ? "\t" : ";").map((cell) => cell.trim());
  // A sheet often copies empty columns at the end of the row.
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** A heading such as "Código · Custo": the second column has letters and is not an amount. */
const isHeader = (columns: string[]) =>
  columns.length >= 2 && parseMoney(columns[1]) === null && /\p{L}/u.test(columns[1]);

/** The row of a line, or the reason it cannot be applied. */
function readLine(columns: string[], knownCodes: ReadonlySet<string>): AdvisoryCostRow | string {
  if (columns.length < 2) return "menos de duas colunas";
  if (columns.length > 4) return "mais de quatro colunas";

  const [code, costText, creditText = "", packagingText = ""] = columns;
  if (code === "") return "código vazio";
  if (!knownCodes.has(code)) return "código não cadastrado";

  const advisoryCost = parseMoney(costText);
  if (advisoryCost === null || advisoryCost === 0) return "custo inválido";
  const row: AdvisoryCostRow = { code, advisoryCost };

  if (creditText !== "") {
    const taxCredit = parsePercent(creditText.replace(/\s*%$/, ""));
    if (taxCredit === null) return "crédito inválido";
    row.taxCredit = taxCredit;
  }
  if (packagingText !== "") {
    const packaging = parseMoney(packagingText);
    if (packaging === null) return "embalagem inválida";
    row.packaging = packaging;
  }
  return row;
}

/**
 * Reads the pasted sheet: code · cost · credit % (optional) · packaging (optional),
 * numbers in the Brazilian format. Never creates a product: the code must be one
 * of `knownCodes`. An invalid line does not stop the others; a code that appears
 * twice makes every line with it invalid. Throws when the paste is too large.
 */
export function parseAdvisoryPaste(text: string, knownCodes: ReadonlySet<string>): ParsedPaste {
  const problem = pasteSizeProblem(text);
  if (problem) throw new Error(problem);

  const lines = text
    .split("\n")
    // The columns are read from the line as it came: a TAB at the start is an empty code.
    .map((raw, index) => ({ line: index + 1, text: raw.trim(), columns: cells(raw) }))
    .filter(({ text: content }) => content !== "");

  const headerSkipped = lines.length > 0 && isHeader(lines[0].columns);
  const data = headerSkipped ? lines.slice(1) : lines;

  const seen = new Map<string, number>();
  for (const { columns } of data) {
    const code = columns[0] ?? "";
    if (columns.length >= 2 && code !== "") seen.set(code, (seen.get(code) ?? 0) + 1);
  }

  const rows: PastedRow[] = [];
  const invalid: InvalidLine[] = [];
  for (const { line, text: content, columns } of data) {
    const read = readLine(columns, knownCodes);
    if (typeof read === "string") {
      invalid.push({ line, text: content, reason: read });
    } else if ((seen.get(read.code) ?? 0) > 1) {
      invalid.push({ line, text: content, reason: "código repetido na colagem" });
    } else {
      rows.push({ ...read, line, text: content });
    }
  }
  return { rows, invalid, headerSkipped };
}

/** One value of the check before applying, already as text. */
export type Change = { from: string; to: string; changed: boolean };

export type PreviewRow = {
  code: string;
  name: string;
  inactive: boolean;
  cost: Change;
  credit: Change;
  packaging: Change;
};

const change = (from: string, to: string): Change => ({ from, to, changed: from !== to });

/**
 * What "Conferir" shows for the valid rows: current → new for cost, credit and
 * packaging. A credit pasted as a fraction ("0,28") would be read as 0,28%: here
 * it shows before anything is saved.
 */
export function previewRows(rows: AdvisoryCostRow[], products: Product[]): PreviewRow[] {
  const byCode = new Map(products.flatMap((product) => (product.code === null ? [] : [[product.code, product] as const])));
  return rows.flatMap((row) => {
    const product = byCode.get(row.code);
    if (!product) return [];
    const cost = product.advisoryCost;
    return [
      {
        code: row.code,
        name: product.name,
        inactive: !product.active,
        cost: change(cost === null || cost === 0 ? "sem custo" : formatMoney(cost), formatMoney(row.advisoryCost)),
        credit: change(`${formatPercent(product.taxCredit)}%`, `${formatPercent(row.taxCredit ?? product.taxCredit)}%`),
        packaging: change(formatMoney(product.packaging), formatMoney(row.packaging ?? product.packaging)),
      },
    ];
  });
}

/** What the paste action answers to its form. */
export type PasteState = {
  status: "idle" | "preview" | "applied" | "error";
  /** The text to show in the box again. Empty after applying. */
  text: string;
  /** The result in one sentence, or why nothing was done. */
  message: string | null;
  rows: PreviewRow[];
  invalid: InvalidLine[];
  headerSkipped: boolean;
};

export const IDLE_PASTE: PasteState = { status: "idle", text: "", message: null, rows: [], invalid: [], headerSkipped: false };

/** `3 custos atualizados.` */
export const appliedText = (count: number) => (count === 1 ? "1 custo atualizado." : `${count} custos atualizados.`);

/** `2 linhas ignoradas` */
export const ignoredText = (count: number) => (count === 1 ? "1 linha ignorada" : `${count} linhas ignoradas`);

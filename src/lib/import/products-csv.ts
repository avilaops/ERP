/**
 * The spreadsheet of the batch load (`equipamentos.csv`) and the names of the
 * photo files, read without database and without disk.
 */

export type ProductCsvRow = {
  /** Line of the file where the record starts (the header is line 1). */
  line: number;
  /** Already trimmed and in capitals. */
  code: string;
  name: string;
  description: string | null;
  supplierName: string | null;
  supplierModel: string | null;
  supplierPriceUsd: number | null;
};

const REQUIRED = ["codigo", "nome", "descricao"] as const;
const OPTIONAL = ["fornecedor", "modelo", "preco_usd"] as const;
type Column = (typeof REQUIRED)[number] | (typeof OPTIONAL)[number];
const isColumn = (name: string): name is Column => [...REQUIRED, ...OPTIONAL].includes(name as Column);

/** Letters, digits, `-`, `_` and `.`: the code is also the name of the photo file. */
const CODE = /^[A-Z0-9._-]+$/;
/** What fits in `supplier_price_usd numeric(12,2)`. */
const MAX_PRICE = 9_999_999_999.99;

export const normalizeImportCode = (raw: string) => raw.trim().toUpperCase();
export const isImportCode = (code: string) => CODE.test(code);

type CsvRecord = { line: number; fields: string[] };

/** Separator `;`, fields optionally in double quotes (`""` is a quote, line breaks allowed inside), `\n` or `\r\n`. */
function splitRecords(text: string): { records: CsvRecord[]; errors: string[] } {
  const records: CsvRecord[] = [];
  const errors: string[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  let line = 1;
  let startLine = 1;

  const endField = () => {
    fields.push(wasQuoted ? field : field.trim());
    field = "";
    wasQuoted = false;
  };
  const endRecord = () => {
    endField();
    // A line with nothing at all is not a record.
    if (fields.length > 1 || fields[0] !== "") records.push({ line: startLine, fields });
    fields = [];
    startLine = line + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else if (char !== "\r" || text[index + 1] !== "\n") {
        // Inside the quotes a line break is text; `\r\n` is kept as `\n`.
        if (char === "\n") line += 1;
        field += char;
      }
    } else if (char === '"' && field.trim() === "" && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
      field = "";
    } else if (char === ";") {
      endField();
    } else if (char === "\n") {
      endRecord();
      line += 1;
    } else if (char === "\r" && text[index + 1] === "\n") {
      // The `\n` that follows ends the record.
    } else if (!wasQuoted || char.trim() !== "") {
      if (wasQuoted) errors.push(`Linha ${line}: texto depois de fechar as aspas.`);
      field += char;
    }
  }
  if (quoted) errors.push(`Linha ${startLine}: aspas abertas e não fechadas.`);
  else if (field !== "" || wasQuoted || fields.length > 0) endRecord();

  return { records, errors };
}

/** `1234.56` or `1.234,56`. `null` when it is not a number, zero or more, that fits the column. */
export function parseUsdPrice(raw: string): number | null {
  const text = raw.trim();
  let plain: string;
  if (text.includes(",")) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d+$/.test(text)) return null;
    plain = text.replaceAll(".", "").replace(",", ".");
  } else {
    // `1.234` could be one thousand or one and a fraction: refused instead of guessed.
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    plain = text;
  }
  const value = Number(plain);
  return Number.isFinite(value) && value >= 0 && value <= MAX_PRICE ? value : null;
}

/**
 * Reads `equipamentos.csv`. Every problem found is listed, with its line; when
 * `errors` is not empty the rows must not be used.
 */
export function parseProductsCsv(text: string): { rows: ProductCsvRow[]; errors: string[] } {
  const { records, errors } = splitRecords(text.replace(/^﻿/, ""));
  if (records.length === 0) return { rows: [], errors: [...errors, "Planilha vazia: falta a linha de cabeçalho."] };

  const [header, ...lines] = records;
  const columns = header.fields.map((name) => name.trim().toLowerCase());
  for (const name of REQUIRED) {
    if (!columns.includes(name)) errors.push(`Linha ${header.line}: falta a coluna obrigatória "${name}".`);
  }
  columns.forEach((name, index) => {
    if (!isColumn(name)) errors.push(`Linha ${header.line}: coluna desconhecida "${name}".`);
    else if (columns.indexOf(name) !== index) errors.push(`Linha ${header.line}: coluna "${name}" repetida.`);
  });
  if (errors.length > 0) return { rows: [], errors };

  const rows: ProductCsvRow[] = [];
  const seen = new Map<string, number>();
  for (const { line, fields } of lines) {
    if (fields.length !== columns.length) {
      errors.push(`Linha ${line}: ${fields.length} campos, e o cabeçalho tem ${columns.length}.`);
      continue;
    }
    const value = (column: Column) => (columns.includes(column) ? fields[columns.indexOf(column)].trim() : "");
    const orNull = (column: Column) => (value(column) === "" ? null : value(column));
    const before = errors.length;

    const code = normalizeImportCode(value("codigo"));
    if (code === "") errors.push(`Linha ${line}: código vazio.`);
    else if (!isImportCode(code)) {
      errors.push(`Linha ${line}: código "${code}" inválido (use só letras, números, "-", "_" e ".").`);
    } else if (seen.has(code)) {
      errors.push(`Linha ${line}: código "${code}" repetido (já está na linha ${seen.get(code)}).`);
    } else seen.set(code, line);

    if (value("nome") === "") errors.push(`Linha ${line}: nome vazio.`);

    const rawPrice = value("preco_usd");
    const supplierPriceUsd = rawPrice === "" ? null : parseUsdPrice(rawPrice);
    if (rawPrice !== "" && supplierPriceUsd === null) {
      errors.push(`Linha ${line}: preco_usd "${rawPrice}" não é um número, zero ou mais (ex.: 1234.56 ou 1.234,56).`);
    }

    if (errors.length > before) continue;
    rows.push({
      line,
      code,
      name: value("nome"),
      description: orNull("descricao"),
      supplierName: orNull("fornecedor"),
      supplierModel: orNull("modelo"),
      supplierPriceUsd,
    });
  }
  return { rows: errors.length > 0 ? [] : rows, errors };
}

const PHOTO_FILE = /^(.+)\.(jpe?g|png|webp)$/i;

export type PhotoMatch = {
  /** One file per code, for every file whose name can be a code (in the spreadsheet or not). */
  photos: { code: string; fileName: string }[];
  /** Codes of the spreadsheet with no file. */
  missing: string[];
  /** Image files whose name cannot be a code: they belong to no product. */
  orphans: string[];
  /** Files that are not photos (other extension): left alone. */
  ignored: string[];
  /** Two files for the same code. */
  errors: string[];
};

/**
 * Pairs the files of `fotos/` with the codes, ignoring case: `ld-b001.JPG` is
 * the photo of `LD-B001`. A file whose code is not in `codes` still comes in
 * `photos`: the product may already be in the database.
 */
export function matchPhotos(codes: string[], fileNames: string[]): PhotoMatch {
  const byCode = new Map<string, string[]>();
  const orphans: string[] = [];
  const ignored: string[] = [];
  for (const fileName of [...fileNames].sort()) {
    const stem = PHOTO_FILE.exec(fileName)?.[1];
    if (stem === undefined) ignored.push(fileName);
    else if (!isImportCode(normalizeImportCode(stem))) orphans.push(fileName);
    else byCode.set(normalizeImportCode(stem), [...(byCode.get(normalizeImportCode(stem)) ?? []), fileName]);
  }

  const photos: PhotoMatch["photos"] = [];
  const errors: string[] = [];
  for (const [code, files] of byCode) {
    if (files.length > 1) errors.push(`Código ${code}: mais de uma foto (${files.join(", ")}).`);
    else photos.push({ code, fileName: files[0] });
  }
  const wanted = new Set(codes.map(normalizeImportCode));
  return { photos, missing: [...wanted].filter((code) => !byCode.has(code)), orphans, ignored, errors };
}

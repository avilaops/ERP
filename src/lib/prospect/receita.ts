import { createInflateRaw } from "node:zlib";

/**
 * The open data of the Receita Federal about companies (CNPJ), read as it is
 * published: a folder a month, zip files of one CSV each, in Latin-1, fields
 * in quotes separated by semicolons. Everything here reads a stream and keeps
 * nothing on disk: the files are several gigabytes, and only the companies of
 * the chosen activities and states are of interest.
 */
export const RECEITA_SHARE = "https://arquivos.receitafederal.gov.br/public.php/dav/files/YggdBLfdninEJX9";

export class ReceitaError extends Error {}

/** The months published, the newest last (`2026-09`). */
export async function listMonths(fetcher: typeof fetch = fetch): Promise<string[]> {
  const response = await fetcher(`${RECEITA_SHARE}/`, { method: "PROPFIND", headers: { Depth: "1" }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!response || (response.status !== 207 && response.status !== 200)) throw new ReceitaError("A Receita não respondeu a lista de meses. Tente de novo mais tarde.");
  const months = [...new Set([...(await response.text()).matchAll(/\/(20\d{2}-\d{2})\//g)].map((match) => match[1]))].sort();
  if (months.length === 0) throw new ReceitaError("A lista de meses da Receita veio vazia.");
  return months;
}

/**
 * The lines of the one file inside a zip, as it arrives. The local header is
 * skipped by its own lengths and the rest is inflated on the way; whatever
 * comes after the compressed data (the directory of the zip) is not read.
 */
export async function* zipLines(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const inflate = createInflateRaw();
  let failure: Error | null = null;
  // Set when who reads the lines stops before the end: the download stops with it.
  let stopped = false;
  // The first thing that went wrong is the one that is told: a broken header also leaves the inflater with nothing to read.
  inflate.on("error", () => {
    failure ??= new ReceitaError("O arquivo da Receita veio incompleto ou corrompido.");
  });
  const feed = (async () => {
    let head = Buffer.alloc(0);
    let started = false;
    try {
      for await (const chunk of chunks) {
        if (stopped) break;
        let data = Buffer.from(chunk);
        if (!started) {
          head = Buffer.concat([head, data]);
          if (head.length < 30) continue;
          if (head.readUInt32LE(0) !== 0x04034b50) throw new ReceitaError("O arquivo da Receita não é um zip.");
          if (head.readUInt16LE(8) !== 8) throw new ReceitaError("O arquivo da Receita usa uma compactação que o ERP não lê.");
          const skip = 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
          if (head.length < skip) continue;
          data = head.subarray(skip);
          started = true;
        }
        // The inflater stops by itself at the end of the compressed data; what follows is not for it.
        if (inflate.writableEnded || inflate.destroyed) break;
        if (!inflate.write(data)) await new Promise<void>((resolve) => inflate.once("drain", () => resolve()));
      }
    } catch (error) {
      failure ??= error instanceof Error ? error : new Error(String(error));
    } finally {
      if (!inflate.writableEnded && !inflate.destroyed) inflate.end();
    }
  })();
  let rest = "";
  const decoder = new TextDecoder("latin1");
  try {
    try {
      for await (const piece of inflate as AsyncIterable<Buffer>) {
        const text = rest + decoder.decode(piece, { stream: true });
        const lines = text.split("\n");
        rest = lines.pop() ?? "";
        for (const line of lines) yield line.endsWith("\r") ? line.slice(0, -1) : line;
      }
    } catch {
      // The stream itself broke: what is told is the reason noted above.
      failure ??= new ReceitaError("O arquivo da Receita veio incompleto ou corrompido.");
    }
    await feed;
    if (failure) throw failure;
    if (rest !== "") yield rest;
  } finally {
    stopped = true;
    if (!inflate.destroyed) inflate.destroy();
  }
}

/** The fields of one line: `"a";"b";""` as `["a", "b", ""]`. A quote inside a field comes doubled. */
export function fieldsOf(line: string): string[] {
  if (!line.startsWith('"')) return line.split(";");
  return line.slice(1, line.endsWith('"') ? -1 : undefined).split('";"').map((field) => (field.includes('""') ? field.replace(/""/g, '"') : field));
}

export type Establishment = {
  cnpj: string;
  base: string;
  tradeName: string | null;
  cnae: string;
  openedOn: string | null;
  street: string | null;
  number: string | null;
  district: string | null;
  cep: string | null;
  uf: string;
  cityCode: string;
  phone: string | null;
  email: string | null;
};

const clean = (value: string | undefined, max: number) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text === "" ? null : text.slice(0, max);
};

/**
 * One line of the establishments file, when it is an active establishment of
 * one of the wanted activities and states; `null` for everything else. Only
 * the company's own data is taken: no partner, no person.
 */
export function establishmentOf(line: string, cnaes: ReadonlySet<string>, ufs: ReadonlySet<string>): Establishment | null {
  const field = fieldsOf(line);
  // 5: registration status ("02" is active); 11: main activity; 19: state.
  if (field.length < 28 || field[5] !== "02" || !cnaes.has(field[11]) || (ufs.size > 0 && !ufs.has(field[19]))) return null;
  const cnpj = `${field[0]}${field[1]}${field[2]}`;
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return null;
  const opened = /^(\d{4})(\d{2})(\d{2})$/.exec(field[10]);
  const phone = `${field[21]}${field[22]}`.replace(/\D/g, "");
  const email = (field[27] ?? "").trim().toLowerCase();
  const cep = field[18].replace(/\D/g, "");
  return {
    cnpj, base: field[0], tradeName: clean(field[4], 150), cnae: field[11], openedOn: opened && opened[1] > "1800" ? `${opened[1]}-${opened[2]}-${opened[3]}` : null,
    street: clean([field[13], field[14]].filter(Boolean).join(" "), 120), number: clean(field[15], 20), district: clean(field[17], 80), cep: /^\d{8}$/.test(cep) ? cep : null,
    uf: field[19], cityCode: field[20], phone: /^\d{10,11}$/.test(phone) ? phone : null, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null,
  };
}

const SIZES: Record<string, string> = { "01": "MICRO EMPRESA", "03": "EMPRESA DE PEQUENO PORTE", "05": "DEMAIS" };

/** The legal name and the size of a company, from one line of the companies file. The name of an individual firm comes with the owner's CPF at the end: it is taken off. */
export function companyOf(line: string): { base: string; legalName: string; size: string | null } | null {
  const field = fieldsOf(line);
  if (field.length < 6) return null;
  const legalName = clean(field[1].replace(/\s+\d{11}$/, ""), 150);
  return legalName ? { base: field[0], legalName, size: SIZES[field[5]] ?? null } : null;
}

/** A small table of the Receita (cities, activities): code to name. */
export async function codeTable(chunks: AsyncIterable<Uint8Array>): Promise<Map<string, string>> {
  const table = new Map<string, string>();
  for await (const line of zipLines(chunks)) {
    const [code, name] = fieldsOf(line);
    if (code && name) table.set(code, name.replace(/\s+/g, " ").trim());
  }
  return table;
}

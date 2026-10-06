import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { importProducts, reportLine } from "@/lib/db/import-products";
import type { ImportPlan } from "@/lib/db/import-products";
import type { Queryable } from "@/lib/db/pool";
import { matchPhotos, parseProductsCsv } from "@/lib/import/products-csv";
import { MAX_UPLOAD_BYTES, normalizePhoto, PhotoError, TOO_LARGE_MESSAGE } from "@/lib/photos/normalize";

export const CSV_NAME = "equipamentos.csv";
export const PHOTOS_DIR = "fotos";

const isMissing = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");

/** Regular files directly inside `dir`: no sub-folder, and a symbolic link is not followed. */
async function plainFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/**
 * Reads the folder of a batch load and checks everything that can be checked
 * without the database: the spreadsheet, the names of the photos and each photo
 * itself. With any error the plan must not be used.
 */
export async function readProductsFolder(dir: string): Promise<{ plan: ImportPlan; errors: string[]; notes: string[] }> {
  const empty: ImportPlan = { rows: [], photos: [], orphanFiles: [] };
  let text: string;
  try {
    if (!(await lstat(dir)).isDirectory()) return { plan: empty, errors: [`Pasta não encontrada: ${dir}`], notes: [] };
    text = await readFile(join(dir, CSV_NAME), "utf8");
  } catch (error) {
    if (!isMissing(error)) throw error;
    const missingDir = !(await lstat(dir).then((stat) => stat.isDirectory(), () => false));
    return {
      plan: empty,
      errors: [missingDir ? `Pasta não encontrada: ${dir}` : `Arquivo ${CSV_NAME} não encontrado em ${dir}`],
      notes: [],
    };
  }

  const { rows, errors } = parseProductsCsv(text);
  const photosDir = join(dir, PHOTOS_DIR);
  const match = matchPhotos(rows.map((row) => row.code), await plainFiles(photosDir));
  errors.push(...match.errors);

  // Each photo is opened once here, one at a time, only to be refused early; the bytes are not kept.
  for (const { fileName } of match.photos) {
    try {
      const path = join(photosDir, fileName);
      if ((await lstat(path)).size > MAX_UPLOAD_BYTES) throw new PhotoError(TOO_LARGE_MESSAGE);
      await normalizePhoto(await readFile(path));
    } catch (error) {
      if (!(error instanceof PhotoError)) throw error;
      errors.push(`Foto ${fileName}: ${error.message}`);
    }
  }

  return {
    plan: {
      rows,
      photos: match.photos.map((photo) => ({ ...photo, load: () => readFile(join(photosDir, photo.fileName)) })),
      orphanFiles: match.orphans,
    },
    errors,
    notes: match.ignored.map((fileName) => `Arquivo ignorado em ${PHOTOS_DIR}/ (não é JPG, PNG nem WebP): ${fileName}`),
  };
}

export const SIMULATION_LINE = "SIMULAÇÃO: nada foi gravado. Use --apply para gravar.";

/**
 * The whole command, without the part that opens the connection: reads the
 * folder, loads (or simulates) and answers with the lines to print and the exit
 * code. `conn` has to be one connection, not a pool.
 */
export async function runProductsImport(
  dir: string,
  { apply }: { apply: boolean },
  conn: Queryable,
): Promise<{ lines: string[]; exitCode: number }> {
  const { plan, errors, notes } = await readProductsFolder(dir);
  if (errors.length > 0) {
    return { lines: [...errors.map((error) => `ERRO: ${error}`), `${errors.length} erro(s). Nada foi gravado.`], exitCode: 1 };
  }

  const report = await importProducts(plan, { apply }, conn);
  const lines = [
    ...notes,
    ...report.withoutPhoto.map((code) => `AVISO: equipamento sem foto: ${code}`),
    ...report.photosWithoutProduct.map((fileName) => `AVISO: foto sem equipamento: ${fileName}`),
  ];
  if (!apply) lines.push(SIMULATION_LINE);
  lines.push(reportLine(report));
  return { lines, exitCode: 0 };
}

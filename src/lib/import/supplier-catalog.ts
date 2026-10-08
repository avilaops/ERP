import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Queryable } from "@/lib/db/pool";
import { upsertSupplierItem } from "@/lib/db/supplier-items";
import type { SupplierItemInput } from "@/lib/db/supplier-items";

type Dimensions = { comprimento?: number; largura?: number; altura?: number };
type Entry = {
  fornecedor?: string; catalogo?: string; linha?: string; codigo?: string; nome?: string; descricao_en?: string;
  dimensoes_mm?: Dimensions; peso_kg?: number; tipo_carga?: string; foto?: string; ludus?: { codigo?: string } | null;
};

export type CatalogPlan = { items: { input: SupplierItemInput; photo: string | null }[]; errors: string[] };

/**
 * Reads the supplier catalogue file (`{ equipamentos: [...] }`) and finds each
 * photo under `photosDir`, by the last two parts of the path the file gives
 * (`<catálogo>/<arquivo>`). Nothing is written here: what is wrong comes back as errors.
 */
export async function readSupplierCatalog(file: string, photosDir: string): Promise<CatalogPlan> {
  const data = JSON.parse(await readFile(file, "utf8")) as { equipamentos?: Entry[] };
  const errors: string[] = [];
  const items: CatalogPlan["items"] = [];
  const seen = new Set<string>();
  for (const [index, entry] of (data.equipamentos ?? []).entries()) {
    const where = `item ${index + 1} (${entry.codigo ?? "sem código"})`;
    if (!entry.fornecedor || !entry.catalogo || !entry.codigo || !entry.nome) {
      errors.push(`${where}: falta fornecedor, catálogo, código ou nome.`);
      continue;
    }
    const key = `${entry.fornecedor}|${entry.catalogo}|${entry.codigo}`;
    if (seen.has(key)) errors.push(`${where}: repetido no catálogo ${entry.catalogo}.`);
    seen.add(key);

    let photo: string | null = null;
    if (entry.foto) {
      const candidate = path.join(photosDir, ...entry.foto.split("/").slice(-2));
      // The photo stays inside the folder given: a path in the file cannot climb out of it.
      if (!path.resolve(candidate).startsWith(path.resolve(photosDir) + path.sep)) errors.push(`${where}: caminho de foto inválido.`);
      else photo = candidate;
    }
    items.push({
      photo,
      input: {
        supplier: entry.fornecedor, catalog: entry.catalogo, line: entry.linha ?? null, code: entry.codigo, name: entry.nome,
        description: entry.descricao_en ?? null,
        lengthMm: entry.dimensoes_mm?.comprimento ?? null, widthMm: entry.dimensoes_mm?.largura ?? null, heightMm: entry.dimensoes_mm?.altura ?? null,
        weightKg: entry.peso_kg ?? null, loadType: entry.tipo_carga ?? null, productCode: entry.ludus?.codigo ?? null,
      },
    });
  }
  if (items.length === 0 && errors.length === 0) errors.push("O arquivo não traz nenhum equipamento.");
  return { items, errors };
}

/**
 * Loads the catalogue into one company. Without `apply` nothing is written. The
 * caller gives a connection inside one transaction: a failure writes nothing.
 */
export async function runSupplierCatalogImport(
  file: string,
  photosDir: string,
  { apply, who }: { apply: boolean; who: string },
  conn: Queryable,
): Promise<{ lines: string[]; exitCode: number }> {
  const plan = await readSupplierCatalog(file, photosDir);
  const photos = new Map<string, Buffer>();
  for (const item of plan.items) {
    if (!item.photo) continue;
    try {
      photos.set(item.photo, await readFile(item.photo));
    } catch {
      plan.errors.push(`${item.input.code}: foto não encontrada em ${item.photo}.`);
    }
  }
  if (plan.errors.length > 0) return { lines: [...plan.errors.map((error) => `ERRO: ${error}`), "Nada foi gravado."], exitCode: 1 };

  const linked = plan.items.filter((item) => item.input.productCode !== null).length;
  const summary = `itens=${plan.items.length} com_foto=${photos.size} com_equipamento_da_empresa=${linked}`;
  if (!apply) return { lines: ["SIMULAÇÃO: nada foi gravado. Use --apply para gravar.", summary], exitCode: 0 };

  let created = 0;
  await conn.query("BEGIN");
  try {
    for (const item of plan.items) {
      const result = await upsertSupplierItem(item.input, item.photo ? (photos.get(item.photo) ?? null) : null, who, conn);
      if (result.created) created += 1;
    }
    await conn.query("COMMIT");
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  }
  return { lines: [`${summary} criados=${created} atualizados=${plan.items.length - created}`], exitCode: 0 };
}

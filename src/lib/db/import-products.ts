import type { Queryable } from "@/lib/db/pool";
import { saveProductPhoto } from "@/lib/db/product-photos";
import { createProduct, findProductByCode, updateProductText } from "@/lib/db/products";
import type { Product, ProductText } from "@/lib/db/products";

/** Who the batch load signs as in `updated_by`. */
export const IMPORT_USER = "carga";

export type ImportRow = {
  code: string;
  name: string;
  description: string | null;
  supplierName: string | null;
  supplierModel: string | null;
  supplierPriceUsd: number | null;
};

export type ImportPlan = {
  rows: ImportRow[];
  /** One per code. The bytes are read only when needed: a folder of photos does not fit in memory at once. */
  photos: { code: string; fileName: string; load(): Promise<Uint8Array> }[];
  /** Image files that can belong to no product (the name is not a code). */
  orphanFiles: string[];
};

export type ImportReport = {
  created: number;
  updated: number;
  unchanged: number;
  photosSaved: number;
  photosSame: number;
  /** Codes of the spreadsheet with no photo, neither in the folder nor in the database. */
  withoutPhoto: string[];
  /** Files whose code is neither in the spreadsheet nor in the database. */
  photosWithoutProduct: string[];
};

/** What the product becomes: the name always, the rest only where the spreadsheet brought something. */
function mergedText(current: Product, row: ImportRow): ProductText {
  return {
    name: row.name,
    description: row.description ?? current.description,
    supplierName: row.supplierName ?? current.supplierName,
    supplierModel: row.supplierModel ?? current.supplierModel,
    supplierPriceUsd: row.supplierPriceUsd ?? current.supplierPriceUsd,
  };
}

const sameText = (current: Product, text: ProductText) =>
  (Object.keys(text) as (keyof ProductText)[]).every((key) => current[key] === text[key]);

/**
 * The batch load, in one transaction. A new code creates the product, without
 * cost; an existing one has its text updated. Cost, tax credit, packaging and
 * `active` are never touched. Without `apply` everything is undone at the end:
 * the report says what would happen and nothing is written. Any failure undoes
 * everything.
 *
 * `conn` has to be ONE connection (see `withTenantConnection`), not a pool.
 */
export async function importProducts(
  plan: ImportPlan,
  { apply }: { apply: boolean },
  conn: Queryable,
): Promise<ImportReport> {
  const report: ImportReport = {
    created: 0,
    updated: 0,
    unchanged: 0,
    photosSaved: 0,
    photosSame: 0,
    withoutPhoto: [],
    photosWithoutProduct: [...plan.orphanFiles],
  };

  await conn.query("BEGIN");
  try {
    const ids = new Map<string, number>();
    const hadPhoto = new Set<string>();
    for (const row of plan.rows) {
      const current = await findProductByCode(row.code, conn);
      if (current === null) {
        const created = await createProduct({ ...row }, IMPORT_USER, conn);
        ids.set(row.code, created.id);
        report.created += 1;
        continue;
      }
      ids.set(row.code, current.id);
      if (current.hasPhoto) hadPhoto.add(row.code);
      const text = mergedText(current, row);
      if (sameText(current, text)) {
        report.unchanged += 1;
      } else {
        await updateProductText(current.id, text, IMPORT_USER, conn);
        report.updated += 1;
      }
    }

    const withFile = new Set<string>();
    for (const photo of plan.photos) {
      const id = ids.get(photo.code) ?? (await findProductByCode(photo.code, conn))?.id;
      if (id === undefined) {
        report.photosWithoutProduct.push(photo.fileName);
        continue;
      }
      withFile.add(photo.code);
      const { changed } = await saveProductPhoto(id, await photo.load(), IMPORT_USER, conn);
      if (changed) report.photosSaved += 1;
      else report.photosSame += 1;
    }
    report.withoutPhoto = plan.rows.map((row) => row.code).filter((code) => !withFile.has(code) && !hadPhoto.has(code));
    report.photosWithoutProduct.sort();

    await conn.query(apply ? "COMMIT" : "ROLLBACK");
    return report;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  }
}

/** The last line of the command's output. The names are part of the contract. */
export function reportLine(report: ImportReport): string {
  return [
    `criados=${report.created}`,
    `atualizados=${report.updated}`,
    `inalterados=${report.unchanged}`,
    `fotos_gravadas=${report.photosSaved}`,
    `fotos_iguais=${report.photosSame}`,
    `sem_foto=${report.withoutPhoto.length}`,
    `fotos_sem_equipamento=${report.photosWithoutProduct.length}`,
  ].join(" ");
}

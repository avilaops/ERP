import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { loadParams, saveParams } from "@/lib/db/params";
import { publishPriceTable } from "@/lib/db/price-table";
import { queryPriceTableReview } from "@/lib/db/price-table-review";
import { createProduct, listProducts, loadPriceTableDraftRevision, loadProductPublicationSummary, loadProductTabCounts, updateProduct } from "@/lib/db/products";
import { parseListQuery } from "@/lib/list-query";
import { draftPriceTable } from "@/lib/price-table";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;

before(async () => { if (!skip) db = await openTestDb("publication_review"); });
after(async () => { if (!skip) await db.close(); });

test("resumo, revisão paginada e token de concorrência acompanham o rascunho", { skip }, async () => {
  const first = await createProduct({ name: "A", code: "A", advisoryCost: 1000 }, WHO, db.pool);
  await createProduct({ name: "B", code: "B", advisoryCost: 1200 }, WHO, db.pool);
  await createProduct({ name: "Sem custo", code: "C" }, WHO, db.pool);
  await createProduct({ name: "Inativo", code: "D", advisoryCost: 500, active: false }, WHO, db.pool);
  assert.deepEqual(await loadProductTabCounts(1, db.pool), { ativos: 3, "sem-custo": 1, "sem-codigo": 0, inativos: 1 });

  const revision = await loadPriceTableDraftRevision(1, db.pool);
  await updateProduct(first.id, { packaging: 10 }, WHO, db.pool);
  assert.notEqual(await loadPriceTableDraftRevision(1, db.pool), revision);

  const params = await loadParams(db.pool);
  const draft = draftPriceTable(params, await listProducts({ active: true }, db.pool));
  await publishPriceTable(draft, 1, WHO, db.pool);
  assert.deepEqual(await loadProductPublicationSummary(1, 1, false, params.safetyMargin, db.pool), { itemCount: 2, pending: null });

  const changed = structuredClone(params);
  changed.freeDiscount += 0.01;
  await saveParams(changed, WHO, db.pool);
  const summary = await loadProductPublicationSummary(1, 1, true, changed.safetyMargin, db.pool);
  assert.equal(summary.pending?.rules, true);
  const options = { sorts: ["nome"] as const, defaultSort: "nome" as const, filters: { categoria: ["custos", "novos", "removidos", "cadastro", "regras"] } };
  const query = parseListQuery({ categoria: "regras", porPagina: "10" }, options);
  const review = await queryPriceTableReview(query, 1, 1, true, changed.safetyMargin, db.pool);
  assert.equal(review.total, 2);
  assert.ok(review.items.every((row) => row.category === "regras"));
});

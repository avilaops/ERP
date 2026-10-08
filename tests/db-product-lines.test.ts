import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { loadParams, saveParams } from "@/lib/db/params";
import { latestVersion, loadPublishedTable, publishPriceTable } from "@/lib/db/price-table";
import { ProductLineError, createLine, deleteLine, listLines, renameLine } from "@/lib/db/product-lines";
import { createProduct, listProductCosts, listProducts, updateProduct } from "@/lib/db/products";
import { draftPriceTable } from "@/lib/price-table";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("lines");
});
after(async () => {
  if (!skip) await db.close();
});

test("linhas: a empresa nasce com uma; a nova copia parâmetros e alíquotas e depois segue sozinha", { skip }, async () => {
  assert.deepEqual(await listLines(db.pool), [{ id: 1, name: "Importada", imported: true, products: 0, versions: 0 }]);
  const national = await createLine(" Nacional ", 1, WHO, db.pool);
  assert.equal(national.name, "Nacional");
  assert.deepEqual(await loadParams(db.pool, national.id), await loadParams(db.pool, 1));

  const base = await loadParams(db.pool, national.id);
  const stateRates = { ...base.stateRates, MG: { ...base.stateRates.MG, outboundIcms: 0.12 } };
  await saveParams({ ...base, ipi: 0, freeDiscount: 0.3, stateRates }, WHO, db.pool, national.id);
  const [main, other] = [await loadParams(db.pool, 1), await loadParams(db.pool, national.id)];
  assert.deepEqual([other.ipi, other.freeDiscount, other.stateRates.MG.outboundIcms], [0, 0.3, 0.12]);
  assert.deepEqual([main.ipi, main.freeDiscount, main.stateRates.MG.outboundIcms], [base.ipi, base.freeDiscount, undefined]);
});

test("linhas: nome repetido, em branco e origem inexistente são recusados", { skip }, async () => {
  await assert.rejects(() => createLine("nacional", 1, WHO, db.pool), ProductLineError);
  await assert.rejects(() => createLine("  ", 1, WHO, db.pool), ProductLineError);
  await assert.rejects(() => createLine("Outra", 99, WHO, db.pool), ProductLineError);
  await assert.rejects(() => renameLine(1, "NACIONAL", WHO, db.pool), ProductLineError);
  assert.equal((await renameLine(1, "Linha importada", WHO, db.pool)).name, "Linha importada");
  // De onde a linha vem: nasce importada, a nova copia a da origem, e a tela muda sem mexer no nome.
  const made = (await listLines(db.pool)).find((line) => line.name === "Nacional")!;
  assert.equal(made.imported, true);
  assert.equal((await renameLine(made.id, "Nacional", WHO, db.pool, false)).imported, false);
  assert.equal((await renameLine(made.id, "Nacional", WHO, db.pool)).imported, false);
  assert.deepEqual((await listLines(db.pool)).map((line) => [line.name, line.imported]), [["Linha importada", true], ["Nacional", false]]);
  assert.equal((await listLines(db.pool)).length, 2);
});

test("linhas: cada uma tem os seus equipamentos e a sua tabela; a numeração das versões é uma só", { skip }, async () => {
  const [, national] = await listLines(db.pool);
  await createProduct({ name: "Importado", code: "LD-A1", advisoryCost: 1000 }, WHO, db.pool);
  const made = await createProduct({ name: "Nacional", code: "LD-WH1", advisoryCost: 2000, lineId: national.id }, WHO, db.pool);
  assert.equal(made.lineId, national.id);
  assert.deepEqual((await listProducts({ lineId: national.id }, db.pool)).map((product) => product.code), ["LD-WH1"]);
  assert.deepEqual((await listProducts({ lineId: 1 }, db.pool)).map((product) => product.code), ["LD-A1"]);
  assert.equal((await listProducts({}, db.pool)).length, 2);
  assert.equal((await listProductCosts(db.pool, national.id)).length, 1);

  const draft = async (lineId: number) => draftPriceTable(await loadParams(db.pool, lineId), await listProducts({ active: true, lineId }, db.pool));
  const first = await publishPriceTable(await draft(national.id), 1, WHO, db.pool, national.id);
  const second = await publishPriceTable(await draft(1), 2, WHO, db.pool, 1);
  assert.deepEqual([first.lineId, second.lineId], [national.id, 1]);
  assert.equal((await latestVersion(db.pool, national.id))?.version, 1);
  assert.equal((await latestVersion(db.pool, 1))?.version, 2);

  const table = await loadPublishedTable(1, db.pool);
  assert.deepEqual([table?.lineId, table?.ipi, table?.freeDiscount], [national.id, 0, 0.3]);
  assert.deepEqual(table?.items.map((item) => item.code), ["LD-WH1"]);
});

test("linhas: equipamento muda de linha; linha com equipamento ou tabela não sai, a vazia sai com os parâmetros dela", { skip }, async () => {
  const [, national] = await listLines(db.pool);
  await assert.rejects(() => deleteLine(national.id, db.pool), ProductLineError);
  const spare = await createLine("Acessórios", national.id, WHO, db.pool);
  const moved = await createProduct({ name: "Anilha", lineId: spare.id }, WHO, db.pool);
  await assert.rejects(() => deleteLine(spare.id, db.pool), ProductLineError);
  await assert.rejects(() => updateProduct(moved.id, { lineId: 99 }, WHO, db.pool), /Linha de produto não encontrada/);
  assert.equal((await updateProduct(moved.id, { lineId: 1 }, WHO, db.pool)).lineId, 1);

  await deleteLine(spare.id, db.pool);
  assert.deepEqual((await listLines(db.pool)).map((line) => line.name), ["Linha importada", "Nacional"]);
  const left = await db.pool.query("SELECT count(*)::int AS rows FROM state_tax_rates WHERE line_id = $1", [spare.id]);
  assert.equal(left.rows[0].rows, 0);
  await assert.rejects(() => loadParams(db.pool, spare.id), /Parâmetros não cadastrados/);
  await assert.rejects(() => deleteLine(spare.id, db.pool), /Linha não encontrada/);
});

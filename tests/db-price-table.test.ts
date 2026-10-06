import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { loadParams, saveParams } from "@/lib/db/params";
import {
  latestVersion,
  listVersions,
  loadPublishedSnapshot,
  loadPublishedTable,
  publishPriceTable,
} from "@/lib/db/price-table";
import { createProduct, deleteProduct, listProducts, updateProduct } from "@/lib/db/products";
import { draftPriceTable } from "@/lib/price-table";
import type { PriceTableDraft } from "@/lib/price-table";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("price_table");
});
after(async () => {
  if (!skip) await db.close();
});

/** The four products of the print, with what the published table has to hold for each. */
const PRINT = [
  { code: "LD-B001", advisoryCost: 8146.64, taxCredit: 0.2811565, table: 19204.61, tableWithIpi: 21701.21 },
  { code: "LD-B002", advisoryCost: 8738.77, taxCredit: 0.2735316, table: 20818.99, tableWithIpi: 23525.46 },
  { code: "LD-B003", advisoryCost: 11571.09, taxCredit: 0.2766628, table: 27447.81, tableWithIpi: 31016.03 },
  { code: "LD-B004", advisoryCost: 8719.03, taxCredit: 0.2737689, table: 20765.18, tableWithIpi: 23464.65 },
];

const draftNow = async () => draftPriceTable(await loadParams(db.pool), await listProducts({ active: true }, db.pool));
const counts = async () => {
  const { rows } = await db.pool.query(
    "SELECT (SELECT count(*) FROM price_table_versions)::int AS versions, (SELECT count(*) FROM price_table_items)::int AS items",
  );
  return [rows[0].versions, rows[0].items];
};

test("as chaves estrangeiras do retrato não apagam em cascata", { skip }, async () => {
  const { rows } = await db.pool.query(
    `SELECT confrelid::regclass::text AS target, confdeltype::text AS on_delete
       FROM pg_constraint
      WHERE conrelid = 'price_table_items'::regclass AND contype = 'f'
      ORDER BY 1`,
  );
  assert.deepEqual(rows, [
    { target: "price_table_versions", on_delete: "a" },
    { target: "products", on_delete: "a" },
  ]);
});

test("antes da primeira publicação não há versão", { skip }, async () => {
  assert.equal(await latestVersion(db.pool), null);
  assert.equal(await loadPublishedSnapshot(1, db.pool), null);
});

test("publicar o print: a v1 guarda os preços do protótipo, o crédito exato e os parâmetros", { skip }, async () => {
  for (const { code, advisoryCost, taxCredit } of PRINT) {
    await createProduct({ name: `Equipamento ${code}`, code, advisoryCost, taxCredit }, WHO, db.pool);
  }
  // Fora da tabela: inativo e sem custo.
  await createProduct({ name: "Inativo", code: "LD-X1", advisoryCost: 100, active: false }, WHO, db.pool);
  await createProduct({ name: "Sem custo", code: "LD-X2" }, WHO, db.pool);

  const draft = await draftNow();
  const before = Date.now();
  const version = await publishPriceTable(draft, 1, WHO, db.pool);
  assert.equal(version.version, 1);
  assert.equal(version.publishedBy, WHO);
  assert.ok(version.publishedAt instanceof Date && Math.abs(version.publishedAt.getTime() - before) < 60_000);
  assert.deepEqual(await latestVersion(db.pool), version);

  const snapshot = await loadPublishedSnapshot(1, db.pool);
  assert.ok(snapshot);
  assert.deepEqual(
    snapshot.items.map(({ code, advisoryCost, taxCredit, table, tableWithIpi }) => ({ code, advisoryCost, taxCredit, table, tableWithIpi })),
    PRINT,
  );
  assert.deepEqual(snapshot.params, await loadParams(db.pool));
  assert.deepEqual(snapshot.items, draft.items);
  assert.deepEqual({ version: snapshot.version, publishedAt: snapshot.publishedAt, publishedBy: snapshot.publishedBy }, version);
});

test("o retrato não muda quando o rascunho muda", { skip }, async () => {
  const before = await loadPublishedSnapshot(1, db.pool);
  const products = await listProducts({ active: true }, db.pool);
  const byCode = (code: string) => products.find((product) => product.code === code)?.id ?? 0;

  await updateProduct(byCode("LD-B001"), { advisoryCost: 9000, taxCredit: 0.1 }, WHO, db.pool);
  await updateProduct(byCode("LD-B002"), { name: "Renomeado", code: "LD-B020" }, WHO, db.pool);
  await updateProduct(byCode("LD-B003"), { active: false }, WHO, db.pool);
  await saveParams({ ...(await loadParams(db.pool)), freeDiscount: 0.1, ipi: 0.1 }, WHO, db.pool);

  assert.deepEqual(await loadPublishedSnapshot(1, db.pool), before);
});

test("numeração: a segunda publicação é a v2 e a v1 continua lá", { skip }, async () => {
  const first = await loadPublishedSnapshot(1, db.pool);
  const draft = await draftNow();
  const second = await publishPriceTable(draft, 2, "outra@teste.local", db.pool);
  assert.equal(second.version, 2);
  assert.deepEqual(await latestVersion(db.pool), second);

  const snapshot = await loadPublishedSnapshot(2, db.pool);
  assert.equal(snapshot?.items.length, 3);
  assert.equal(snapshot?.params.freeDiscount, 0.1);
  assert.equal(snapshot?.items.find((item) => item.code === "LD-B020")?.name, "Renomeado");
  assert.equal(snapshot?.items.find((item) => item.code === "LD-B001")?.advisoryCost, 9000);
  assert.deepEqual(await loadPublishedSnapshot(1, db.pool), first);
  assert.equal(await loadPublishedSnapshot(3, db.pool), null);
});

test("número que não é o próximo é recusado e nada é gravado", { skip }, async () => {
  const draft = await draftNow();
  const before = await counts();
  for (const version of [5, 2, 1]) {
    await assert.rejects(() => publishPriceTable(draft, version, WHO, db.pool), /já foi publicada por outra pessoa/, String(version));
  }
  assert.deepEqual(await counts(), before);
});

test("duas publicações da mesma versão ao mesmo tempo: uma grava, a outra é recusada", { skip }, async () => {
  const draft = await draftNow();
  const [versions] = await counts();
  const results = await Promise.allSettled([
    publishPriceTable(draft, 3, "a@teste.local", db.pool),
    publishPriceTable(draft, 3, "b@teste.local", db.pool),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  const refused = results.find((result) => result.status === "rejected");
  assert.match(String(refused?.status === "rejected" && refused.reason), /já foi publicada por outra pessoa/);
  assert.equal((await counts())[0], versions + 1);
  assert.equal((await latestVersion(db.pool))?.version, 3);
});

test("tudo ou nada: produto que não existe derruba a publicação inteira", { skip }, async () => {
  const draft = await draftNow();
  const before = await counts();
  const ghost = { ...draft.items[0], productId: 2_000_000_000 };
  await assert.rejects(
    () => publishPriceTable({ ...draft, items: [...draft.items, ghost] }, 4, WHO, db.pool),
    /Um equipamento foi excluído durante a publicação\. Nada foi publicado/,
  );
  assert.deepEqual(await counts(), before);
  assert.equal((await latestVersion(db.pool))?.version, 3);
});

test("rascunho inválido dá erro antes de chegar ao banco", { skip }, async () => {
  const draft = await draftNow();
  const before = await counts();
  const [item] = draft.items;
  const publish = (bad: PriceTableDraft, who = WHO, version = 4) => publishPriceTable(bad, version, who, db.pool);
  const withItem = (change: Partial<typeof item>) => ({ ...draft, items: [{ ...item, ...change }] });

  await assert.rejects(() => publish({ ...draft, items: [] }), /não há o que publicar/);
  await assert.rejects(() => publish({ ...draft, items: [item, item] }), /Equipamento repetido/);
  await assert.rejects(() => publish(withItem({ advisoryCost: 0 })), /Custo da assessoria precisa ser maior que zero/);
  await assert.rejects(() => publish(withItem({ advisoryCost: -1 })), /Custo da assessoria/);
  await assert.rejects(() => publish(withItem({ table: 0 })), /Preço de tabela precisa ser maior que zero/);
  await assert.rejects(() => publish(withItem({ tableWithIpi: item.table - 0.01 })), /menor que o preço sem IPI/);
  await assert.rejects(() => publish(withItem({ taxCredit: 1 })), /Crédito de impostos/);
  await assert.rejects(() => publish(withItem({ packaging: Number.NaN })), /Embalagem/);
  await assert.rejects(() => publish(withItem({ name: "  " })), /sem nome/);
  await assert.rejects(() => publish({ ...draft, params: { ...draft.params, ipi: 1.3 } }), /Parâmetro inválido/);
  await assert.rejects(() => publish(draft, "  "), /quem está publicando/);
  for (const version of [0, -1, 1.5, Number.NaN]) {
    await assert.rejects(() => publish(draft, WHO, version), /Número de versão inválido/, String(version));
  }
  assert.deepEqual(await counts(), before);
});

test("excluir depois de publicar: quem já saiu numa versão só pode ser desativado", { skip }, async () => {
  const products = await listProducts({}, db.pool);
  const publishedOne = products.find((product) => product.code === "LD-B004");
  const neverPublished = products.find((product) => product.code === "LD-X2");
  assert.ok(publishedOne && neverPublished);

  await assert.rejects(
    () => deleteProduct(publishedOne.id, db.pool),
    /Este equipamento já tem histórico e não pode ser excluído\. Desative-o\./,
  );
  assert.ok((await listProducts({}, db.pool)).some((product) => product.id === publishedOne.id));
  assert.equal((await updateProduct(publishedOne.id, { active: false }, WHO, db.pool)).active, false);

  await deleteProduct(neverPublished.id, db.pool);
  assert.ok((await listProducts({}, db.pool)).every((product) => product.id !== neverPublished.id));
});

test("a equipe não recebe custo do banco: a leitura dela só tem nome, código e preço", { skip }, async () => {
  const table = await loadPublishedTable(1, db.pool);
  assert.ok(table);
  assert.deepEqual(Object.keys(table), [
    "version",
    "publishedAt",
    "freeDiscount",
    "ipi",
    "minDownPayment",
    "proposalValidityDays",
    "commission",
    "items",
  ]);
  // As condições comerciais que o vendedor já lê na proposta; nada de custo, lucro ou imposto de venda.
  assert.deepEqual(
    [table.ipi, table.minDownPayment, table.proposalValidityDays, table.commission],
    [0.13, 0.65, 7, 0.02],
  );
  for (const item of table.items) {
    assert.deepEqual(Object.keys(item), ["productId", "code", "name", "table", "tableWithIpi"]);
  }
  assert.equal(table.version, 1);
  assert.equal(table.freeDiscount, 0.2);
  assert.deepEqual(
    table.items.map(({ code, table: price, tableWithIpi }) => [code, price, tableWithIpi]),
    PRINT.map(({ code, table: price, tableWithIpi }) => [code, price, tableWithIpi]),
  );

  // O mesmo retrato que a diretoria lê, sem as colunas de custo.
  const snapshot = await loadPublishedSnapshot(1, db.pool);
  assert.equal(table.publishedAt.getTime(), snapshot?.publishedAt.getTime());
  assert.deepEqual(table.items.map((item) => item.productId), snapshot?.items.map((item) => item.productId));
  // A v2 saiu com outro desconto livre: cada versão mostra o seu.
  assert.equal((await loadPublishedTable(2, db.pool))?.freeDiscount, 0.1);

  for (const version of [99, 0, -1, 1.5, Number.NaN]) {
    assert.equal(await loadPublishedTable(version, db.pool), null, String(version));
  }
});

test("versões: da mais nova para a mais antiga", { skip }, async () => {
  const versions = await listVersions(db.pool);
  assert.deepEqual(versions.map((item) => item.version), [3, 2, 1]);
  assert.deepEqual(versions[0], await latestVersion(db.pool));
  assert.equal(versions[2].publishedBy, WHO);
});

test("cada versão guarda as alíquotas por estado com que foi calculada", { skip }, async () => {
  const before = await loadPublishedSnapshot(3, db.pool);
  assert.ok(before);
  const params = await loadParams(db.pool);
  const reform = { ...params, stateRates: { ...params.stateRates, RS: { internalIcms: 0.25, fcp: 0.02 } } };
  await saveParams(reform, WHO, db.pool);

  // A v3 não muda com a alteração da tabela de estados…
  assert.deepEqual(await loadPublishedSnapshot(3, db.pool), before);
  // …e a v4 sai com as alíquotas novas, as 27.
  const published = await publishPriceTable(await draftNow(), 4, WHO, db.pool);
  assert.equal(published.version, 4);
  const after = await loadPublishedSnapshot(4, db.pool);
  assert.deepEqual(after?.params.stateRates, reform.stateRates);
  assert.deepEqual(after?.params.stateRates.RS, { internalIcms: 0.25, fcp: 0.02 });
  const { rows } = await db.pool.query("SELECT version, count(*)::int AS states FROM price_table_state_rates GROUP BY version ORDER BY version");
  assert.deepEqual(rows, [1, 2, 3, 4].map((version) => ({ version, states: 27 })));
  // O RS virou o pior destino: o preço de tabela da v4 é maior que o da v3 para o mesmo custo.
  const item = (snapshot: typeof after) => snapshot?.items.find((entry) => entry.code === "LD-B001");
  assert.ok((item(after)?.table ?? 0) > (item(before)?.table ?? 0));
});

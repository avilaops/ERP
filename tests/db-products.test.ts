import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createProduct, listProductCosts, listProducts } from "@/lib/db/products";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("products");
});
after(async () => {
  if (!skip) await db.close();
});

test("produto: o crédito de impostos volta exatamente como entrou (sete casas)", { skip }, async () => {
  const created = await createProduct(
    { name: "Mesa Flexora", code: "LD-B001", advisoryCost: 8146.64, taxCredit: 0.2811565 },
    WHO,
    db.pool,
  );
  assert.equal(created.taxCredit, 0.2811565);
  assert.equal(created.advisoryCost, 8146.64);
  assert.equal(created.packaging, 0);
  assert.equal(created.active, true);

  const [listed] = await listProducts({}, db.pool);
  assert.deepEqual(listed, created);
});

test("produto sem custo volta com advisoryCost nulo, e sem código não colide com outro sem código", { skip }, async () => {
  const first = await createProduct({ name: "Sem custo A", code: "  " }, WHO, db.pool);
  const second = await createProduct({ name: "Sem custo B" }, WHO, db.pool);
  assert.equal(first.advisoryCost, null);
  assert.equal(first.code, null);
  assert.equal(second.code, null);
});

test("produto: código repetido é recusado com mensagem em português", { skip }, async () => {
  await createProduct({ name: "Cadeira Extensora", code: "LD-B002" }, WHO, db.pool);
  await assert.rejects(
    () => createProduct({ name: "Outra", code: "LD-B002" }, WHO, db.pool),
    /Já existe produto com o código "LD-B002"/,
  );
});

test("produto: entrada inválida dá erro antes de chegar ao banco", { skip }, async () => {
  const before = (await listProducts({}, db.pool)).length;
  await assert.rejects(() => createProduct({ name: "   " }, WHO, db.pool), /sem nome/);
  await assert.rejects(() => createProduct({ name: "X", advisoryCost: -1 }, WHO, db.pool), /Custo da assessoria/);
  await assert.rejects(() => createProduct({ name: "X", advisoryCost: Number.NaN }, WHO, db.pool), /Custo da assessoria/);
  await assert.rejects(() => createProduct({ name: "X", taxCredit: 1 }, WHO, db.pool), /Crédito de impostos/);
  await assert.rejects(() => createProduct({ name: "X", packaging: -5 }, WHO, db.pool), /Embalagem/);
  await assert.rejects(() => createProduct({ name: "X" }, " ", db.pool), /quem está cadastrando/);
  assert.equal((await listProducts({}, db.pool)).length, before);
});

test("produto: a lista filtra por ativo e vem em ordem de nome", { skip }, async () => {
  await createProduct({ name: "Zeta inativo", active: false }, WHO, db.pool);
  await createProduct({ name: "Alfa ativo" }, WHO, db.pool);

  const active = await listProducts({ active: true }, db.pool);
  const inactive = await listProducts({ active: false }, db.pool);
  const all = await listProducts({}, db.pool);

  assert.ok(active.every((product) => product.active));
  assert.deepEqual(inactive.map((product) => product.name), ["Zeta inativo"]);
  assert.equal(all.length, active.length + inactive.length);
  assert.deepEqual(all.map((product) => product.name), [...all.map((product) => product.name)].sort((a, b) => a.localeCompare(b, "en")));
  assert.equal(active[0].name, "Alfa ativo");
});

test("produto: o motor recebe só os ativos que já têm custo", { skip }, async () => {
  await createProduct({ name: "Inativo com custo", advisoryCost: 100, active: false }, WHO, db.pool);
  const costs = await listProductCosts(db.pool);
  assert.deepEqual(costs, [{ advisoryCost: 8146.64, taxCredit: 0.2811565, packaging: 0 }]);
});

test("produto: o banco recusa crédito fora de [0, 1) e custo negativo", { skip }, async () => {
  await assert.rejects(() => db.pool.query("UPDATE products SET tax_credit = 1"), /check/i);
  await assert.rejects(() => db.pool.query("UPDATE products SET advisory_cost = -1"), /check/i);
});

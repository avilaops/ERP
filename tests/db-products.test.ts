import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  applyAdvisoryCosts,
  createProduct,
  deleteProduct,
  listProductCosts,
  listProducts,
  updateProduct,
} from "@/lib/db/products";
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

const OTHER = "outra@teste.local";

test("alterar: custo, crédito e embalagem voltam como entraram, e fica quem alterou", { skip }, async () => {
  const created = await createProduct({ name: "Para alterar", code: "UP-001" }, WHO, db.pool);
  const updated = await updateProduct(
    created.id,
    { advisoryCost: 8738.77, taxCredit: 0.2811565, packaging: 12.5 },
    OTHER,
    db.pool,
  );
  assert.deepEqual(updated, { ...created, advisoryCost: 8738.77, taxCredit: 0.2811565, packaging: 12.5 });
  assert.deepEqual((await listProducts({}, db.pool)).find((product) => product.id === created.id), updated);

  const { rows } = await db.pool.query("SELECT updated_by, updated_at > created_at AS touched FROM products WHERE id = $1", [
    created.id,
  ]);
  assert.deepEqual(rows[0], { updated_by: OTHER, touched: true });
});

test("alterar: só o que vem no patch muda; nome e código passam pela mesma limpeza do cadastro", { skip }, async () => {
  const created = await createProduct(
    { name: "Para desativar", code: "UP-002", supplierName: "DHZ", advisoryCost: 100, taxCredit: 0.25, packaging: 3 },
    WHO,
    db.pool,
  );
  const inactive = await updateProduct(created.id, { active: false }, WHO, db.pool);
  assert.deepEqual(inactive, { ...created, active: false });
  assert.deepEqual(await updateProduct(created.id, { active: true }, WHO, db.pool), created);

  const renamed = await updateProduct(created.id, { name: "  Renomeado  ", code: "  " }, WHO, db.pool);
  assert.deepEqual(renamed, { ...created, name: "Renomeado", code: null });
});

test("alterar: advisoryCost nulo volta o produto a sem custo", { skip }, async () => {
  const created = await createProduct({ name: "Com custo", advisoryCost: 500, taxCredit: 0.1 }, WHO, db.pool);
  const cleared = await updateProduct(created.id, { advisoryCost: null }, WHO, db.pool);
  assert.equal(cleared.advisoryCost, null);
  assert.equal(cleared.taxCredit, 0.1);
});

test("alterar: código repetido é recusado e nada muda", { skip }, async () => {
  await createProduct({ name: "Dono do código", code: "UP-010" }, WHO, db.pool);
  const other = await createProduct({ name: "Outro", code: "UP-011", advisoryCost: 10 }, WHO, db.pool);
  await assert.rejects(
    () => updateProduct(other.id, { code: "UP-010", advisoryCost: 99 }, WHO, db.pool),
    /Já existe produto com o código "UP-010"/,
  );
  assert.deepEqual((await listProducts({}, db.pool)).find((product) => product.id === other.id), other);
});

test("alterar: entrada inválida dá erro antes de chegar ao banco, e id que não existe não é encontrado", { skip }, async () => {
  const created = await createProduct({ name: "Intacto", advisoryCost: 10 }, WHO, db.pool);
  const change = (patch: Parameters<typeof updateProduct>[1], who = WHO) => updateProduct(created.id, patch, who, db.pool);

  await assert.rejects(() => change({ name: "   " }), /sem nome/);
  await assert.rejects(() => change({ advisoryCost: -1 }), /Custo da assessoria/);
  await assert.rejects(() => change({ advisoryCost: Number.NaN }), /Custo da assessoria/);
  await assert.rejects(() => change({ taxCredit: 1 }), /Crédito de impostos/);
  await assert.rejects(() => change({ packaging: -5 }), /Embalagem/);
  await assert.rejects(() => change({ supplierPriceUsd: -1 }), /Preço do fornecedor/);
  await assert.rejects(() => change({ active: false }, " "), /quem está alterando/);
  assert.deepEqual((await listProducts({}, db.pool)).find((product) => product.id === created.id), created);

  for (const id of [2_000_000_000, 0, -1, 1.5, Number.NaN]) {
    await assert.rejects(() => updateProduct(id, { active: false }, WHO, db.pool), /Produto não encontrado/, String(id));
  }
});

test("excluir: remove a linha; excluir de novo não encontra o produto", { skip }, async () => {
  const created = await createProduct({ name: "Lançado por engano", code: "UP-020" }, WHO, db.pool);
  const before = (await listProducts({}, db.pool)).length;

  assert.deepEqual(await deleteProduct(created.id, db.pool), created);
  const after = await listProducts({}, db.pool);
  assert.equal(after.length, before - 1);
  assert.ok(after.every((product) => product.id !== created.id));

  await assert.rejects(() => deleteProduct(created.id, db.pool), /Produto não encontrado/);
  await assert.rejects(() => deleteProduct(Number.NaN, db.pool), /Produto não encontrado/);
});

test("excluir: produto que outra tabela referencia é recusado, com a saída de desativar", { skip }, async () => {
  const created = await createProduct({ name: "Com histórico", code: "UP-030" }, WHO, db.pool);
  await db.pool.query("CREATE TABLE product_refs (product_id integer NOT NULL REFERENCES products (id))");
  await db.pool.query("INSERT INTO product_refs VALUES ($1)", [created.id]);

  await assert.rejects(() => deleteProduct(created.id, db.pool), /já tem histórico e não pode ser excluído\. Desative-o\./);
  assert.ok((await listProducts({}, db.pool)).some((product) => product.id === created.id));
});

const byCode = async (code: string) => (await listProducts({}, db.pool)).find((product) => product.code === code);

test("colar custos: atualiza vários por código numa chamada; crédito e embalagem ausentes ficam como estavam", { skip }, async () => {
  const first = await createProduct({ name: "Colagem A", code: "CC-001", advisoryCost: 100, taxCredit: 0.25, packaging: 7 }, WHO, db.pool);
  const second = await createProduct({ name: "Colagem B", code: "CC-002", active: false }, WHO, db.pool);
  const untouched = await createProduct({ name: "Colagem C", code: "CC-003", advisoryCost: 55 }, WHO, db.pool);

  const updated = await applyAdvisoryCosts(
    [
      { code: "CC-001", advisoryCost: 8146.64 },
      { code: "CC-002", advisoryCost: 8738.77, taxCredit: 0.2735316, packaging: 12.5 },
    ],
    OTHER,
    db.pool,
  );
  assert.deepEqual(
    [...updated].sort((a, b) => a.id - b.id),
    [
      { ...first, advisoryCost: 8146.64 },
      // Não muda nome, código nem a situação: o inativo continua inativo.
      { ...second, advisoryCost: 8738.77, taxCredit: 0.2735316, packaging: 12.5 },
    ],
  );
  assert.deepEqual(await byCode("CC-001"), { ...first, advisoryCost: 8146.64 });
  assert.deepEqual(await byCode("CC-003"), untouched);

  const { rows } = await db.pool.query("SELECT code, updated_by FROM products WHERE code LIKE 'CC-%' ORDER BY code");
  assert.deepEqual(rows, [
    { code: "CC-001", updated_by: OTHER },
    { code: "CC-002", updated_by: OTHER },
    { code: "CC-003", updated_by: WHO },
  ]);
});

test("colar custos: código que não existe não volta no resultado e não cria produto", { skip }, async () => {
  const before = (await listProducts({}, db.pool)).length;
  const updated = await applyAdvisoryCosts(
    [
      { code: "CC-003", advisoryCost: 60, packaging: 0 },
      { code: "CC-404", advisoryCost: 10 },
    ],
    WHO,
    db.pool,
  );
  assert.deepEqual(updated.map((product) => [product.code, product.advisoryCost]), [["CC-003", 60]]);
  assert.equal((await listProducts({}, db.pool)).length, before);
  assert.equal(await byCode("CC-404"), undefined);
});

test("colar custos: uma linha inválida recusa a lista inteira e nada muda; lista vazia não consulta", { skip }, async () => {
  const before = await listProducts({}, db.pool);
  const good = { code: "CC-001", advisoryCost: 1 };
  const apply = (rows: Parameters<typeof applyAdvisoryCosts>[0], who = WHO) => applyAdvisoryCosts(rows, who, db.pool);

  await assert.rejects(() => apply([good, { code: "CC-001", advisoryCost: 2 }]), /Código repetido na lista de custos: "CC-001"/);
  await assert.rejects(() => apply([good, { code: "CC-002", advisoryCost: 0 }]), /maior que zero/);
  await assert.rejects(() => apply([good, { code: "CC-002", advisoryCost: -1 }]), /Custo da assessoria/);
  await assert.rejects(() => apply([good, { code: "CC-002", advisoryCost: Number.NaN }]), /Custo da assessoria/);
  await assert.rejects(() => apply([good, { code: "CC-002", advisoryCost: 5, taxCredit: 1 }]), /Crédito de impostos/);
  await assert.rejects(() => apply([good, { code: "CC-002", advisoryCost: 5, packaging: -1 }]), /Embalagem/);
  await assert.rejects(() => apply([good, { code: "  ", advisoryCost: 5 }]), /sem código/);
  await assert.rejects(() => apply([good], " "), /quem está lançando/);
  assert.deepEqual(await listProducts({}, db.pool), before);

  const noQuery = { query: () => Promise.reject(new Error("não era para consultar")) };
  assert.deepEqual(await applyAdvisoryCosts([], WHO, noQuery), []);
});

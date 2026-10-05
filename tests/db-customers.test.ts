import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import type { CustomerInput } from "@/lib/customer";
import { createCustomer, findCustomerByDocument, getCustomer, listCustomers, updateCustomer } from "@/lib/db/customers";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "vendedor@teste.local";
const OTHER = "gerente@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("customers");
});
after(async () => {
  if (!skip) await db.close();
});

const COMPANY: CustomerInput = {
  kind: "PJ",
  document: "48240052000161",
  name: "TESTE",
  tradeName: "TESTE",
  contactName: "TESTE",
  stateRegistration: "ISENTO",
  rg: null,
  phone: "99999999999",
  email: "TESTE@TESTE.COM.BR",
  cep: "99999999",
  street: "TESTE",
  streetNumber: "123",
  complement: null,
  district: "TESTE",
  city: "TESTE",
  uf: "MA",
};

const blank = { tradeName: null, contactName: null, stateRegistration: null, rg: null, phone: null, email: null, cep: null, street: null, streetNumber: null, complement: null, district: null, city: null, uf: null };
const PERSON: CustomerInput = { ...blank, kind: "PF", document: "52998224725", name: "Maria da Silva", rg: "123456789" };

test("empresa do print: grava e volta igual, por id e por documento", { skip }, async () => {
  const created = await createCustomer(COMPANY, WHO, db.pool);
  assert.deepEqual(created, { ...COMPANY, id: created.id });
  assert.deepEqual(await getCustomer(created.id, db.pool), created);
  assert.deepEqual(await findCustomerByDocument("48240052000161", db.pool), created);
  assert.equal(await findCustomerByDocument("00000000000000", db.pool), null);
  for (const id of [2_000_000_000, 0, -1, 1.5, Number.NaN]) assert.equal(await getCustomer(id, db.pool), null, String(id));
});

test("pessoa física e empresa só com o mínimo: o que é da outra ficha fica em branco", { skip }, async () => {
  const person = await createCustomer({ ...PERSON, stateRegistration: "123456", tradeName: "X", contactName: "Y" }, WHO, db.pool);
  assert.deepEqual(person, { ...PERSON, id: person.id });

  const minimal = await createCustomer({ ...blank, kind: "PJ", document: "12ABC34501DE35", name: "  Academia Alfa  ", rg: "9" }, WHO, db.pool);
  assert.deepEqual(minimal, { ...blank, kind: "PJ", document: "12ABC34501DE35", name: "Academia Alfa", id: minimal.id });
});

test("documento repetido é recusado com a palavra certa, e nada é gravado", { skip }, async () => {
  const before = (await listCustomers(db.pool)).length;
  await assert.rejects(() => createCustomer({ ...COMPANY, name: "Outra" }, WHO, db.pool), /Já existe cliente com este CNPJ\./);
  await assert.rejects(() => createCustomer({ ...PERSON, name: "Outra" }, WHO, db.pool), /Já existe cliente com este CPF\./);
  assert.equal((await listCustomers(db.pool)).length, before);
});

test("entrada inválida dá erro antes de chegar ao banco", { skip }, async () => {
  const before = (await listCustomers(db.pool)).length;
  await assert.rejects(() => createCustomer({ ...COMPANY, document: "48240052000162" }, WHO, db.pool), /CNPJ inválido/);
  await assert.rejects(() => createCustomer({ ...PERSON, document: "11111111111" }, WHO, db.pool), /CPF inválido/);
  await assert.rejects(() => createCustomer({ ...PERSON, document: "48240052000161" }, WHO, db.pool), /CPF inválido/);
  await assert.rejects(() => createCustomer({ ...COMPANY, document: "11222333000181", name: "  " }, WHO, db.pool), /sem nome/);
  await assert.rejects(() => createCustomer({ ...COMPANY, document: "11222333000181" }, " ", db.pool), /quem está gravando/);
  assert.equal((await listCustomers(db.pool)).length, before);
});

test("alterar: grava a ficha e quem alterou; tipo e documento não mudam", { skip }, async () => {
  const current = await findCustomerByDocument("48240052000161", db.pool);
  assert.ok(current);
  const updated = await updateCustomer(
    current.id,
    { ...COMPANY, kind: "PF", document: "52998224725", name: "Academia Teste Ltda", stateRegistration: "123456789110", email: null, uf: "SP", rg: "1" },
    OTHER,
    db.pool,
  );
  assert.deepEqual(updated, {
    ...COMPANY,
    id: current.id,
    name: "Academia Teste Ltda",
    stateRegistration: "123456789110",
    email: null,
    uf: "SP",
  });
  assert.deepEqual(await getCustomer(current.id, db.pool), updated);

  const { rows } = await db.pool.query("SELECT updated_by, updated_at > created_at AS touched FROM customers WHERE id = $1", [current.id]);
  assert.deepEqual(rows[0], { updated_by: OTHER, touched: true });

  await assert.rejects(() => updateCustomer(2_000_000_000, COMPANY, WHO, db.pool), /Cliente não encontrado/);
  await assert.rejects(() => updateCustomer(current.id, { ...COMPANY, name: " " }, WHO, db.pool), /sem nome/);
  assert.deepEqual(await getCustomer(current.id, db.pool), updated);
});

test("a lista vem por nome, com todos", { skip }, async () => {
  const names = (await listCustomers(db.pool)).map((customer) => customer.name);
  assert.deepEqual(names, ["Academia Alfa", "Academia Teste Ltda", "Maria da Silva"]);
});

test("o banco recusa o que não é cliente válido, mesmo sem passar pela camada", { skip }, async () => {
  const insert = (change: Record<string, unknown>) => {
    const row = { kind: "PJ", document: "11222333000181", name: "X", updated_by: WHO, ...change };
    const columns = Object.keys(row);
    return db.pool.query(
      `INSERT INTO customers (${columns.join(", ")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
      Object.values(row),
    );
  };
  // CNPJ com 13 caracteres, CPF em linha de empresa, CNPJ em linha de pessoa.
  await assert.rejects(() => insert({ document: "1122233300018" }), /check/i);
  await assert.rejects(() => insert({ document: "52998224725" }), /check/i);
  await assert.rejects(() => insert({ kind: "PF" }), /check/i);
  await assert.rejects(() => insert({ document: "11.222.333/0001-81" }), /check/i);
  // Inscrição estadual, fantasia ou responsável em pessoa física; RG em empresa.
  for (const change of [{ state_registration: "123456" }, { trade_name: "X" }, { contact_name: "X" }]) {
    await assert.rejects(() => insert({ kind: "PF", document: "11144477735", ...change }), /check/i, JSON.stringify(change));
  }
  await assert.rejects(() => insert({ rg: "123" }), /check/i);
  await assert.rejects(() => insert({ state_registration: "ABC" }), /check/i);
  await assert.rejects(() => insert({ kind: "XX" }), /check/i);
  await assert.rejects(() => insert({ phone: "999" }), /check/i);
  await assert.rejects(() => insert({ cep: "99999-999" }), /check/i);
  await assert.rejects(() => insert({ uf: "XX" }), /check/i);
  await assert.rejects(() => insert({ name: "  " }), /check/i);
  // Documento repetido.
  await assert.rejects(() => insert({ document: "48240052000161" }), /customers_document_key/);
  // E aceita o que está certo.
  await insert({});
  assert.equal((await findCustomerByDocument("11222333000181", db.pool))?.name, "X");
});

test("cliente não se apaga: a camada de banco não tem como, e a migração não apaga em cascata", () => {
  const source = readFileSync(new URL("../src/lib/db/customers.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bDELETE\b|\bTRUNCATE\b/);
  const migration = readFileSync(new URL("../db/migrations/0004_clientes.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /ON DELETE/i);
});

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import { tenantSchema } from "@/lib/db/config";
import { createCustomer, findCustomerByDocument, listCustomers } from "@/lib/db/customers";
import { migrate } from "@/lib/db/migrate";
import { createOrder, getOrder } from "@/lib/db/orders";
import { loadParams, saveParams } from "@/lib/db/params";
import { closeTenantPools, tenantDb } from "@/lib/db/pool";
import { latestVersion, loadPublishedTable, publishPriceTable } from "@/lib/db/price-table";
import { createProduct, listProducts } from "@/lib/db/products";
import { draftPriceTable } from "@/lib/price-table";
import { MIGRATIONS_DIR, SKIP_WITHOUT_DB, testDatabaseUrl } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
// Two companies of this run only: the test file may run next to others.
const suffix = randomBytes(4).toString("hex");
const A = `iso_a_${suffix}`;
const B = `iso_b_${suffix}`;
let previousUrl: string | undefined;

async function admin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

before(async () => {
  if (skip) return;
  // The application reads DATABASE_URL; here it is the test database (the helper refuses any other).
  previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = testDatabaseUrl();
  // What `npm run db:migrate` does for each company.
  await admin(async (client) => {
    for (const slug of [A, B]) {
      await client.query(`CREATE SCHEMA ${tenantSchema(slug)}`);
      await client.query(`SET search_path TO ${tenantSchema(slug)}`);
      await migrate(client, MIGRATIONS_DIR);
    }
  });
});

after(async () => {
  if (skip) return;
  await closeTenantPools();
  await admin(async (client) => {
    for (const slug of [A, B]) await client.query(`DROP SCHEMA IF EXISTS ${tenantSchema(slug)} CASCADE`);
  });
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
});

const company = (document: string, name: string) => ({
  kind: "PJ" as const,
  document,
  name,
  tradeName: null,
  contactName: null,
  stateRegistration: null,
  rg: null,
  phone: null,
  email: null,
  cep: null,
  street: null,
  streetNumber: null,
  complement: null,
  district: null,
  city: null,
  uf: null,
});

test("cada empresa tem o seu banco: o mesmo código, o mesmo CNPJ e o mesmo número de pedido convivem", { skip }, async () => {
  const a = tenantDb(A);
  const b = tenantDb(B);
  assert.notEqual(a, b);
  assert.equal(tenantDb(A), a);

  // Mesmo código de equipamento e mesmo CNPJ nas duas, sem conflito.
  const productA = await createProduct({ name: "Mesa da A", code: "LD-B001", advisoryCost: 8146.64, taxCredit: 0.2811565 }, WHO, a);
  const productB = await createProduct({ name: "Mesa da B", code: "LD-B001", advisoryCost: 5000 }, WHO, b);
  await createCustomer(company("48240052000161", "Cliente da A"), WHO, a);
  await createCustomer(company("48240052000161", "Cliente da B"), WHO, b);
  // Dentro da mesma empresa, continua não podendo repetir.
  await assert.rejects(() => createProduct({ name: "Outra", code: "LD-B001" }, WHO, a), /Já existe produto com o código/);
  await assert.rejects(() => createCustomer(company("48240052000161", "Repetido"), WHO, b), /Já existe cliente com este CNPJ/);

  // Cada uma vê só o que é dela.
  assert.deepEqual((await listProducts({}, a)).map((product) => product.name), ["Mesa da A"]);
  assert.deepEqual((await listProducts({}, b)).map((product) => product.name), ["Mesa da B"]);
  assert.deepEqual((await listCustomers(a)).map((customer) => customer.name), ["Cliente da A"]);
  assert.equal((await findCustomerByDocument("48240052000161", b))?.name, "Cliente da B");

  // Parâmetros e alíquotas por estado são de cada empresa.
  const paramsA = await loadParams(a);
  await saveParams({ ...paramsA, freeDiscount: 0.1, stateRates: { ...paramsA.stateRates, RS: { internalIcms: 0.25, fcp: 0.02 } } }, WHO, a);
  assert.equal((await loadParams(a)).freeDiscount, 0.1);
  assert.equal((await loadParams(b)).freeDiscount, 0.2);
  assert.deepEqual((await loadParams(b)).stateRates.RS, paramsA.stateRates.RS);

  // Versões da tabela: a v1 de cada uma tem o preço de cada uma.
  for (const conn of [a, b]) {
    const draft = draftPriceTable(await loadParams(conn), await listProducts({ active: true }, conn));
    assert.equal((await publishPriceTable(draft, 1, WHO, conn)).version, 1);
  }
  const [tableA, tableB] = [await loadPublishedTable(1, a), await loadPublishedTable(1, b)];
  assert.notEqual(tableA?.items[0].table, tableB?.items[0].table);
  assert.deepEqual([tableA?.freeDiscount, tableB?.freeDiscount], [0.1, 0.2]);
  assert.equal((await latestVersion(a))?.version, 1);

  // O mesmo número de pedido nas duas, cada um com o seu vendedor e o seu equipamento.
  const number = () => "261006-ABCD";
  const seller = (name: string) => ({ seller: { email: "vendedor@teste.local", name }, version: 1, quantity: 1 });
  await createOrder({ ...seller("Vendedor da A"), productId: productA.id }, number, a);
  await createOrder({ ...seller("Vendedor da B"), productId: productB.id }, number, b);
  const all = { sellerEmail: null };
  assert.equal((await getOrder("261006-ABCD", all, a))?.sellerName, "Vendedor da A");
  assert.equal((await getOrder("261006-ABCD", all, b))?.sellerName, "Vendedor da B");
});

test("nada de uma empresa aparece no esquema da outra, nem fora dos dois", { skip }, async () => {
  await admin(async (client) => {
    const count = async (schema: string, table: string) =>
      Number((await client.query(`SELECT count(*) FROM ${schema}.${table}`)).rows[0].count);
    for (const slug of [A, B]) {
      const schema = tenantSchema(slug);
      assert.deepEqual(
        [await count(schema, "products"), await count(schema, "customers"), await count(schema, "orders"), await count(schema, "price_table_versions")],
        [1, 1, 1, 1],
        schema,
      );
    }
    // As conexões de uma empresa não enxergam o esquema da outra pelo nome simples.
    const visible = await tenantDb(A).query("SELECT current_schema() AS schema, (SELECT count(*)::int FROM products) AS products");
    assert.deepEqual(visible.rows[0], { schema: tenantSchema(A), products: 1 });
  });
});

test("empresa sem esquema migrado dá erro, não cai no banco de outra", { skip }, async () => {
  const ghost = tenantDb(`ghost_${suffix}`);
  await assert.rejects(() => listProducts({}, ghost), (error: unknown) => (error as { code?: string }).code === "42P01");
  assert.throws(() => tenantDb("Ludus; DROP SCHEMA public"), /Identificador de empresa inválido/);
});

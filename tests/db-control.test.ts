import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import type pg from "pg";
import { CompanyError, createCompany, findCompany, openCompaniesOf, provisionCompany, provisionedCompanies, syncMember } from "@/lib/db/control";
import { tenantSchema } from "@/lib/db/config";
import { migrate } from "@/lib/db/migrate";
import { signedUpMemberships, signupEnabled } from "@/lib/auth/signed-up";
import { MIGRATIONS_DIR, openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

/**
 * The register of signed-up companies and the creation of a company's schema,
 * against PostgreSQL. The register lives in a schema of the test's own; the
 * companies it provisions get real `tenant_<slug>` schemas, with random names,
 * dropped at the end.
 */
const CONTROL_DIR = fileURLToPath(new URL("../db/control/", import.meta.url));
const skip = SKIP_WITHOUT_DB;
let db: TestDb;
const created: string[] = [];
const slugOf = (label: string) => {
  const slug = `qa_${label}_${Math.random().toString(36).slice(2, 10)}`;
  created.push(slug);
  return slug;
};

before(async () => {
  if (skip) return;
  db = await openTestDb("control", { migrated: false });
  await withClient((client) => migrate(client, CONTROL_DIR));
});
after(async () => {
  if (skip) return;
  for (const slug of created) await db.pool.query(`DROP SCHEMA IF EXISTS ${tenantSchema(slug)} CASCADE`);
  await db.close();
});

async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    return await fn(client);
  } finally {
    await client.query(`SET search_path TO ${db.schema}`);
    client.release();
  }
}
const company = (slug: string, email = `dona-${slug}@example.test`) => ({ slug, name: `Empresa ${slug}`, ownerEmail: email, ownerName: "Pessoa Dona", monthlyCents: 35000 });

test("empresa cadastrada nasce fechada, e o identificador de uma empresa da configuração não pode ser tomado", { skip }, async () => {
  const slug = slugOf("nova");
  const nova = await createCompany(company(slug, "  Dona@Example.TEST "), ["ludus"], db.pool);
  assert.deepEqual(
    { status: nova.status, email: nova.ownerEmail, mensal: nova.monthlyCents, esquema: nova.provisionedAt },
    { status: "AGUARDANDO_CARTAO", email: "dona@example.test", mensal: 35000, esquema: null },
  );
  await assert.rejects(createCompany(company("ludus"), ["ludus"], db.pool), CompanyError);
  await assert.rejects(createCompany(company(slug), [], db.pool), /já está em uso/);
  await assert.rejects(createCompany(company("Com Espaço"), [], db.pool), CompanyError);
  await assert.rejects(createCompany({ ...company(slugOf("x")), ownerEmail: "sem-arroba" }, [], db.pool), /e-mail válido/);
  assert.deepEqual(await openCompaniesOf("dona@example.test", db.pool), [], "fechada e sem esquema: ninguém entra");
});

test("provisionar cria o esquema com todas as migrações e a dona como diretora; rodar de novo não muda nada", { skip }, async () => {
  const slug = slugOf("prov");
  await createCompany(company(slug), [], db.pool);
  const pronta = await withClient((client) => provisionCompany(slug, client, MIGRATIONS_DIR, db.schema));
  assert.ok(pronta.provisionedAt);

  const schema = tenantSchema(slug);
  const { rows: usuarios } = await db.pool.query(`SELECT email, role, active FROM ${schema}.users`);
  assert.deepEqual(usuarios, [{ email: `dona-${slug}@example.test`, role: "DIRETORIA", active: true }]);
  const { rows: migracoes } = await db.pool.query(`SELECT count(*)::int AS n FROM ${schema}.schema_migrations`);
  assert.ok(migracoes[0].n >= 33, `${migracoes[0].n} migrações aplicadas`);

  const denovo = await withClient((client) => provisionCompany(slug, client, MIGRATIONS_DIR, db.schema));
  assert.equal(denovo.provisionedAt?.getTime(), pronta.provisionedAt?.getTime());
  assert.equal((await db.pool.query(`SELECT count(*)::int AS n FROM ${schema}.users`)).rows[0].n, 1);
  assert.deepEqual((await provisionedCompanies(db.pool)).filter((t) => t.slug === slug), [{ slug, name: `Empresa ${slug}` }]);
  await assert.rejects(withClient((client) => provisionCompany("nao_existe", client, MIGRATIONS_DIR, db.schema)), CompanyError);
});

test("só entra quem é da empresa, e só com a empresa em teste ou em dia", { skip }, async () => {
  const slug = slugOf("acesso");
  const dona = `dona-${slug}@example.test`;
  await createCompany(company(slug), [], db.pool);
  await withClient((client) => provisionCompany(slug, client, MIGRATIONS_DIR, db.schema));

  assert.deepEqual(await openCompaniesOf(dona, db.pool), [], "provisionada mas ainda aguardando o cartão");
  for (const [status, entra] of [["EM_TESTE", true], ["ATIVA", true], ["INADIMPLENTE", false], ["CANCELADA", false]] as const) {
    await db.pool.query("UPDATE companies SET status = $1 WHERE slug = $2", [status, slug]);
    assert.equal((await openCompaniesOf(dona.toUpperCase(), db.pool)).length, entra ? 1 : 0, status);
  }
  await db.pool.query("UPDATE companies SET status = 'ATIVA' WHERE slug = $1", [slug]);
  assert.deepEqual(await openCompaniesOf("outra-pessoa@example.test", db.pool), []);

  await syncMember(slug, "Vendedor@Example.test", true, db.pool);
  await syncMember(slug, "vendedor@example.test", true, db.pool);
  assert.equal((await openCompaniesOf("vendedor@example.test", db.pool)).length, 1);
  await syncMember(slug, "vendedor@example.test", false, db.pool);
  assert.deepEqual(await openCompaniesOf("vendedor@example.test", db.pool), []);
  await syncMember("empresa_da_configuracao", "alguem@example.test", true, db.pool);
  assert.deepEqual(await openCompaniesOf("alguem@example.test", db.pool), [], "empresa fora do cadastro não ganha índice");
  assert.equal((await findCompany(slug, db.pool))?.status, "ATIVA");
});

test("com o cadastro desligado o login não consulta nada", async () => {
  assert.equal(signupEnabled({}), false);
  assert.equal(signupEnabled({ ERP_CADASTRO_ABERTO: "0" }), false);
  assert.equal(signupEnabled({ ERP_CADASTRO_ABERTO: " 1 " }), true);
  // Sem DATABASE_URL: se consultasse o banco, falharia. Desligado, devolve vazio sem tocar em nada.
  assert.deepEqual(await signedUpMemberships({}, "qualquer@example.test", []), []);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { startupProblems } from "@/instrumentation-node";
import { assertDatabaseConfig, databaseUrl } from "@/lib/db/config";
import { SECRET } from "./helpers.ts";
import { testDatabaseUrl } from "./db-helpers.ts";

const URL_OK = "postgresql://erp:senha-ficticia@127.0.0.1:5432/erp";

test("DATABASE_URL válida é aceita nos dois prefixos", () => {
  assert.equal(databaseUrl({ DATABASE_URL: URL_OK }), URL_OK);
  assert.equal(databaseUrl({ DATABASE_URL: ` ${URL_OK.replace("postgresql", "postgres")} ` }).startsWith("postgres://"), true);
});

test("em produção, DATABASE_URL ausente, vazia ou que não é de PostgreSQL derruba a inicialização", () => {
  const production = { NODE_ENV: "production" };
  assert.throws(() => assertDatabaseConfig({ ...production }), /DATABASE_URL ausente/);
  assert.throws(() => assertDatabaseConfig({ ...production, DATABASE_URL: "   " }), /DATABASE_URL ausente/);
  for (const bad of ["http://127.0.0.1:5432/erp", "erp", "postgresql://"]) {
    assert.throws(() => assertDatabaseConfig({ ...production, DATABASE_URL: bad }), /DATABASE_URL inválida/, bad);
  }
  assert.doesNotThrow(() => assertDatabaseConfig({ ...production, DATABASE_URL: URL_OK }));
});

test("fora de produção a ausência de DATABASE_URL não derruba o processo", () => {
  for (const NODE_ENV of ["development", "test", undefined]) {
    assert.doesNotThrow(() => assertDatabaseConfig({ NODE_ENV }));
  }
});

test("o erro nunca repete o valor da variável (ela carrega senha)", () => {
  const withPassword = "mysql://erp:senha-secreta@127.0.0.1/erp";
  assert.throws(
    () => databaseUrl({ DATABASE_URL: withPassword }),
    (error: Error) => !error.message.includes("senha-secreta"),
  );
});

test("a inicialização em produção junta os problemas de login e de banco", () => {
  const auth = {
    NODE_ENV: "production",
    SSO_JWT_SECRET: SECRET,
    APP_URL: "https://erp.teste.local",
    ERP_USERS: "dir@teste.local:DIRETORIA",
  };
  assert.deepEqual(startupProblems({ ...auth, DATABASE_URL: URL_OK }), []);
  assert.deepEqual(startupProblems({ ...auth }), ["DATABASE_URL ausente"]);

  const both = startupProblems({ NODE_ENV: "production", DATABASE_URL: "http://x" });
  assert.equal(both.length, 2);
  assert.match(both[0], /SSO_JWT_SECRET ausente/);
  assert.match(both[1], /DATABASE_URL inválida/);

  assert.deepEqual(startupProblems({ NODE_ENV: "development" }), []);
});

test("testes de banco recusam banco cujo nome não termina em _test", () => {
  for (const name of ["erp", "gapp", "app_avila", "agentes", "erp_test_copia", ""]) {
    assert.throws(() => testDatabaseUrl(`postgresql://erp:x@127.0.0.1:5432/${name}`), /terminado em _test/, name);
  }
  const ok = "postgresql://erp:x@127.0.0.1:5432/erp_test";
  assert.equal(testDatabaseUrl(ok), ok);
});

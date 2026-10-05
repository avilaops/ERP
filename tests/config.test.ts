import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { assertAuthConfig, EXAMPLE_SSO_SECRET, isProduction, MIN_SSO_SECRET_LENGTH } from "@/lib/auth/config";
import { SECRET } from "./helpers.ts";

const VALID = {
  NODE_ENV: "production",
  SSO_JWT_SECRET: SECRET,
  APP_URL: "https://erp.teste.local/",
  ERP_USERS: "dir@teste.local:DIRETORIA",
};

test("configuração completa é aceita e normalizada", () => {
  const config = assertAuthConfig(VALID);
  assert.equal(config.ssoSecret, SECRET);
  assert.equal(config.appUrl, "https://erp.teste.local");
  assert.deepEqual(config.users.map((user) => user.role), ["DIRETORIA"]);
});

for (const name of ["SSO_JWT_SECRET", "APP_URL", "ERP_USERS"] as const) {
  test(`${name} ausente derruba a inicialização citando a variável`, () => {
    assert.throws(() => assertAuthConfig({ ...VALID, [name]: undefined }), new RegExp(`${name} ausente`));
    assert.throws(() => assertAuthConfig({ ...VALID, [name]: "   " }), new RegExp(`${name} ausente`));
  });
}

test("APP_URL inválida é recusada", () => {
  assert.throws(() => assertAuthConfig({ ...VALID, APP_URL: "erp.teste.local" }), /APP_URL inválida/);
  assert.throws(() => assertAuthConfig({ ...VALID, APP_URL: "ftp://erp.teste.local" }), /APP_URL inválida/);
});

test("em produção, SSO_JWT_SECRET com menos de 32 caracteres é recusado", () => {
  assert.equal(MIN_SSO_SECRET_LENGTH, 32);
  assert.throws(() => assertAuthConfig({ ...VALID, SSO_JWT_SECRET: "a".repeat(31) }), /SSO_JWT_SECRET curto/);
  assert.throws(() => assertAuthConfig({ ...VALID, SSO_JWT_SECRET: ` ${"a".repeat(31)} ` }), /SSO_JWT_SECRET curto/);
  assert.equal(assertAuthConfig({ ...VALID, SSO_JWT_SECRET: "a".repeat(32) }).ssoSecret, "a".repeat(32));
});

test("em produção, o SSO_JWT_SECRET do .env.example é recusado", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const shipped = /^SSO_JWT_SECRET=(.*)$/m.exec(example)?.[1].trim();
  assert.equal(shipped, EXAMPLE_SSO_SECRET, "o valor recusado tem que ser o que está no .env.example");
  assert.throws(
    () => assertAuthConfig({ ...VALID, SSO_JWT_SECRET: EXAMPLE_SSO_SECRET }),
    /SSO_JWT_SECRET é o valor de exemplo/,
  );
});

test("em produção, APP_URL em http é recusada", () => {
  assert.throws(() => assertAuthConfig({ ...VALID, APP_URL: "http://erp.teste.local" }), /APP_URL sem https/);
  assert.throws(() => assertAuthConfig({ ...VALID, APP_URL: "http://localhost:3020" }), /APP_URL sem https/);
});

test("NODE_ENV ausente ou desconhecido recebe as mesmas exigências de produção", () => {
  for (const NODE_ENV of [undefined, "staging"]) {
    assert.throws(() => assertAuthConfig({ ...VALID, NODE_ENV, SSO_JWT_SECRET: "curto" }), /SSO_JWT_SECRET curto/);
    assert.throws(() => assertAuthConfig({ ...VALID, NODE_ENV, APP_URL: "http://erp.teste.local" }), /APP_URL sem https/);
  }
});

test("fora de produção, segredo curto e APP_URL em http continuam aceitos", () => {
  const config = assertAuthConfig({
    ...VALID,
    NODE_ENV: "development",
    SSO_JWT_SECRET: EXAMPLE_SSO_SECRET,
    APP_URL: "http://localhost:3020",
  });
  assert.equal(config.appUrl, "http://localhost:3020");
});

test("ERP_USERS inválida é recusada", () => {
  assert.throws(() => assertAuthConfig({ ...VALID, ERP_USERS: "dir@teste.local:CHEFE" }), /perfil desconhecido/);
  assert.throws(() => assertAuthConfig({ ...VALID, ERP_USERS: "dir@teste.local" }), /entrada inválida/);
  assert.throws(() => assertAuthConfig({ ...VALID, ERP_USERS: " , " }), /ERP_USERS sem nenhum usuário/);
});

test("o erro lista todas as variáveis com problema de uma vez", () => {
  assert.throws(
    () => assertAuthConfig({}),
    /SSO_JWT_SECRET ausente; APP_URL ausente; ERP_USERS ausente/,
  );
});

test("só development e test escapam das regras de produção", () => {
  assert.equal(isProduction({ NODE_ENV: "development" }), false);
  assert.equal(isProduction({ NODE_ENV: "test" }), false);
  assert.equal(isProduction({ NODE_ENV: "production" }), true);
  assert.equal(isProduction({ NODE_ENV: "staging" }), true);
  assert.equal(isProduction({}), true);
});

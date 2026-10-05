import assert from "node:assert/strict";
import { test } from "node:test";
import { assertAuthConfig, isProduction } from "@/lib/auth/config";

const VALID = {
  SSO_JWT_SECRET: "segredo-de-teste",
  APP_URL: "https://erp.teste.local/",
  ERP_USERS: "dir@teste.local:DIRETORIA",
};

test("configuração completa é aceita e normalizada", () => {
  const config = assertAuthConfig(VALID);
  assert.equal(config.ssoSecret, "segredo-de-teste");
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

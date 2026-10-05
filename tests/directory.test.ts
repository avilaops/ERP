import assert from "node:assert/strict";
import { test } from "node:test";
import { createEnvDirectory, parseErpUsers } from "@/lib/auth/directory";

const RAW = "dir@teste.local:DIRETORIA, Gerente@Teste.Local : GERENTE_COMERCIAL,ven@teste.local:VENDEDOR,fin@teste.local:FINANCEIRO";

test("lê os quatro perfis de ERP_USERS", () => {
  assert.deepEqual(
    parseErpUsers(RAW).map((user) => [user.email, user.role]),
    [
      ["dir@teste.local", "DIRETORIA"],
      ["gerente@teste.local", "GERENTE_COMERCIAL"],
      ["ven@teste.local", "VENDEDOR"],
      ["fin@teste.local", "FINANCEIRO"],
    ],
  );
});

test("e-mail é comparado sem diferença de maiúsculas e espaços", async () => {
  const directory = createEnvDirectory(RAW);
  assert.equal((await directory.findByEmail("  DIR@Teste.Local "))?.role, "DIRETORIA");
  assert.deepEqual(await directory.findByEmail("gerente@teste.local"), {
    email: "gerente@teste.local",
    name: "gerente@teste.local",
    role: "GERENTE_COMERCIAL",
  });
});

test("e-mail fora da lista devolve null", async () => {
  const directory = createEnvDirectory(RAW);
  assert.equal(await directory.findByEmail("intruso@teste.local"), null);
  assert.equal(await directory.findByEmail(""), null);
});

test("perfil desconhecido gera erro na leitura", () => {
  assert.throws(() => parseErpUsers("dir@teste.local:ADMIN"), /perfil desconhecido "ADMIN"/);
  assert.throws(() => parseErpUsers("dir@teste.local:diretoria"), /perfil desconhecido/);
  assert.throws(() => createEnvDirectory("ok@teste.local:VENDEDOR,x@teste.local:CHEFE"), /CHEFE/);
});

test("entrada malformada gera erro na leitura", () => {
  assert.throws(() => parseErpUsers("dir@teste.local"), /entrada inválida/);
  assert.throws(() => parseErpUsers("DIRETORIA"), /entrada inválida/);
  assert.throws(() => parseErpUsers(":DIRETORIA"), /entrada inválida/);
  assert.throws(() => parseErpUsers("sem-arroba:DIRETORIA"), /entrada inválida/);
  assert.throws(() => parseErpUsers("dir@teste.local:"), /perfil desconhecido/);
  assert.throws(() => parseErpUsers("a@teste.local:VENDEDOR;b@teste.local:VENDEDOR"), /ERP_USERS/);
});

test("e-mail repetido gera erro (não vale o último em silêncio)", () => {
  assert.throws(
    () => parseErpUsers("dir@teste.local:DIRETORIA,DIR@teste.local:VENDEDOR"),
    /e-mail repetido/,
  );
});

test("lista vazia ou ausente é um diretório vazio", async () => {
  assert.deepEqual(parseErpUsers(undefined), []);
  assert.deepEqual(parseErpUsers(" "), []);
  assert.equal(await createEnvDirectory(undefined).findByEmail("dir@teste.local"), null);
});

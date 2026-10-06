import assert from "node:assert/strict";
import { test } from "node:test";
import { createEnvDirectory, parseErpUsers } from "@/lib/auth/directory";
import { LUDUS } from "./helpers.ts";

const ONE = [LUDUS];
const OTHER = { slug: "acme", name: "Acme Fitness" };
const TWO = [LUDUS, OTHER];

const RAW = "dir@teste.local:DIRETORIA, Gerente@Teste.Local : GERENTE_COMERCIAL,ven@teste.local:VENDEDOR,fin@teste.local:FINANCEIRO";

test("lê os quatro perfis de ERP_USERS", () => {
  assert.deepEqual(
    parseErpUsers(RAW, ONE).map((user) => [user.email, user.role]),
    [
      ["dir@teste.local", "DIRETORIA"],
      ["gerente@teste.local", "GERENTE_COMERCIAL"],
      ["ven@teste.local", "VENDEDOR"],
      ["fin@teste.local", "FINANCEIRO"],
    ],
  );
});

test("e-mail é comparado sem diferença de maiúsculas e espaços", async () => {
  const directory = createEnvDirectory(RAW, ONE);
  assert.equal((await directory.findMemberships("  DIR@Teste.Local "))[0]?.role, "DIRETORIA");
  assert.deepEqual(await directory.findMemberships("gerente@teste.local"), [
    { email: "gerente@teste.local", name: "gerente@teste.local", role: "GERENTE_COMERCIAL", tenant: LUDUS },
  ]);
});

test("e-mail fora da lista não pertence a empresa nenhuma", async () => {
  const directory = createEnvDirectory(RAW, ONE);
  assert.deepEqual(await directory.findMemberships("intruso@teste.local"), []);
  assert.deepEqual(await directory.findMemberships(""), []);
});

test("perfil desconhecido gera erro na leitura", () => {
  assert.throws(() => parseErpUsers("dir@teste.local:ADMIN", ONE), /perfil desconhecido "ADMIN"/);
  assert.throws(() => parseErpUsers("dir@teste.local:diretoria", ONE), /perfil desconhecido/);
  assert.throws(() => createEnvDirectory("ok@teste.local:VENDEDOR,x@teste.local:CHEFE", ONE), /CHEFE/);
});

test("entrada malformada gera erro na leitura", () => {
  assert.throws(() => parseErpUsers("dir@teste.local", ONE), /entrada inválida/);
  assert.throws(() => parseErpUsers("DIRETORIA", ONE), /entrada inválida/);
  assert.throws(() => parseErpUsers(":DIRETORIA", ONE), /entrada inválida/);
  assert.throws(() => parseErpUsers("sem-arroba:DIRETORIA", ONE), /entrada inválida/);
  assert.throws(() => parseErpUsers("dir@teste.local:", ONE), /perfil desconhecido/);
  assert.throws(() => parseErpUsers("a@teste.local:VENDEDOR;b@teste.local:VENDEDOR", ONE), /ERP_USERS/);
});

test("e-mail repetido gera erro (não vale o último em silêncio)", () => {
  assert.throws(
    () => parseErpUsers("dir@teste.local:DIRETORIA,DIR@teste.local:VENDEDOR", ONE),
    /e-mail repetido/,
  );
});

test("lista vazia ou ausente é um diretório vazio", async () => {
  assert.deepEqual(parseErpUsers(undefined, ONE), []);
  assert.deepEqual(parseErpUsers(" ", ONE), []);
  assert.deepEqual(await createEnvDirectory(undefined, ONE).findMemberships("dir@teste.local"), []);
});

test("várias empresas: cada entrada diz a empresa, e o mesmo e-mail pode estar em mais de uma", async () => {
  const raw = "dir@teste.local:DIRETORIA@ludus,dir@teste.local:VENDEDOR@acme,ven@teste.local:VENDEDOR@acme";
  assert.deepEqual(
    parseErpUsers(raw, TWO).map((user) => [user.email, user.role, user.tenant.slug]),
    [
      ["dir@teste.local", "DIRETORIA", "ludus"],
      ["dir@teste.local", "VENDEDOR", "acme"],
      ["ven@teste.local", "VENDEDOR", "acme"],
    ],
  );
  const directory = createEnvDirectory(raw, TWO);
  assert.deepEqual((await directory.findMemberships("DIR@teste.local")).map((user) => [user.role, user.tenant.name]), [
    ["DIRETORIA", "Ludus Equipamentos"],
    ["VENDEDOR", "Acme Fitness"],
  ]);
  assert.deepEqual((await directory.findMemberships("ven@teste.local")).map((user) => user.tenant.slug), ["acme"]);
});

test("várias empresas: entrada sem empresa, com empresa desconhecida ou repetida na mesma empresa é erro", () => {
  assert.throws(() => parseErpUsers("dir@teste.local:DIRETORIA", TWO), /falta a empresa de dir@teste.local/);
  assert.throws(() => parseErpUsers("dir@teste.local:DIRETORIA@outra", TWO), /empresa desconhecida "outra"/);
  assert.throws(() => parseErpUsers("dir@teste.local:DIRETORIA@ludus@acme", TWO), /entrada inválida/);
  assert.throws(
    () => parseErpUsers("dir@teste.local:DIRETORIA@ludus,dir@teste.local:VENDEDOR@ludus", TWO),
    /e-mail repetido dir@teste.local em ludus/,
  );
  // Com uma empresa só, a empresa pode ficar de fora, mas também pode vir escrita.
  assert.equal(parseErpUsers("dir@teste.local:DIRETORIA@ludus", ONE)[0].tenant.slug, "ludus");
  // Sem empresa configurada ninguém entra.
  assert.throws(() => parseErpUsers("dir@teste.local:DIRETORIA", []), /falta a empresa/);
});

test("diretório combinado: ERP_USERS vem primeiro; o resto é o cadastro de cada empresa", async () => {
  const { createCombinedDirectory } = await import("@/lib/auth/directory");
  const tenants = [
    { slug: "ludus", name: "Ludus" },
    { slug: "outra", name: "Outra" },
    { slug: "fora", name: "Fora do ar" },
  ];
  const configured = createEnvDirectory("suporte@avila.test:DIRETORIA@ludus", tenants);
  const registered: Record<string, Record<string, { name: string; role: "VENDEDOR" | "FINANCEIRO" }>> = {
    ludus: { "ana@ludus.test": { name: "Ana", role: "VENDEDOR" }, "suporte@avila.test": { name: "Rebaixado", role: "VENDEDOR" } },
    outra: { "ana@ludus.test": { name: "Ana", role: "FINANCEIRO" } },
  };
  const failures: string[] = [];
  const directory = createCombinedDirectory(
    configured,
    tenants,
    async (tenant, email) => {
      if (tenant.slug === "fora") throw new Error("banco fora do ar");
      return registered[tenant.slug]?.[email] ?? null;
    },
    (tenant) => failures.push(tenant.slug),
  );

  // Cadastrada em duas empresas, com um perfil em cada; a que não respondeu não deixa entrar.
  assert.deepEqual(
    (await directory.findMemberships(" ANA@ludus.test ")).map((user) => [user.tenant.slug, user.role, user.name]),
    [["ludus", "VENDEDOR", "Ana"], ["outra", "FINANCEIRO", "Ana"]],
  );
  assert.deepEqual(failures, ["fora"]);
  // O acesso de quem dá suporte não é rebaixado pelo cadastro da empresa.
  assert.deepEqual((await directory.findMemberships("suporte@avila.test")).map((user) => [user.tenant.slug, user.role]), [["ludus", "DIRETORIA"]]);
  assert.deepEqual(await directory.findMemberships("ninguem@x.test"), []);
});

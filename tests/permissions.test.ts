import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { allows, canAccess, MENU_ITEMS, menuFor, menuOf, narrowedItems, seesAllOrders, seesCosts } from "@/lib/auth/permissions";
import type { MenuItemKey } from "@/lib/auth/permissions";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";

// Columns: Diretoria, Gerente comercial, Vendedor, Financeiro.
const MATRIX: [MenuItemKey, string, string, [boolean, boolean, boolean, boolean]][] = [
  ["dashboard", "Dashboard", "/dashboard", [true, true, true, false]],
  ["precos-metas", "Preços e metas", "/precos-metas", [true, true, false, false]],
  ["aprovacoes", "Aprovações", "/aprovacoes", [true, true, false, false]],
  ["funil", "Funil", "/funil", [true, true, true, false]],
  ["pedidos", "Pedidos", "/pedidos", [true, true, true, false]],
  ["clientes", "Clientes", "/clientes", [true, true, true, false]],
  ["recebimentos", "Recebimentos", "/recebimentos", [true, false, false, true]],
  ["contas-pagar", "Contas a pagar", "/contas-pagar", [true, false, false, true]],
  ["fornecedores", "Fornecedores", "/fornecedores", [true, false, false, true]],
  ["comissoes", "Comissões", "/comissoes", [true, false, true, true]],
  ["tabela-precos", "Tabela de preços", "/tabela-precos", [true, true, true, false]],
  ["produtos", "Produtos e custos", "/produtos", [true, false, false, false]],
  ["parametros", "Parâmetros", "/parametros", [true, false, false, false]],
  ["simulador", "Simulador", "/simulador", [true, true, true, false]],
  ["equipe", "Equipe e acessos", "/equipe", [true, false, false, false]],
];

const COLUMNS: Role[] = ["DIRETORIA", "GERENTE_COMERCIAL", "VENDEDOR", "FINANCEIRO"];

test("os perfis são exatamente os quatro, com os rótulos de tela", () => {
  assert.deepEqual([...ROLES], COLUMNS);
  assert.deepEqual(ROLE_LABELS, {
    DIRETORIA: "Diretoria",
    GERENTE_COMERCIAL: "Gerente comercial",
    VENDEDOR: "Vendedor",
    FINANCEIRO: "Financeiro",
  });
});

test("o menu tem os 15 itens, os do manual mais o funil, na ordem do manual", () => {
  assert.equal(MENU_ITEMS.length, 15);
  assert.deepEqual(
    MENU_ITEMS.map((item) => [item.key, item.label, item.href]),
    MATRIX.map(([key, label, href]) => [key, label, href]),
  );

  // Same labels, same order as the table in the manual page itself.
  const manual = readFileSync(new URL("../docs/manual/paginas/03-navegacao.md", import.meta.url), "utf8");
  const section = manual.slice(manual.indexOf("| Item |"), manual.indexOf("## Botão Novo pedido"));
  const labels = [...section.matchAll(/^\| ([^|]+) \|/gm)]
    .map((match) => match[1].trim())
    .filter((label) => label !== "Item" && label !== "---");
  assert.deepEqual(MENU_ITEMS.map((item) => item.label), labels);
});

test("matriz de permissão: 15 itens × 4 perfis", () => {
  let checked = 0;
  for (const [key, , , row] of MATRIX) {
    COLUMNS.forEach((role, column) => {
      assert.equal(canAccess(role, key), row[column], `${role} em ${key}`);
      checked += 1;
    });
  }
  assert.equal(checked, 60);
});

test("menuFor devolve só os itens do perfil, na ordem do manual", () => {
  COLUMNS.forEach((role, column) => {
    const expected = MATRIX.filter(([, , , row]) => row[column]).map(([key]) => key);
    assert.deepEqual(menuFor(role).map((item) => item.key), expected, role);
    assert.ok(expected.length > 0, `${role} tem ao menos um item`);
  });

  assert.deepEqual(menuFor("FINANCEIRO").map((item) => item.label), [
    "Recebimentos",
    "Contas a pagar",
    "Fornecedores",
    "Comissões",
  ]);
  assert.deepEqual(menuFor("VENDEDOR").map((item) => item.href), [
    "/dashboard",
    "/funil",
    "/pedidos",
    "/clientes",
    "/comissoes",
    "/tabela-precos",
    "/simulador",
  ]);
});

test("custo, desconto máximo e lucro: só a Diretoria vê", () => {
  assert.deepEqual(
    COLUMNS.map((role) => [role, seesCosts(role)]),
    [
      ["DIRETORIA", true],
      ["GERENTE_COMERCIAL", false],
      ["VENDEDOR", false],
      ["FINANCEIRO", false],
    ],
  );
});

test("pedidos da equipe inteira: Diretoria e gerente; o vendedor vê só os dele", () => {
  assert.deepEqual(
    COLUMNS.map((role) => [role, seesAllOrders(role)]),
    [
      ["DIRETORIA", true],
      ["GERENTE_COMERCIAL", true],
      ["VENDEDOR", false],
      ["FINANCEIRO", false],
    ],
  );
});

test("telas por pessoa: a lista só tira telas do perfil, nunca dá uma que ele não tem", () => {
  const seller = { role: "VENDEDOR", items: ["pedidos", "clientes", "produtos", "parametros"] } as const;
  assert.deepEqual(menuOf(seller).map((item) => item.key), ["pedidos", "clientes"]);
  assert.equal(allows(seller, "pedidos"), true);
  // Estava no perfil, mas foi tirada desta pessoa.
  assert.equal(allows(seller, "comissoes"), false);
  // Está na lista, mas o perfil não tem: continua fechada.
  assert.equal(allows(seller, "produtos"), false);
  assert.equal(allows(seller, "parametros"), false);
  // Sem lista, valem todas as telas do perfil.
  for (const items of [null, undefined]) assert.equal(menuOf({ role: "VENDEDOR", items }).length, 7);
});

test("telas por pessoa: o que se guarda é só o que foi tirado do perfil", () => {
  const all = ["dashboard", "funil", "pedidos", "clientes", "comissoes", "tabela-precos", "simulador"];
  assert.equal(narrowedItems("VENDEDOR", all), null);
  assert.equal(narrowedItems("VENDEDOR", [...all, "parametros"]), null);
  // Na ordem do menu, sem o que o perfil não tem.
  assert.deepEqual(narrowedItems("VENDEDOR", ["simulador", "parametros", "pedidos"]), ["pedidos", "simulador"]);
  assert.deepEqual(narrowedItems("VENDEDOR", []), []);
});

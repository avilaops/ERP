import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canAccess, MENU_ITEMS, menuFor } from "@/lib/auth/permissions";
import type { MenuItemKey } from "@/lib/auth/permissions";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";

// Columns: Diretoria, Gerente comercial, Vendedor, Financeiro.
const MATRIX: [MenuItemKey, string, string, [boolean, boolean, boolean, boolean]][] = [
  ["dashboard", "Dashboard", "/dashboard", [true, true, false, false]],
  ["precos-metas", "Preços e metas", "/precos-metas", [true, true, false, false]],
  ["aprovacoes", "Aprovações", "/aprovacoes", [true, true, false, false]],
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

test("o menu tem os 14 itens do manual, na ordem do manual", () => {
  assert.equal(MENU_ITEMS.length, 14);
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

test("matriz de permissão: 14 itens × 4 perfis", () => {
  let checked = 0;
  for (const [key, , , row] of MATRIX) {
    COLUMNS.forEach((role, column) => {
      assert.equal(canAccess(role, key), row[column], `${role} em ${key}`);
      checked += 1;
    });
  }
  assert.equal(checked, 56);
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
    "/pedidos",
    "/clientes",
    "/comissoes",
    "/tabela-precos",
    "/simulador",
  ]);
});

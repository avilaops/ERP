import assert from "node:assert/strict";
import { test } from "node:test";
import { MENU_ITEMS, menuFor } from "@/lib/auth/permissions";
import { navigationGroups } from "@/lib/navigation";

test("menu: organiza todos os destinos uma vez, na ordem de trabalho", () => {
  const groups = navigationGroups(MENU_ITEMS);
  assert.deepEqual(groups.map(({ title }) => title), ["Visão geral", "Vendas", "Preços e propostas", "Financeiro", "Fiscal", "Produtos e operação", "Administração"]);
  assert.deepEqual(groups[1].items.map(({ href }) => href), ["/pedidos", "/funil", "/clientes", "/aprovacoes"]);
  assert.equal(groups[0].items[0].label, "Painel");
  assert.equal(groups[4].items[0].label, "Fiscal");
  assert.equal(groups[6].items[1].label, "Configurações");
  const links = groups.flatMap(({ items }) => items.map(({ href }) => href));
  assert.equal(new Set(links).size, MENU_ITEMS.length);
  assert.deepEqual([...links].sort(), MENU_ITEMS.map(({ href }) => href).sort());
});

test("menu: preserva o alcance de cada perfil e omite grupos vazios", () => {
  for (const role of ["DIRETORIA", "GERENTE_COMERCIAL", "VENDEDOR", "FINANCEIRO"] as const) {
    const allowed = menuFor(role);
    const groups = navigationGroups(allowed);
    assert.ok(groups.every(({ items }) => items.length > 0));
    assert.deepEqual(groups.flatMap(({ items }) => items.map(({ href }) => href)).sort(), allowed.map(({ href }) => href).sort());
  }
  assert.deepEqual(navigationGroups([]), []);
  assert.deepEqual(navigationGroups(MENU_ITEMS.filter(({ key }) => key === "pedidos")).map(({ title }) => title), ["Vendas"]);
});

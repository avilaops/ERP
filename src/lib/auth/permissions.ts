import type { Role } from "@/lib/auth/roles";

/**
 * Single source of truth for "which profile reaches which menu item".
 *
 * Order follows the sidebar in docs/manual/paginas/03-navegacao.md. Where the
 * manual does not say a profile sees an item, the profile does not get it.
 */
const MENU = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", roles: ["DIRETORIA", "GERENTE_COMERCIAL"] },
  { key: "precos-metas", label: "Preços e metas", href: "/precos-metas", roles: ["DIRETORIA", "GERENTE_COMERCIAL"] },
  { key: "aprovacoes", label: "Aprovações", href: "/aprovacoes", roles: ["DIRETORIA", "GERENTE_COMERCIAL"] },
  { key: "pedidos", label: "Pedidos", href: "/pedidos", roles: ["DIRETORIA", "GERENTE_COMERCIAL", "VENDEDOR"] },
  { key: "clientes", label: "Clientes", href: "/clientes", roles: ["DIRETORIA", "GERENTE_COMERCIAL", "VENDEDOR"] },
  { key: "recebimentos", label: "Recebimentos", href: "/recebimentos", roles: ["DIRETORIA", "FINANCEIRO"] },
  { key: "contas-pagar", label: "Contas a pagar", href: "/contas-pagar", roles: ["DIRETORIA", "FINANCEIRO"] },
  { key: "fornecedores", label: "Fornecedores", href: "/fornecedores", roles: ["DIRETORIA", "FINANCEIRO"] },
  { key: "comissoes", label: "Comissões", href: "/comissoes", roles: ["DIRETORIA", "VENDEDOR", "FINANCEIRO"] },
  { key: "tabela-precos", label: "Tabela de preços", href: "/tabela-precos", roles: ["DIRETORIA", "GERENTE_COMERCIAL", "VENDEDOR"] },
  { key: "produtos", label: "Produtos e custos", href: "/produtos", roles: ["DIRETORIA"] },
  { key: "parametros", label: "Parâmetros", href: "/parametros", roles: ["DIRETORIA"] },
  { key: "simulador", label: "Simulador", href: "/simulador", roles: ["DIRETORIA", "GERENTE_COMERCIAL", "VENDEDOR"] },
  { key: "equipe", label: "Equipe e acessos", href: "/equipe", roles: ["DIRETORIA"] },
] as const satisfies readonly {
  key: string;
  label: string;
  href: `/${string}`;
  roles: readonly Role[];
}[];

export type MenuItemKey = (typeof MENU)[number]["key"];

export type MenuItem = {
  key: MenuItemKey;
  label: string;
  href: string;
  roles: readonly Role[];
};

export const MENU_ITEMS: readonly MenuItem[] = MENU;

export function menuItem(key: MenuItemKey): MenuItem {
  const item = MENU_ITEMS.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`Unknown menu item: ${key}`);
  return item;
}

export function canAccess(role: Role, key: MenuItemKey): boolean {
  return menuItem(key).roles.includes(role);
}

/** Items the profile sees in the sidebar, in the manual's order. */
export function menuFor(role: Role): MenuItem[] {
  return MENU_ITEMS.filter((item) => item.roles.includes(role));
}

/**
 * Who sees cost, real cost, largest discounts and profit. The single source for
 * "só o diretor vê": pages ask this, never compare the profile themselves.
 */
export function seesCosts(role: Role): boolean {
  return role === "DIRETORIA";
}

/**
 * Who sees the orders of the whole team. A seller sees only their own. Pages and
 * actions build the scope of the orders from this, never from the profile itself.
 */
export function seesAllOrders(role: Role): boolean {
  return role === "DIRETORIA" || role === "GERENTE_COMERCIAL";
}

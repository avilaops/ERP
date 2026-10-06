import type { Role } from "@/lib/auth/roles";

/**
 * Single source of truth for "which profile reaches which menu item".
 *
 * Order follows the sidebar in docs/manual/paginas/03-navegacao.md. Where the
 * manual does not say a profile sees an item, the profile does not get it.
 */
const MENU = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", roles: ["DIRETORIA", "GERENTE_COMERCIAL", "VENDEDOR"] },
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

/** Who is asking: the profile and, when the company narrowed it for this person, the screens left. */
export type Access = { role: Role; items?: readonly string[] | null };

/**
 * Whether this person opens the item. The profile decides what is possible;
 * the list of the person, when there is one, only takes screens away from it.
 * It never gives a screen the profile does not have.
 */
export function allows(access: Access, key: MenuItemKey): boolean {
  return canAccess(access.role, key) && (access.items == null || access.items.includes(key));
}

/** The items this person sees in the sidebar, in the manual's order. */
export function menuOf(access: Access): MenuItem[] {
  return MENU_ITEMS.filter((item) => allows(access, item.key));
}

/**
 * What to store for a person: the chosen screens that the profile has, in the
 * order of the menu, or `null` when they are all of them (nothing narrowed).
 * Choosing none is refused by who calls: a person with no screen gets nowhere.
 */
export function narrowedItems(role: Role, chosen: readonly string[]): MenuItemKey[] | null {
  const own = menuFor(role).map((item) => item.key);
  const kept = own.filter((key) => chosen.includes(key));
  return kept.length === own.length ? null : kept;
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

/** Who sees the commissions of every seller and marks them as paid. A seller sees only their own. */
export function managesCommissions(role: Role): boolean {
  return role === "DIRETORIA" || role === "FINANCEIRO";
}

/** Who confirms or refuses a refund asked for in Recebimentos. Whoever has the screen may ask. */
export function confirmsRefunds(role: Role): boolean {
  return role === "DIRETORIA";
}

/** Who sets the sales goals. Everyone else with Preços e metas only follows them. */
export function setsGoals(role: Role): boolean {
  return role === "DIRETORIA";
}

/** Who may approve an order that gives a loss. Everyone else with Aprovações decides only orders with profit. */
export function approvesAtLoss(role: Role): boolean {
  return role === "DIRETORIA";
}

/**
 * Who sees the orders of the whole team. A seller sees only their own. Pages and
 * actions build the scope of the orders from this, never from the profile itself.
 */
export function seesAllOrders(role: Role): boolean {
  return role === "DIRETORIA" || role === "GERENTE_COMERCIAL";
}

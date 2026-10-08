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
 * What a profile may do beyond opening screens. Each power belongs to some of
 * the four types; a profile of the company (Equipe → Perfis) may give up powers
 * of its type of origin, never gain one it does not have.
 */
export const POWERS = [
  { key: "custos", label: "Vê custo, margem e lucro", roles: ["DIRETORIA"] },
  { key: "pedidos-da-equipe", label: "Vê os pedidos de toda a equipe", roles: ["DIRETORIA", "GERENTE_COMERCIAL"] },
  { key: "aprova-prejuizo", label: "Aprova pedido com prejuízo", roles: ["DIRETORIA"] },
  { key: "metas", label: "Define as metas de venda", roles: ["DIRETORIA"] },
  { key: "comissoes", label: "Vê as comissões de todos e marca como pagas", roles: ["DIRETORIA", "FINANCEIRO"] },
  { key: "estornos", label: "Confirma ou recusa estorno de recebimento", roles: ["DIRETORIA"] },
] as const satisfies readonly { key: string; label: string; roles: readonly Role[] }[];

export type PowerKey = (typeof POWERS)[number]["key"];

/** Who is asking about a power: a bare type, or a session, whose profile may have given powers up. */
export type Powered = Role | { role: Role; denied?: readonly string[] | null };

function has(who: Powered, power: PowerKey): boolean {
  const role = typeof who === "string" ? who : who.role;
  const denied = typeof who === "string" ? null : who.denied;
  const roles: readonly Role[] = POWERS.find((item) => item.key === power)?.roles ?? [];
  return roles.includes(role) && !(denied ?? []).includes(power);
}

/** The powers a type has, in the order of the list. */
export const powersOf = (role: Role) => POWERS.filter((power) => (power.roles as readonly Role[]).includes(role));

/** Screens that show cost whoever opens them: a profile without the power of seeing costs cannot have them. */
export const COST_SCREENS: readonly MenuItemKey[] = ["produtos", "parametros"];

/**
 * Who sees cost, real cost, largest discounts and profit. The single source for
 * "só o diretor vê": pages ask this, never compare the profile themselves.
 */
export function seesCosts(who: Powered): boolean {
  return has(who, "custos");
}

/** Who sees the commissions of every seller and marks them as paid. A seller sees only their own. */
export function managesCommissions(who: Powered): boolean {
  return has(who, "comissoes");
}

/** Who confirms or refuses a refund asked for in Recebimentos. Whoever has the screen may ask. */
export function confirmsRefunds(who: Powered): boolean {
  return has(who, "estornos");
}

/** Who sets the sales goals. Everyone else with Preços e metas only follows them. */
export function setsGoals(who: Powered): boolean {
  return has(who, "metas");
}

/** Who may approve an order that gives a loss. Everyone else with Aprovações decides only orders with profit. */
export function approvesAtLoss(who: Powered): boolean {
  return has(who, "aprova-prejuizo");
}

/**
 * Who sees the orders of the whole team. A seller sees only their own. Pages and
 * actions build the scope of the orders from this, never from the profile itself.
 */
export function seesAllOrders(who: Powered): boolean {
  return has(who, "pedidos-da-equipe");
}

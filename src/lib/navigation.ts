import type { MenuItem } from "@/lib/auth/permissions";

export type NavigationGroup = { title: string; items: { href: string; label: string }[] };

const GROUPS = [
  ["Visão geral", ["dashboard", "relatorios", "documentos"]],
  ["Vendas", ["pedidos", "funil", "clientes", "aprovacoes"]],
  ["Preços e propostas", ["tabela-precos", "simulador", "precos-metas"]],
  ["Financeiro", ["recebimentos", "contas-pagar", "comissoes"]],
  ["Fiscal", ["fiscal"]],
  ["Produtos e operação", ["produtos", "estoque", "compras", "fornecedores", "producao"]],
  ["Administração", ["equipe", "parametros"]],
] as const;

/** Organizes only destinations already authorized by the server. */
export function navigationGroups(items: readonly MenuItem[]): NavigationGroup[] {
  const groups: NavigationGroup[] = GROUPS.map(([title, keys]) => ({
    title,
    items: keys.flatMap((key) => {
      const item = items.find((candidate) => candidate.key === key);
      if (!item) return [];
      const label = key === "dashboard" ? "Painel" : key === "parametros" ? "Configurações" : item.label;
      return [{ href: item.href, label }];
    }),
  })).filter((group) => group.items.length > 0);
  // New destinations remain reachable until their group is defined.
  const known = new Set<string>(GROUPS.flatMap(([, keys]) => [...keys]));
  const remaining = items.filter((item) => !known.has(item.key)).map(({ href, label }) => ({ href, label }));
  if (remaining.length) groups.push({ title: "Outros", items: remaining });
  return groups;
}

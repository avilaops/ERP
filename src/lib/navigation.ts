import type { MenuItem } from "@/lib/auth/permissions";

export type NavigationGroup = { title: string; items: { href: string; label: string }[] };

const GROUPS = [
  ["Início", ["dashboard"]],
  ["Comercial", ["funil", "clientes", "pedidos", "aprovacoes"]],
  ["Preços", ["tabela-precos", "simulador", "precos-metas"]],
  ["Operação", ["producao", "estoque", "compras", "fornecedores", "produtos"]],
  ["Financeiro", ["recebimentos", "contas-pagar", "comissoes"]],
  ["Fiscal", ["fiscal"]],
  ["Gestão", ["relatorios", "documentos", "equipe", "parametros"]],
] as const;

/** Organizes only destinations already authorized by the server. */
export function navigationGroups(items: readonly MenuItem[]): NavigationGroup[] {
  const groups: NavigationGroup[] = GROUPS.map(([title, keys]) => ({
    title,
    items: keys.flatMap((key) => {
      const item = items.find((candidate) => candidate.key === key);
      if (!item) return [];
      return [{ href: item.href, label: item.label }];
    }),
  })).filter((group) => group.items.length > 0);
  // New destinations remain reachable until their group is defined.
  const known = new Set<string>(GROUPS.flatMap(([, keys]) => [...keys]));
  const remaining = items.filter((item) => !known.has(item.key)).map(({ href, label }) => ({ href, label }));
  if (remaining.length) groups.push({ title: "Outros", items: remaining });
  return groups;
}

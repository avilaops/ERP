import Link from "next/link";
import { ListPager, ListQuery } from "@/components/ListQuery";
import { CARD, EmptyState, MetricSummary, PageHeader, Pill, PRIMARY, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { loadOrderOverview, queryOrders } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { isoDate, showMoney, showPercent } from "@/lib/format";
import { listHref, parseListQuery } from "@/lib/list-query";
import { ORDER_TABS, ordersCount, ordersView } from "@/lib/orders-view";

const ITEM = menuItem("pedidos");
const HERE = ITEM.href;
const OPTIONS = {
  sorts: ["atualizacao", "numero", "cliente", "vendedor"] as const,
  defaultSort: "atualizacao" as const,
  defaultDirection: "desc" as const,
  filters: { aba: ["abertos", "aprovacao", "fechados", "perdidos", "todos"] },
};

export const metadata = { title: `${ITEM.label} · ERP` };
export const dynamic = "force-dynamic";

const STATUS_TONES = { em_negociacao: "neutral", aguardando_aprovacao: "warn", fechado: "good", perdido: "bad", cancelado: "neutral" } as const;

export default async function PedidosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);
  const raw = await searchParams;
  const query = parseListQuery({ ...raw, q: raw.q ?? raw.busca }, OPTIONS);
  const tab = (query.filters.aba?.[0] ?? "abertos") as (typeof ORDER_TABS)[number]["key"];
  const everyone = seesAllOrders(session);
  const scope = { sellerEmail: everyone ? null : session.email };
  const month = isoDate(new Date()).slice(0, 7);
  const [result, overview] = await Promise.all([queryOrders(query, scope, conn), loadOrderOverview(scope, month, conn)]);
  const rows = ordersView(result.items, { tab: "todos", search: "", me: session.email, month }).rows;
  const page = result;
  const monthLabel = new Date(`${month}-01T12:00:00-03:00`).toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });
  const indicators = overview.indicators;
  const cards = [
    ["Em aberto", showMoney(indicators.open.total), ordersCount(indicators.open.count)],
    [`Fechados em ${monthLabel}`, showMoney(indicators.closedInMonth.total), ordersCount(indicators.closedInMonth.count)],
    ["Taxa de fechamento", indicators.closeRate === null ? "—" : showPercent(indicators.closeRate, 0), "fechados sobre fechados e perdidos"],
    ["Desconto médio", indicators.averageClosedDiscount === null ? "—" : showPercent(indicators.averageClosedDiscount), "nos pedidos fechados"],
  ] as const;

  return (
    <>
      <PageHeader title={ITEM.label} hint={everyone ? "Pedidos de toda a equipe." : "Os seus pedidos."} actions={<Link href={`${HERE}/novo`} className={PRIMARY}>+ Novo pedido</Link>} />
      <MetricSummary items={cards.map(([label, value, note]) => ({ label, value, note }))} />

      <nav aria-label="Situação dos pedidos" className="view-tabs mt-4 flex-nowrap overflow-x-auto">
        {ORDER_TABS.map((item) => {
          const filters: Record<string, string[]> = item.key === "abertos" ? {} : { aba: [item.key] };
          return <Link key={item.key} href={listHref(HERE, query, { filters, page: 1 }, OPTIONS)} aria-current={item.key === tab ? "page" : undefined}>{item.label}{item.key === "fechados" ? " (todos os períodos)" : ""} ({overview.counts[item.key]})</Link>;
        })}
      </nav>

      <section className={`${CARD} mt-3 list-screen`} aria-label="Lista de pedidos">
        <ListQuery
          path={HERE}
          query={query}
          options={OPTIONS}
          searchLabel="Buscar pedido por cliente, CPF/CNPJ ou número"
          searchPlaceholder="Cliente, CPF/CNPJ ou número"
          sorts={[{ value: "atualizacao", label: "Última atualização" }, { value: "numero", label: "Número" }, { value: "cliente", label: "Cliente" }, { value: "vendedor", label: "Vendedor" }]}
        />
        {rows.length === 0 ? (
          <EmptyState
            title={overview.counts.todos === 0 ? "Nenhum pedido cadastrado" : "Nenhum pedido encontrado"}
            description={overview.counts.todos === 0 ? "Crie o primeiro pedido para iniciar uma negociação." : "Ajuste a busca ou remova os filtros para ver outros pedidos."}
            action={overview.counts.todos === 0 ? <Link href={`${HERE}/novo`} className={PRIMARY}>Novo pedido</Link> : <Link href={HERE} className={SECONDARY}>Limpar busca e filtros</Link>}
          />
        ) : (
          <div className="list-results">
            <ul className="md:hidden">
              {rows.map((row) => <li key={row.number} className="border-t border-slate-200 first:border-t-0"><Link href={`${HERE}/${row.number}`} className="block px-4 py-3 active:bg-slate-50"><span className="flex items-start justify-between gap-3"><span className="min-w-0 break-words font-medium text-brand">{row.customer}</span><span className="whitespace-nowrap font-semibold">{row.total}</span></span><span className="mt-1 block break-words text-xs text-slate-500">{[row.detail, everyone ? row.seller : null].filter(Boolean).join(" · ")}</span><span className="mt-2 flex items-center justify-between gap-3 text-xs"><Pill tone={STATUS_TONES[row.status]}>{row.statusLabel}</Pill><span className="text-right text-slate-600">desconto {row.discount} · {row.updated}</span></span></Link></li>)}
            </ul>
            <table className="hidden w-full table-fixed text-sm md:table">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2 text-left">Cliente</th>{everyone && <th className="px-3 py-2 text-left">Vendedor</th>}<th className="px-3 py-2 text-right">Desconto</th><th className="px-3 py-2 text-right">Total com IPI</th><th className="px-3 py-2 text-left">Situação</th><th className="px-3 py-2 text-left">Atualizado</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.number} className="border-t border-slate-200 align-top"><td className="px-3 py-3"><Link href={`${HERE}/${row.number}`} className="break-words font-medium text-brand underline">{row.customer}</Link><span className="block break-words text-xs text-slate-500">{[row.detail, row.document].filter(Boolean).join(" · ")}</span></td>{everyone && <td className="px-3 py-3">{row.seller}</td>}<td className="px-3 py-3 text-right">{row.discount}</td><td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{row.total}</td><td className="px-3 py-3"><Pill tone={STATUS_TONES[row.status]}>{row.statusLabel}</Pill></td><td className="px-3 py-3 text-slate-600">{row.updated}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <ListPager path={HERE} query={query} options={OPTIONS} result={page} noun={["pedido", "pedidos"]} />
      </section>
    </>
  );
}

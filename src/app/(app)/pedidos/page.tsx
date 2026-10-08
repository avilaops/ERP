import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { listOrders } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { isoDate, showMoney, showPercent } from "@/lib/format";
import { ORDER_TABS, ordersCount, ordersView, parseOrderTab } from "@/lib/orders-view";

export const metadata = { title: `${menuItem("pedidos").label} · ERP` };
export const dynamic = "force-dynamic";

const HERE = menuItem("pedidos").href;
const CARD = "rounded-lg border border-slate-200 bg-white";

const STATUS_COLORS = {
  em_negociacao: "bg-slate-200 text-slate-800",
  aguardando_aprovacao: "bg-amber-100 text-amber-900",
  fechado: "bg-emerald-100 text-emerald-900",
  perdido: "bg-red-100 text-red-900",
  cancelado: "bg-slate-100 text-slate-600",
} as const;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function PedidosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;

  const tab = parseOrderTab(first(query.aba));
  const search = (first(query.busca) ?? "").trim();
  // A seller receives only their own orders from the database; the others, all of them.
  const everyone = seesAllOrders(session);
  const orders = await listOrders({ sellerEmail: everyone ? null : session.email }, conn);
  const { rows, counts, indicators } = ordersView(orders, { tab, search, me: session.email, month: isoDate(new Date()).slice(0, 7) });

  const address = (key: string) => {
    const params = new URLSearchParams();
    if (key !== "abertos") params.set("aba", key);
    if (search !== "") params.set("busca", search);
    const text = params.toString();
    return text === "" ? HERE : `${HERE}?${text}`;
  };

  const cards = [
    ["Em aberto", showMoney(indicators.open.total), ordersCount(indicators.open.count)],
    ["Fechados no mês", showMoney(indicators.closedInMonth.total), ordersCount(indicators.closedInMonth.count)],
    ["Taxa de fechamento", indicators.closeRate === null ? "—" : showPercent(indicators.closeRate, 0), "fechados sobre fechados e perdidos"],
    ["Desconto médio", indicators.averageClosedDiscount === null ? "—" : showPercent(indicators.averageClosedDiscount), "nos pedidos fechados"],
  ] as const;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{menuItem("pedidos").label}</h1>
          <p className="mt-1 text-sm text-slate-600">{everyone ? "Pedidos de toda a equipe." : "Os seus pedidos."}</p>
        </div>
        <Link href={`${HERE}/novo`} className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
          + Novo pedido
        </Link>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map(([label, value, note]) => (
          <div key={label} className={`${CARD} p-4`}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-bold sm:text-2xl">{value}</dd>
            <dd className="text-xs text-slate-600">{note}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Situação" className="flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {ORDER_TABS.map((item) => (
            <Link
              key={item.key}
              href={address(item.key)}
              aria-current={item.key === tab ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 font-medium ${item.key === tab ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {item.label} ({counts[item.key]})
            </Link>
          ))}
        </nav>
        <form method="get" action={HERE} role="search" className="flex w-full gap-2 sm:w-auto">
          {tab !== "abertos" && <input type="hidden" name="aba" value={tab} />}
          <input
            type="search"
            name="busca"
            defaultValue={search}
            placeholder="Cliente, CNPJ/CPF ou número"
            aria-label="Buscar pedido por cliente, CNPJ/CPF ou número"
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm sm:w-64 sm:flex-none outline-none focus:ring-2 focus:ring-brand"
          />
          <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
            Buscar
          </button>
        </form>
      </div>

      <section className={`${CARD} mt-4`} aria-label="Lista de pedidos">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">
            {orders.length === 0
              ? "Nenhum pedido ainda. Comece por + Novo pedido."
              : search !== ""
                ? `Nenhum pedido nesta aba para "${search}".`
                : "Nenhum pedido nesta aba."}
          </p>
        ) : (
          <>
            {/* On a phone each order is a card; the table is for wider screens. */}
            <ul className="md:hidden">
              {rows.map((row) => (
                <li key={row.number} className="border-t border-slate-200 first:border-t-0">
                  <Link href={`${HERE}/${row.number}`} className="block px-4 py-3 active:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 font-medium text-brand">{row.customer}</span>
                      <span className="whitespace-nowrap font-semibold">{row.total}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{[row.detail, everyone ? row.seller : null].filter(Boolean).join(" · ")}</p>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                      <span className={`rounded-full px-2.5 py-0.5 font-medium ${STATUS_COLORS[row.status]}`}>{row.statusLabel}</span>
                      <span className="text-slate-600">
                        desconto {row.discount} · {row.updated}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-semibold">
                      Cliente
                    </th>
                    {everyone && (
                      <th scope="col" className="px-4 py-2 text-left font-semibold">
                        Vendedor
                      </th>
                    )}
                    <th scope="col" className="px-4 py-2 text-right font-semibold">
                      Desconto
                    </th>
                    <th scope="col" className="whitespace-nowrap px-4 py-2 text-right font-semibold">
                      Total da nota
                    </th>
                    <th scope="col" className="px-4 py-2 text-left font-semibold">
                      Situação
                    </th>
                    <th scope="col" className="px-4 py-2 text-left font-semibold">
                      Atualizado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.number} className="border-t border-slate-200 align-top hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`${HERE}/${row.number}`} className="font-medium text-brand underline-offset-2 hover:underline">
                          {row.customer}
                        </Link>
                        <span className="block text-xs text-slate-500">{[row.detail, row.document].filter(Boolean).join(" · ")}</span>
                      </td>
                      {everyone && <td className="px-4 py-3">{row.seller}</td>}
                      <td className="whitespace-nowrap px-4 py-3 text-right">{row.discount}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{row.total}</td>
                      <td className="px-4 py-3">
                        <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[row.status]}`}>{row.statusLabel}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.updated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}

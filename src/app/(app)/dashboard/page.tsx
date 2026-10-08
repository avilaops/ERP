import Link from "next/link";
import { Bars, Columns, Kpi } from "@/components/Charts";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem, seesAllOrders, seesCosts } from "@/lib/auth/permissions";
import { dashboardView, parsePeriod, PERIODS } from "@/lib/dashboard-view";
import { listDashboardOrders, ordersProfit } from "@/lib/db/dashboard";
import { listCommissionsDue, listPayables } from "@/lib/db/payables";
import { tenantDb } from "@/lib/db/pool";
import { listOpenReceivables } from "@/lib/db/receivables";
import { isoDate, showMoney, showPercent } from "@/lib/format";
import { payablesSummary } from "@/lib/payables-view";
import { addDays } from "@/lib/pricing/payment";
import { receivablesSummary } from "@/lib/receivables-view";

export const metadata = { title: `${menuItem("dashboard").label} · ERP` };
// Never reused between profiles: what is assembled for the directors has profit.
export const dynamic = "force-dynamic";

const HERE = menuItem("dashboard").href;
const CARD = "rounded-lg border border-slate-200 bg-white p-5";
const TITLE = "text-sm font-semibold uppercase tracking-wide";
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const NONE = "—";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("dashboard");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  const period = parsePeriod(first(query.periodo));

  const today = isoDate(new Date());
  // A seller receives only their own orders from the database; the others, the whole team's.
  const everyone = seesAllOrders(session.role);
  const orders = await listDashboardOrders({ sellerEmail: everyone ? null : session.email }, conn);
  // "Toda a equipe" or one seller: a filter over what this person may already see, never a wider read.
  const sellers = everyone ? [...new Map(orders.map((order) => [order.sellerEmail, order.sellerName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")) : [];
  const seller = sellers.find(([email]) => email === first(query.vendedor))?.[0] ?? null;
  const view = dashboardView(seller ? orders.filter((order) => order.sellerEmail === seller) : orders, period, today);
  const periodHref = (key: string) => {
    const params = new URLSearchParams();
    if (key !== "mes") params.set("periodo", key);
    if (seller) params.set("vendedor", seller);
    const text = params.toString();
    return text === "" ? HERE : `${HERE}?${text}`;
  };
  const periodLabel = PERIODS.find((item) => item.key === period)?.label.toLowerCase() ?? "";

  // Profit is read only for who may see costs.
  const profit = seesCosts(session.role) ? await ordersProfit(view.closedNumbers, conn) : null;
  const receivables = allows(session, "recebimentos") ? receivablesSummary(await listOpenReceivables(conn), today, addDays(today, 30)) : null;
  const payables = allows(session, "contas-pagar")
    ? payablesSummary(await listPayables(conn), await listCommissionsDue(conn), { today, inSevenDays: addDays(today, 7), month: today.slice(0, 7) })
    : null;
  const { funnel } = view;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{menuItem("dashboard").label}</h1>
          <p className="mt-1 text-slate-600">{everyone ? "Vendas de toda a equipe." : "Os seus números."}</p>
        </div>
        <nav aria-label="Período" className="flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {PERIODS.map((item) => (
            <Link
              key={item.key}
              href={periodHref(item.key)}
              aria-current={item.key === period ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 font-medium ${item.key === period ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {sellers.length > 1 && (
        <form method="get" action={HERE} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {period !== "mes" && <input type="hidden" name="periodo" value={period} />}
          <label htmlFor="vendedor" className="text-slate-600">
            Vendedor
          </label>
          <select id="vendedor" name="vendedor" defaultValue={seller ?? ""} className="rounded border border-slate-300 bg-white px-3 py-1.5">
            <option value="">Toda a equipe</option>
            {sellers.map(([email, name]) => (
              <option key={email} value={email}>
                {name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50">
            Ver
          </button>
        </form>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label="Vendas fechadas" value={showMoney(view.closed.total)} note={`${view.closed.count} ${view.closed.count === 1 ? "pedido" : "pedidos"} · com IPI`} />
        <Kpi label="Em negociação" value={showMoney(view.open.total)} note={`${view.open.count} ${view.open.count === 1 ? "pedido em aberto" : "pedidos em aberto"} · hoje`} />
        <Kpi label="Ticket médio" value={view.averageTicket === null ? NONE : showMoney(view.averageTicket)} note="por pedido fechado" />
        <Kpi label="Conversão" value={view.conversion === null ? NONE : showPercent(view.conversion, 0)} note="fechados sobre fechados e perdidos" />
        <Kpi label="Desconto médio" value={view.averageDiscount === null ? NONE : showPercent(view.averageDiscount)} note="nos pedidos fechados" />
        {profit && (
          <>
            <Kpi label="Lucro líquido" value={showMoney(Math.round(profit.netProfit * 100) / 100)} note="dos pedidos fechados · só a diretoria vê" />
            <Kpi label="Margem líquida" value={profit.netSale > 0 ? showPercent(profit.netProfit / profit.netSale) : NONE} note="sobre o valor sem IPI" />
          </>
        )}
      </dl>

      <section className={`${CARD} mt-6`} aria-labelledby="por-mes">
        <h2 id="por-mes" className={TITLE}>
          Vendas fechadas por mês
        </h2>
        <p className="mb-4 text-xs text-slate-600">últimos 12 meses · com IPI</p>
        <Columns bars={view.byMonth} format={showMoney} />
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <section className={CARD} aria-labelledby="funil">
          <h2 id="funil" className={TITLE}>
            Funil de orçamentos
          </h2>
          <p className="mb-4 text-xs text-slate-600">criados em: {periodLabel}</p>
          <Bars
            bars={[
              { label: "Criados", value: funnel.created },
              { label: "Em negociação", value: funnel.negotiating },
              { label: "Aguardando aprovação", value: funnel.waiting },
              { label: "Fechados", value: funnel.closed },
              { label: "Perdidos", value: funnel.lost },
            ]}
            format={String}
            empty=""
          />
        </section>
        {everyone && (
          <section className={CARD} aria-labelledby="ranking">
            <h2 id="ranking" className={TITLE}>
              Ranking de vendedores
            </h2>
            <p className="mb-4 text-xs text-slate-600">vendas fechadas · com IPI</p>
            <Bars bars={view.bySeller} format={showMoney} empty="Nenhum pedido fechado no período." />
          </section>
        )}
        <section className={CARD} aria-labelledby="equipamentos">
          <h2 id="equipamentos" className={TITLE}>
            Equipamentos mais vendidos
          </h2>
          <p className="mb-4 text-xs text-slate-600">os 8 primeiros · valor sem IPI</p>
          <Bars bars={view.byProduct} format={showMoney} empty="Nenhum equipamento vendido no período." />
        </section>
        <section className={CARD} aria-labelledby="estados">
          <h2 id="estados" className={TITLE}>
            Vendas por estado
          </h2>
          <p className="mb-4 text-xs text-slate-600">vendas fechadas · com IPI</p>
          <Bars bars={view.byState} format={showMoney} empty="Nenhuma venda no período." />
        </section>
      </div>

      <section className={`${CARD} mt-6`} aria-labelledby="em-aberto">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="em-aberto" className={TITLE}>
            Orçamentos em aberto por idade
          </h2>
          <p className="text-sm text-slate-600">{showMoney(view.open.total)} em negociação</p>
        </div>
        <p className="mb-4 text-xs text-slate-600">em negociação ou aguardando aprovação, hoje · dias desde que o pedido foi aberto</p>
        {view.open.byAge.length === 0 ? (
          <p className="text-sm text-slate-600">Nenhum orçamento em aberto.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.open.byAge.map((age) => (
              <li key={age.label} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span>{age.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${view.open.total > 0 ? (age.value / view.open.total) * 100 : 0}%` }} />
                </span>
                <span className="text-right">
                  <strong className="block">{showMoney(age.value)}</strong>
                  <span className="text-xs text-slate-600">
                    {age.count} {age.count === 1 ? "pedido" : "pedidos"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(receivables || payables) && (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          {receivables && (
            <section className={CARD} aria-labelledby="a-receber">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="a-receber" className={TITLE}>
                  A receber
                </h2>
                <Link href={menuItem("recebimentos").href} className="text-sm text-brand underline">
                  abrir recebimentos
                </Link>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-slate-600">Total</dt>
                  <dd className="font-semibold">{showMoney(receivables.open.total)}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Vencido</dt>
                  <dd className={`font-semibold ${receivables.overdue.count > 0 ? "text-red-700" : ""}`}>{showMoney(receivables.overdue.total)}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Próx. 30 dias</dt>
                  <dd className="font-semibold">{showMoney(receivables.nextDays.total)}</dd>
                </div>
              </dl>
            </section>
          )}
          {payables && (
            <section className={CARD} aria-labelledby="a-pagar">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="a-pagar" className={TITLE}>
                  A pagar
                </h2>
                <Link href={menuItem("contas-pagar").href} className="text-sm text-brand underline">
                  abrir contas a pagar
                </Link>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-slate-600">Total</dt>
                  <dd className="font-semibold">{showMoney(payables.open.total)}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Vencidas</dt>
                  <dd className={`font-semibold ${payables.overdue.count > 0 ? "text-red-700" : ""}`}>{showMoney(payables.overdue.total)}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Próx. 7 dias</dt>
                  <dd className="font-semibold">{showMoney(payables.nextDays.total)}</dd>
                </div>
              </dl>
            </section>
          )}
        </div>
      )}
    </>
  );
}

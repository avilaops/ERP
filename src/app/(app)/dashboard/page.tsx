import Link from "next/link";
import { Bars, Columns, Kpi } from "@/components/Charts";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem, seesAllOrders, seesCosts } from "@/lib/auth/permissions";
import { cashForecast, change, dashboardView, parsePeriod, PERIODS } from "@/lib/dashboard-view";
import { listDashboardOrders, ordersProfit, ordersProfitEach } from "@/lib/db/dashboard";
import { listCommissionsDue, listPayables } from "@/lib/db/payables";
import { tenantDb } from "@/lib/db/pool";
import { listOpenReceivables, receivedInMonth } from "@/lib/db/receivables";
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
  const director = seesCosts(session.role);
  const profit = director ? await ordersProfit(view.closedNumbers, conn) : null;
  const profitBefore = director ? await ordersProfit(view.previous.closedNumbers, conn) : null;
  // Net profit of each of the twelve months of the chart, for the directors only.
  const profitEach = director ? await ordersProfitEach(view.closedByMonth.flatMap((month) => month.numbers), conn) : null;
  const profitByMonth = profitEach
    ? view.closedByMonth.map((month) => ({ label: month.label, value: Math.round(month.numbers.reduce((sum, number) => sum + (profitEach.get(number)?.netProfit ?? 0), 0) * 100) / 100 }))
    : null;

  const openReceivables = allows(session, "recebimentos") ? await listOpenReceivables(conn) : null;
  const receivables = openReceivables ? receivablesSummary(openReceivables, today, addDays(today, 30)) : null;
  const received = openReceivables ? await receivedInMonth(today.slice(0, 7), conn) : null;
  const bills = allows(session, "contas-pagar") ? { payables: await listPayables(conn), commissions: await listCommissionsDue(conn) } : null;
  const payables = bills ? payablesSummary(bills.payables, bills.commissions, { today, inSevenDays: addDays(today, 7), month: today.slice(0, 7) }) : null;
  // The cash expected needs both sides: who sees only one of them does not get half a forecast.
  const cash =
    openReceivables && bills
      ? cashForecast(
          openReceivables.map((item) => ({ dueDate: item.dueDate, amount: item.open })),
          [...bills.payables.filter((item) => item.status === "aberta"), ...bills.commissions.filter((item) => item.amount > 0)].map((item) => ({ dueDate: item.dueDate, amount: item.amount })),
          today,
        )
      : null;
  /** "▲ 12% vs. período anterior", or nothing when the period before has nothing to compare with. */
  const versus = (delta: number | null) =>
    delta === null ? null : (
      <span className={`mt-1 block font-medium ${delta >= 0 ? "text-emerald-800" : "text-red-700"}`}>
        {delta >= 0 ? "▲" : "▼"} {showPercent(Math.abs(delta), 0)} <span className="font-normal text-slate-600">vs. período anterior</span>
      </span>
    );
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
        <Kpi label="Vendas fechadas" value={showMoney(view.closed.total)} note={<>com IPI{versus(change(view.closed.total, view.previous.closed.total))}</>} />
        <Kpi
          label="Pedidos fechados"
          value={String(view.closed.count)}
          note={
            <>
              {funnel.created} {funnel.created === 1 ? "orçamento criado" : "orçamentos criados"}
              {versus(change(view.closed.count, view.previous.closed.count))}
            </>
          }
        />
        <Kpi label="Em negociação" value={showMoney(view.open.total)} note={`${view.open.count} ${view.open.count === 1 ? "pedido em aberto" : "pedidos em aberto"} · hoje`} />
        <Kpi label="Ticket médio" value={view.averageTicket === null ? NONE : showMoney(view.averageTicket)} note={<>por pedido fechado{versus(change(view.averageTicket, view.previous.averageTicket))}</>} />
        <Kpi label="Taxa de fechamento" value={view.conversion === null ? NONE : showPercent(view.conversion, 0)} note={<>fechados ÷ (fechados + perdidos){versus(change(view.conversion, view.previous.conversion))}</>} />
        <Kpi label="Desconto médio" value={view.averageDiscount === null ? NONE : showPercent(view.averageDiscount)} note="nos pedidos fechados" />
        {profit && (
          <>
            <Kpi
              label="Lucro líquido"
              value={showMoney(Math.round(profit.netProfit * 100) / 100)}
              note={<>dos pedidos fechados · só a diretoria vê{versus(change(profit.netProfit, profitBefore?.netProfit ?? null))}</>}
            />
            <Kpi label="Margem líquida" value={profit.netSale > 0 ? showPercent(profit.netProfit / profit.netSale) : NONE} note="sobre o valor sem IPI" />
          </>
        )}
      </dl>

      <section className={`${CARD} mt-6`} aria-labelledby="por-mes">
        <h2 id="por-mes" className={TITLE}>
          Vendas fechadas por mês
        </h2>
        <p className="mb-4 text-xs text-slate-600">últimos 12 meses · com IPI · total {showMoney(view.byMonth.reduce((sum, bar) => sum + bar.value, 0))}</p>
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

      {(cash || profitByMonth) && (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          {cash && (
            <section className={CARD} aria-labelledby="caixa-previsto">
              <h2 id="caixa-previsto" className={TITLE}>
                Caixa previsto
              </h2>
              <p className="mb-3 text-xs text-slate-600">parcelas a receber − contas e comissões a pagar · próximos 6 meses · o vencido conta no mês atual</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3 font-semibold">Mês</th>
                      <th className="py-2 pr-3 text-right font-semibold">Entra</th>
                      <th className="py-2 pr-3 text-right font-semibold">Sai</th>
                      <th className="py-2 pr-3 text-right font-semibold">Saldo do mês</th>
                      <th className="py-2 text-right font-semibold">Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cash.map((month) => (
                      <tr key={month.label} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-3">{month.label}</td>
                        <td className="py-2 pr-3 text-right">{showMoney(month.comesIn)}</td>
                        <td className="py-2 pr-3 text-right">{showMoney(month.goesOut)}</td>
                        <td className={`py-2 pr-3 text-right font-medium ${month.balance < 0 ? "text-red-700" : ""}`}>{showMoney(month.balance)}</td>
                        <td className={`py-2 text-right font-semibold ${month.accumulated < 0 ? "text-red-700" : ""}`}>{showMoney(month.accumulated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {profitByMonth && (
            <section className={CARD} aria-labelledby="lucro-por-mes">
              <h2 id="lucro-por-mes" className={TITLE}>
                Lucro líquido por mês
              </h2>
              <p className="mb-4 text-xs text-slate-600">só a diretoria vê · dos pedidos fechados em cada mês, depois de impostos, custo e IR</p>
              <Columns bars={profitByMonth.map((bar) => ({ ...bar, value: Math.max(0, bar.value) }))} format={showMoney} />
              {profitByMonth.some((bar) => bar.value < 0) && (
                <p className="mt-2 text-xs text-red-700">
                  Meses com prejuízo: {profitByMonth.filter((bar) => bar.value < 0).map((bar) => `${bar.label} (${showMoney(bar.value)})`).join(", ")}.
                </p>
              )}
            </section>
          )}
        </div>
      )}

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
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-slate-600">Recebido no mês</dt>
                  <dd className="font-semibold">{showMoney(received ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-slate-600">Total a receber</dt>
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

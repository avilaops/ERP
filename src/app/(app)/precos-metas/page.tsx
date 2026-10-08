import { LineTabs } from "@/components/LineTabs";
import { lineWords } from "@/lib/line-words";
import { listLines } from "@/lib/db/product-lines";
import { LINE_PARAM, pickLine } from "@/lib/lines-view";
import Link from "next/link";
import { Kpi } from "@/components/Charts";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesCosts, setsGoals } from "@/lib/auth/permissions";
import { monthLabel } from "@/lib/commissions-view";
import { dashboardView, goalsView } from "@/lib/dashboard-view";
import { listPendingApprovals } from "@/lib/db/approvals";
import { listDashboardOrders, ordersProfit } from "@/lib/db/dashboard";
import { listGoals, listSellers } from "@/lib/db/goals";
import { loadParams } from "@/lib/db/params";
import { listCommissionsDue } from "@/lib/db/payables";
import { tenantDb } from "@/lib/db/pool";
import { listVersions, listVersionStats, loadPublishedSnapshot } from "@/lib/db/price-table";
import { listProductCosts, listProducts } from "@/lib/db/products";
import { formatMoney, isoDate, showDateTime, showMoney, showMultiplier, showPercent } from "@/lib/format";
import { roundCents } from "@/lib/pricing/money";
import { parseDate } from "@/lib/pricing/payment";
import { paramsResult } from "@/lib/pricing/results";
import { limitsByDestination, tableMultiplier } from "@/lib/pricing/table";
import { ActionForm } from "../pedidos/ActionForm";
import { saveGoalAction } from "./actions";

export const metadata = { title: `${menuItem("precos-metas").label} · ERP` };
// Never reused between profiles: what is assembled for the directors has costs.
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white p-5";
const TITLE = "text-sm font-semibold uppercase tracking-wide";
const INPUT = "mt-1 rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const DAY_MS = 86_400_000;
const STALE_DAYS = 45;

export default async function PrecosMetasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("precos-metas");
  const conn = tenantDb(session.tenant.slug);

  const today = isoDate(new Date());
  const month = today.slice(0, 7);
  const orders = await listDashboardOrders({ sellerEmail: null }, conn);
  const sellers = await listSellers(conn);
  const goals = goalsView(orders, await listGoals(month, conn), sellers, month);
  const pending = (await listPendingApprovals(conn)).length;
  // Sales, goals and approvals are of the company; table, costs and parameters are of one product line.
  const lines = await listLines(conn);
  const line = pickLine(lines, (await searchParams)[LINE_PARAM]);
  const versions = (await listVersions(conn)).filter((item) => item.lineId === line.id);
  const products = await listProducts({ active: true, lineId: line.id }, conn);
  const withoutCost = products.filter((product) => product.advisoryCost === null).length;
  const withoutCode = products.filter((product) => product.code === null).length;
  const latest = versions[0] ?? null;
  const stats = await listVersionStats(conn);
  const latestStats = latest ? (stats.get(latest.version) ?? null) : null;
  // Whole days between the day of the publication and today, both in São Paulo.
  const tableAge = latest ? Math.round((parseDate(today) - parseDate(isoDate(latest.publishedAt))) / DAY_MS) : null;
  const mayEdit = setsGoals(session);

  // Everything below is read only for who may see costs: target, multiplier, profit and what the company owes.
  const director = seesCosts(session)
    ? await (async () => {
        const params = await loadParams(conn, line.id);
        const result = paramsResult(params, await listProductCosts(conn, line.id));
        const closed = dashboardView(orders, "mes", today);
        const profit = await ordersProfit(closed.closedNumbers, conn);
        // The table price is the cost times the multiplier, so the limit is the same for every equipment.
        // Inside the state, a taxpayer outside it (one line for each outbound rate), then every state without registration.
        const byState = limitsByDestination(params)
          .limits.map((limit) => ({ label: limit.label, value: limit.atTarget }))
          .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
        // The markup of each publication shown below, from the parameters it was published with.
        const markups = new Map<number, number>();
        for (const version of versions.slice(0, 12)) {
          const snapshot = await loadPublishedSnapshot(version.version, conn);
          if (snapshot) markups.set(version.version, tableMultiplier(snapshot.params) - 1);
        }
        const commissions = (await listCommissionsDue(conn)).filter((item) => item.amount > 0).reduce((total, item) => total + item.amount, 0);
        return { params, result, profit, byState, markups, commissions: roundCents(commissions) };
      })()
    : null;

  const alerts = [
    withoutCost > 0 && { text: `${withoutCost} equipamento(s) sem custo: ficam fora da tabela da equipe.`, href: menuItem("produtos").href, action: "Completar custos" },
    withoutCode > 0 && { text: `${withoutCode} equipamento(s) sem código: o vendedor encontra pelo nome, mas o código evita confusão.`, href: menuItem("produtos").href, action: "Preencher" },
    tableAge !== null && tableAge > STALE_DAYS && { text: `Tabela publicada há ${tableAge} dias. ${lineWords(line.imported).reviseCosts}`, href: menuItem("produtos").href, action: "Revisar" },
    latest === null && { text: "Nenhuma tabela publicada ainda: sem ela não há preço para vender.", href: menuItem("produtos").href, action: "Publicar" },
  ].filter((alert): alert is { text: string; href: string; action: string } => Boolean(alert));

  return (
    <>
      <h1 className="text-2xl font-semibold">{menuItem("precos-metas").label}</h1>
      <p className="mt-1 text-slate-600">Como estão a tabela, as metas de {monthLabel(month)} e o que espera decisão.</p>
      <LineTabs lines={lines} current={line.id} path={menuItem("precos-metas").href} />

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi
          label="Esperando você"
          value={pending}
          note={
            pending > 0 ? (
              <Link href={menuItem("aprovacoes").href} className="text-brand underline">
                abrir aprovações
              </Link>
            ) : (
              "nenhuma aprovação pendente"
            )
          }
        />
        <Kpi label="Tabela em vigor" value={latest ? `v${latest.version}` : "—"} note={latest ? `publicada em ${showDateTime(latest.publishedAt)}` : "nenhuma publicação"} />
        <Kpi
          label="Ticket médio da tabela"
          value={latestStats ? showMoney(latestStats.averageTable) : "—"}
          note={latestStats ? `${latestStats.items} ${latestStats.items === 1 ? "equipamento" : "equipamentos"} na tabela · sem IPI` : "sem tabela publicada"}
        />
        {director && (
          <>
            <Kpi
              label="Preço de tabela"
              value={`custo × ${showMultiplier(director.result.tableMultiplier)}`}
              note={`markup de ${showPercent(director.result.markup, 0)} · pior caso ${director.result.worstDestination.uf}`}
            />
            <Kpi
              label="Meta de lucro líquido"
              value={showPercent(director.params.targetNetProfit, 0)}
              note={`garantida até ${showPercent(director.params.freeDiscount, 0)} de desconto em qualquer estado`}
            />
            <Kpi label="Comissões a pagar" value={showMoney(director.commissions)} note="devidas aos vendedores" />
          </>
        )}
      </dl>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <section className={CARD} aria-labelledby="metas">
          <h2 id="metas" className={TITLE}>
            Metas de venda de {monthLabel(month)}
          </h2>
          <p className="mb-4 text-xs text-slate-600">fechado no mês, com IPI, contra a meta</p>
          <ul className="flex flex-col gap-3">
            {goals.map((goal) => (
              <li key={goal.sellerEmail ?? "equipe"} className="text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={goal.sellerEmail === null ? "font-semibold" : ""}>{goal.label}</span>
                  <span className="whitespace-nowrap">
                    <strong>{showMoney(goal.closed)}</strong>
                    {goal.goal > 0 ? ` de ${showMoney(goal.goal)} · ${showPercent(goal.rate ?? 0, 0)}` : " · sem meta"}
                  </span>
                </div>
                {goal.goal > 0 && (
                  <div className="mt-1 h-2 rounded bg-slate-100">
                    <div className={`h-2 rounded ${(goal.rate ?? 0) >= 1 ? "bg-emerald-600" : "bg-brand"}`} style={{ width: `${Math.min(100, (goal.rate ?? 0) * 100)}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {mayEdit && (
            <ActionForm action={saveGoalAction} className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
              <div>
                <label htmlFor="seller" className="block text-sm font-medium">
                  Para quem
                </label>
                <select id="seller" name="seller" defaultValue="" className={INPUT}>
                  <option value="">Toda a equipe</option>
                  {sellers.map((person) => (
                    <option key={person.email} value={person.email}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="amount" className="block text-sm font-medium">
                  Meta do mês (R$)
                </label>
                <input
                  id="amount"
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  placeholder={goals[0].goal > 0 ? formatMoney(goals[0].goal) : "0,00"}
                  className={`${INPUT} w-40 text-right`}
                />
              </div>
              <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                Salvar meta
              </button>
              <p className="basis-full text-xs text-slate-500">Zero ou vazio tira a meta. A meta vale para o mês corrente.</p>
            </ActionForm>
          )}
        </section>

        <section className={CARD} aria-labelledby="atencao">
          <h2 id="atencao" className={TITLE}>
            Atenção
          </h2>
          {alerts.length === 0 ? (
            <p className="mt-3 text-sm text-slate-700">Tudo em ordem.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {alerts.map((alert) => (
                <li key={alert.text} className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {alert.text}{" "}
                  <Link href={alert.href} className="font-medium underline">
                    {alert.action}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {director && (
          <section className={CARD} aria-labelledby="equilibrio">
            <h2 id="equilibrio" className={TITLE}>
              Ponto de equilíbrio do mês
            </h2>
            <p className="mb-4 text-xs text-slate-600">lucro líquido dos pedidos fechados contra as despesas fixas · só a diretoria vê</p>
            <p className="text-2xl font-bold">
              {showMoney(roundCents(director.profit.netProfit))}{" "}
              <span className="text-base font-normal text-slate-600">de {showMoney(director.params.fixedMonthlyExpenses)}</span>
            </p>
            <div className="mt-2 h-2 rounded bg-slate-100">
              <div
                className={`h-2 rounded ${director.profit.netProfit >= director.params.fixedMonthlyExpenses ? "bg-emerald-600" : "bg-brand"}`}
                style={{
                  width: `${director.params.fixedMonthlyExpenses > 0 ? Math.min(100, Math.max(0, (director.profit.netProfit / director.params.fixedMonthlyExpenses) * 100)) : 100}%`,
                }}
              />
            </div>
            <p className="mt-3 text-sm text-slate-700">
              Para pagar as despesas fixas é preciso vender <strong>{showMoney(roundCents(director.result.breakEvenRevenue))}</strong> sem IPI no mês. Fechado até
              agora: <strong>{showMoney(roundCents(director.profit.netSale))}</strong> sem IPI.
            </p>
          </section>
        )}

        {director && (
          <section className={CARD} aria-labelledby="por-destino">
            <h2 id="por-destino" className={TITLE}>
              Desconto máximo na meta, por destino
            </h2>
            <p className="mb-4 text-xs text-slate-600">
              a linha marca os {showPercent(director.params.freeDiscount, 0)} que o vendedor dá sozinho · IE = cliente com inscrição estadual fora de SP, pelo ICMS de saída · só a
              diretoria vê
            </p>
            {(() => {
              const top = Math.max(...director.byState.map((bar) => bar.value), director.params.freeDiscount, 0.0001);
              return (
                <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
                  {director.byState.map((bar) => (
                    <li key={bar.label} className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.25rem] items-center gap-2 text-sm">
                      <span className="truncate">{bar.label}</span>
                      <span className="relative h-2.5 rounded bg-slate-100">
                        <span
                          className={`block h-full rounded ${bar.value > director.params.freeDiscount + 1e-9 ? "bg-emerald-600" : "bg-slate-500"}`}
                          style={{ width: `${(bar.value / top) * 100}%` }}
                        />
                        <span className="absolute -top-0.5 h-3.5 w-px bg-slate-900" style={{ left: `${(director.params.freeDiscount / top) * 100}%` }} aria-hidden="true" />
                      </span>
                      <strong className="text-right">{showPercent(bar.value)}</strong>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <p className="mt-3 text-xs text-slate-600">É a alçada do gerente: ele aprova até aqui sem saber qual é a meta.</p>
          </section>
        )}

        <section className={`${CARD} lg:col-span-2`} aria-labelledby="publicacoes">
          <h2 id="publicacoes" className={TITLE}>
            Publicações da tabela
          </h2>
          {versions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Nenhuma publicação ainda.</p>
          ) : (
            <div className="relative mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Versão", "Publicada em", "Por", ...(director ? ["Markup"] : []), "Equipamentos", "Ticket médio"].map((column) => (
                      <th key={column} scope="col" className="px-4 py-2 text-left font-semibold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {versions.slice(0, 12).map((version) => (
                    <tr key={version.version} className="border-t border-slate-200">
                      <td className="px-4 py-2 font-medium">
                        <Link href={`${menuItem("tabela-precos").href}?versao=${version.version}`} className="text-brand underline-offset-2 hover:underline">
                          v{version.version}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">{showDateTime(version.publishedAt)}</td>
                      <td className="px-4 py-2">{version.publishedBy}</td>
                      {director && <td className="px-4 py-2">{director.markups.has(version.version) ? showPercent(director.markups.get(version.version) ?? 0, 0) : "—"}</td>}
                      <td className="px-4 py-2">{stats.get(version.version)?.items ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2">{stats.has(version.version) ? showMoney(stats.get(version.version)?.averageTable ?? 0) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

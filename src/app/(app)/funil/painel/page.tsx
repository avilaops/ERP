import Link from "next/link";
import { cookies } from "next/headers";
import { FitRows } from "@/components/FitRows";
import { CARD, Pager, PageHeader, pageOf, Pill, QUIET_LINK, SECTION_TITLE } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { funnelReport, listIdleOpportunities, opportunityParty } from "@/lib/db/funnel";
import { tenantDb } from "@/lib/db/pool";
import { showMoney, showPercent } from "@/lib/format";
import { rowsPerPage, ROWS_COOKIE } from "@/lib/rows";

export const metadata = { title: "Painel do funil · ERP" };
export const dynamic = "force-dynamic";

const HERE = `${menuItem("funil").href}/painel`;
const PERIODS = [
  ["30", "30 dias"],
  ["90", "90 dias"],
  ["365", "12 meses"],
] as const;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function PainelDoFunilPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("funil", "/funil/painel");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  // Each seller sees the numbers of their own sales; who sees the team's orders sees the team's.
  const everyone = seesAllOrders(session);
  const scope = { ownerEmail: everyone ? null : session.email };
  const days = PERIODS.find(([key]) => key === first(query.dias))?.[0] ?? "90";
  const now = new Date();
  const report = await funnelReport(new Date(now.getTime() - Number(days) * 86_400_000), scope, conn);
  // One question at a time: each part of the panel is a screen of its own.
  const TABS = [["resumo", "Resumo"], ["etapas", "Etapas"], ["perdas", "Perdas"], ...(everyone ? ([["equipe", "Equipe"]] as const) : []), ["paradas", `Paradas${report.idle > 0 ? ` (${report.idle})` : ""}`]] as const;
  const tab = TABS.find(([key]) => key === first(query.ver))?.[0] ?? "resumo";
  const hrefOf = (params: { ver?: string; dias?: string; p?: string }) => {
    const built = new URLSearchParams();
    const view = params.ver ?? tab;
    if (view !== "resumo") built.set("ver", view);
    if ((params.dias ?? days) !== "90") built.set("dias", params.dias ?? days);
    if (params.p) built.set("p", params.p);
    return built.size === 0 ? HERE : `${HERE}?${built}`;
  };
  const top = Math.max(1, ...report.reached.map((stage) => stage.count));
  const TILE = `${CARD} p-3`;

  const idle = tab === "paradas" ? await listIdleOpportunities(scope, conn) : [];
  const size = rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value);
  const slice = pageOf(idle, first(query.p), size);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("funil").href} className={QUIET_LINK}>
          ← Funil
        </Link>
      </p>
      <PageHeader title="Painel do funil" hint={`Oportunidades criadas nos últimos ${PERIODS.find(([key]) => key === days)![1]}${everyone ? " · equipe toda" : " · as suas"}`} />

      <nav aria-label="Período" className="mt-2 flex flex-wrap gap-2">
        {PERIODS.map(([key, label]) => (
          <Link
            key={key}
            href={hrefOf({ dias: key })}
            aria-current={key === days ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium ${key === days ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Partes do painel" className="mt-2 flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={hrefOf({ ver: key })}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "resumo" && (
        <section className="mt-3 grid grid-cols-2 gap-3" aria-label="Resumo">
          <p className={`${TILE} col-span-2`}>
            <span className="block text-sm text-slate-600">Vendas ganhas</span>
            <span className="block text-3xl font-bold leading-tight">{showMoney(report.wonValue)}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {report.won} de {report.created} criadas
              {report.winRate !== null && <Pill tone={report.winRate >= 0.5 ? "good" : report.winRate >= 0.25 ? "warn" : "bad"}>{showPercent(report.winRate, 0)} de aproveitamento</Pill>}
            </span>
          </p>
          <p className={TILE}>
            <span className="block text-sm text-slate-600">Em andamento</span>
            <span className="block text-xl font-semibold">{report.open}</span>
            <span className="block whitespace-nowrap text-sm text-slate-600">{showMoney(report.openValue)}</span>
          </p>
          <p className={TILE}>
            <span className="block text-sm text-slate-600">Perdidas</span>
            <span className="block text-xl font-semibold">{report.lost}</span>
            <Link href={hrefOf({ ver: "perdas" })} className={`${QUIET_LINK} text-sm`}>
              Ver motivos
            </Link>
          </p>
          <p className={TILE}>
            <span className="block text-sm text-slate-600">Tempo até ganhar</span>
            <span className="block text-xl font-semibold">{report.daysToWin === null ? "—" : `${Math.max(1, Math.round(report.daysToWin))} dia${Math.round(report.daysToWin) > 1 ? "s" : ""}`}</span>
            <span className="block text-sm text-slate-600">em média</span>
          </p>
          <p className={TILE}>
            <span className="block text-sm text-slate-600">Paradas, sem próximo passo</span>
            <span className="block text-xl font-semibold">{report.idle}</span>
            <Link href={hrefOf({ ver: "paradas" })} className={`${QUIET_LINK} text-sm`}>
              Ver quais
            </Link>
          </p>
        </section>
      )}

      {tab === "etapas" && (
        <section className={`${CARD} mt-3 p-3`} aria-label="Até onde as oportunidades chegam">
          <p className="text-sm text-slate-600">De cada 100 oportunidades criadas no período, quantas chegaram a cada etapa. Onde a barra encolhe mais é onde a venda se perde.</p>
          {report.created === 0 ? (
            <p className="mt-3 text-sm text-slate-600">Nenhuma oportunidade criada no período.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {[...report.reached, { name: "Ganho", count: report.won }].map((stage, index, list) => (
                <li key={stage.name} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                  <span className="font-medium leading-snug">{stage.name}</span>
                  <span className="h-3 rounded bg-slate-100" aria-hidden="true">
                    <span className={`block h-full rounded ${index === list.length - 1 ? "bg-emerald-600" : "bg-brand"}`} style={{ width: `${(stage.count / top) * 100}%` }} />
                  </span>
                  <span className="whitespace-nowrap text-right">
                    <strong>{stage.count}</strong> <span className="text-slate-600">· {showPercent(stage.count / report.created, 0)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "perdas" && (
        <section className={`${CARD} mt-3`} aria-label="Motivos de perda">
          {report.lostReasons.length === 0 ? (
            <p className="p-4 text-sm text-slate-600">Nenhuma venda perdida no período.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {report.lostReasons.slice(0, 8).map((item) => (
                <li key={item.reason} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 leading-snug">{item.reason}</span>
                  <span className="whitespace-nowrap font-semibold">
                    {item.count} <span className="font-normal text-slate-600">· {showPercent(item.count / report.lost, 0)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {report.lostReasons.length > 8 && <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">Mostrando os 8 motivos mais frequentes de {report.lostReasons.length}.</p>}
        </section>
      )}

      {tab === "equipe" && (
        <section className={`${CARD} mt-3`} aria-label="Por vendedor">
          {report.owners.length === 0 ? (
            <p className="p-4 text-sm text-slate-600">Nenhuma oportunidade criada no período.</p>
          ) : (
            <>
              <p className={`${SECTION_TITLE} grid grid-cols-[minmax(0,1fr)_4rem_4rem_8rem] gap-2 border-b border-slate-200 px-3 py-2`}>
                <span>Vendedor</span>
                <span className="text-right">Criadas</span>
                <span className="text-right">Ganhas</span>
                <span className="text-right">Valor ganho</span>
              </p>
              <ul className="divide-y divide-slate-200">
                {report.owners.slice(0, 10).map((owner) => (
                  <li key={owner.name} className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_8rem] items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 font-medium leading-snug">{owner.name}</span>
                    <span className="text-right">{owner.created}</span>
                    <span className="text-right">{owner.won}</span>
                    <span className="whitespace-nowrap text-right font-semibold">{showMoney(owner.wonValue)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {tab === "paradas" && (
        <section className={`${CARD} mt-3`} aria-label="Oportunidades paradas">
          {idle.length === 0 ? (
            <p className="p-4 text-sm text-slate-600">Toda oportunidade em andamento tem um próximo passo anotado.</p>
          ) : (
            <>
              <p className="border-b border-slate-200 px-3 py-2 text-sm text-slate-600">Em andamento e sem nenhuma tarefa por fazer. Abra e registre o próximo passo.</p>
              <ul id="paradas">
                {slice.rows.map((item) => (
                  <li key={item.id} data-row className="border-b border-slate-200">
                    <Link href={`${menuItem("funil").href}/${item.id}`} className="block px-3 py-2 hover:bg-slate-50">
                      <span className="block font-medium leading-snug">{item.title}</span>
                      <span className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        {opportunityParty(item)} · {item.stageName}
                        {item.estimatedValue !== null && <strong className="whitespace-nowrap text-slate-900">{showMoney(item.estimatedValue)}</strong>}
                        {everyone && <span className="text-xs">{item.ownerName}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pager {...slice} noun={["oportunidade", "oportunidades"]} hrefFor={(page) => hrefOf({ p: page > 1 ? String(page) : undefined })} />
              <FitRows listId="paradas" shown={size} />
            </>
          )}
        </section>
      )}
    </div>
  );
}

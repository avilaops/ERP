import { cookies } from "next/headers";
import Link from "next/link";
import { FitRows } from "@/components/FitRows";
import { notFound, redirect } from "next/navigation";
import { CARD, INPUT, LABEL, Pager, pageOf, PageHeader, QUIET_LINK, SECONDARY, MetricSummary, ViewTabs } from "@/components/ui";
import { NO_ACCESS_PATH, requirePermission } from "@/lib/auth";
import { allows, menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { reportOf, runReport } from "@/lib/db/reports";
import { isoDate } from "@/lib/format";
import { brDate, parsePeriod, PERIODS, personOf, showCell, showFigure } from "@/lib/reports-view";
import { rowsPerPage } from "@/lib/rows";

export const metadata = { title: `${menuItem("relatorios").label} · ERP` };
export const dynamic = "force-dynamic";

const HOME = menuItem("relatorios").href;

export default async function RelatorioPage({ params, searchParams }: { params: Promise<{ tipo: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("relatorios");
  const report = reportOf((await params).tipo);
  if (!report) notFound();
  if (!allows(session, report.item)) redirect(NO_ACCESS_PATH);

  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const today = isoDate(new Date());
  const period = report.period ? parsePeriod({ periodo: first(query.periodo), de: first(query.de), ate: first(query.ate) }, today) : { key: "tudo" as const, from: null, to: null };
  const person = personOf(report, session);
  const data = await runReport(report.key, { from: period.from, to: period.to, person, today }, tenantDb(session.tenant.slug));

  const here = `${HOME}/${report.key}`;
  const chosen = period.key === "datas" ? `de=${period.from}&ate=${period.to}` : `periodo=${period.key}`;
  const size = rowsPerPage((await cookies()).get("erp_linhas_relatorio")?.value, 1);
  const slice = pageOf(data.rows, first(query.pagina), size);
  const numeric = (index: number) => data.columns[index].kind === "money" || data.columns[index].kind === "count";
  const moneyColumn = data.columns.findIndex((column) => column.kind === "money");

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm">
        <Link href={HOME} className={QUIET_LINK}>
          ← {menuItem("relatorios").label}
        </Link>
      </p>
      <PageHeader
        title={report.title}
        hint={
          <>
            {report.hint}
            {period.from && period.to ? ` · ${brDate(period.from)} a ${brDate(period.to)}` : ""}
            {person ? " · só os seus" : ""}
          </>
        }
        actions={
          <a href={`/api/relatorios/${report.key}/exportar/${period.key === "datas" ? `${period.from}_${period.to}` : period.key}`} className={SECONDARY}>
            Exportar planilha
          </a>
        }
      />

      {report.period && (
        <>
          <ViewTabs label="Período" items={PERIODS.map((item) => ({ href: `${here}?periodo=${item.key}`, label: item.label, current: period.key === item.key }))} />
          <details className={`${CARD} mt-2`} open={period.key === "datas"}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Outro período</summary>
            <form method="get" action={here} className="flex flex-wrap items-end gap-2 border-t border-slate-200 p-3">
              <div className="basis-full sm:basis-40 sm:flex-1">
                <label htmlFor="de" className={LABEL}>
                  {report.period} de
                </label>
                <input id="de" name="de" type="date" required defaultValue={period.from ?? ""} className={INPUT} />
              </div>
              <div className="basis-full sm:basis-40 sm:flex-1">
                <label htmlFor="ate" className={LABEL}>
                  até
                </label>
                <input id="ate" name="ate" type="date" required defaultValue={period.to ?? ""} className={INPUT} />
              </div>
              <button type="submit" className={SECONDARY}>
                Ver
              </button>
            </form>
          </details>
        </>
      )}

      <MetricSummary items={data.summary.map((figure) => ({ label: figure.label, value: showFigure(figure) }))} />

      <section className={`${CARD} mt-3`} aria-label="Lista">
        {data.rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-600">Nada neste período.</p>
        ) : (
          <>
            <div id="report-rows">
            <ul className="md:hidden">
              {slice.rows.map((row, rowIndex) => (
                <li key={slice.from + rowIndex} data-row className="border-t border-slate-200 first:border-t-0">
                  <details>
                    <summary className="disclosure-heading items-start">
                      <span className="min-w-0 break-words">{showCell(row[0], data.columns[0].kind)}{moneyColumn > 0 && <span className="mt-1 block font-semibold">{showCell(row[moneyColumn], "money")}</span>}</span>
                      <span aria-hidden="true" className="disclosure-marker">+</span>
                    </summary>
                    <dl className="grid gap-3 border-t border-slate-200 p-4 text-sm">
                      {row.map((value, index) => <div key={data.columns[index].label}><dt className="text-slate-600">{data.columns[index].label}</dt><dd className="break-words font-medium">{showCell(value, data.columns[index].kind)}</dd></div>)}
                    </dl>
                  </details>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="stack-sm w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-600">
                    {data.columns.map((column, index) => (
                      <th key={column.label} scope="col" className={`px-3 py-2 font-medium ${numeric(index) ? "text-right" : ""}`}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slice.rows.map((row, rowIndex) => (
                    <tr data-row key={slice.from + rowIndex} className="border-t border-slate-200">
                      {row.map((value, index) => (
                        <td key={data.columns[index].label} data-label={data.columns[index].label} className={`px-3 py-2 ${numeric(index) ? "text-right tabular-nums" : ""}`}>
                          {showCell(value, data.columns[index].kind)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
            <Pager {...slice} noun={["linha", "linhas"]} hrefFor={(page) => `${here}?${chosen}&pagina=${page}`} />
          </>
        )}
      </section>
      <FitRows listId="report-rows" shown={size} minimum={1} cookieName="erp_linhas_relatorio" />
    </div>
  );
}

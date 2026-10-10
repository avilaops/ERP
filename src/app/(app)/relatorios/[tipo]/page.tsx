import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CARD, INPUT, LABEL, Pager, pageOf, PageHeader, QUIET_LINK, SECONDARY } from "@/components/ui";
import { NO_ACCESS_PATH, requirePermission } from "@/lib/auth";
import { allows, menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { reportOf, runReport } from "@/lib/db/reports";
import { isoDate } from "@/lib/format";
import { brDate, parsePeriod, PERIODS, personOf, showCell, showFigure } from "@/lib/reports-view";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";

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
  const slice = pageOf(data.rows, first(query.pagina), rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value));
  const numeric = (index: number) => data.columns[index].kind === "money" || data.columns[index].kind === "count";

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
          <nav aria-label="Período" className="mt-3 flex flex-wrap gap-2">
            {PERIODS.map((item) => (
              <Link
                key={item.key}
                href={`${here}?periodo=${item.key}`}
                aria-current={period.key === item.key ? "page" : undefined}
                className={`inline-flex min-h-[var(--control)] items-center rounded-full border px-3 text-sm font-medium ${period.key === item.key ? "border-brand bg-brand text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
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

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {data.summary.map((figure) => (
          <div key={figure.label} className={`${CARD} px-3 py-2`}>
            <dt className="text-xs text-slate-600">{figure.label}</dt>
            <dd className="text-lg font-semibold">{showFigure(figure)}</dd>
          </div>
        ))}
      </dl>

      <section className={`${CARD} mt-3`} aria-label="Lista">
        {data.rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-600">Nada neste período.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
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
                    <tr key={slice.from + rowIndex} className="border-t border-slate-200">
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
            <Pager {...slice} noun={["linha", "linhas"]} hrefFor={(page) => `${here}?${chosen}&pagina=${page}`} />
          </>
        )}
      </section>
    </div>
  );
}

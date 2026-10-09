import { LineTabs } from "@/components/LineTabs";
import { listLines } from "@/lib/db/product-lines";
import { LINE_PARAM, lineHref, pickLine } from "@/lib/lines-view";
import { ActionForm } from "../pedidos/ActionForm";
import { createOrderAction } from "../pedidos/actions";
import Link from "next/link";
import { cookies } from "next/headers";
import { FitRows } from "@/components/FitRows";
import { CARD, INPUT, Pager, PageHeader, pageOf, QUIET_LINK, SECONDARY, SECTION_TITLE } from "@/components/ui";
import { rowsPerPage, ROWS_COOKIE } from "@/lib/rows";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { allows, menuItem, seesCosts } from "@/lib/auth/permissions";
import { loadApprovalPolicy } from "@/lib/db/company";
import { latestVersion, listVersions, loadDiscountLimits, loadPublishedSnapshot, loadPublishedTable } from "@/lib/db/price-table";
import { showDate, showPercent } from "@/lib/format";
import { UF_NAMES } from "@/lib/order-form";
import { ORIGIN_UF, UFS } from "@/lib/pricing/states";
import type { Uf } from "@/lib/pricing/states";
import { chosenVersion, priceTableView } from "@/lib/price-table-view";

const ITEM = menuItem("tabela-precos");

export const metadata = { title: `${ITEM.label} · ERP` };
// Never reused between profiles: what is assembled for the directors has costs.
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function TabelaPrecosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("tabela-precos");
  const conn = tenantDb(session.tenant.slug);

  const query = await searchParams;
  const search = (first(query.q) ?? "").trim();
  // The profile comes from the session. Nothing in the address turns costs on.
  const costs = seesCosts(session);

  // One product line at a time: each has its own published table.
  const lines = await listLines(conn);
  const line = pickLine(lines, query[LINE_PARAM]);
  const latest = await latestVersion(conn, line.id);
  const versions = !latest ? [] : costs ? (await listVersions(conn)).filter((item) => item.lineId === line.id) : [latest];
  const version = chosenVersion(costs, first(query.v), versions);
  const table = version === null ? null : await loadPublishedTable(version, conn);
  // Costs and parameters of the version are read only for who may see them.
  const snapshot = table && costs ? await loadPublishedSnapshot(table.version, conn) : null;

  const heading = (
    <>
      <PageHeader
        title={ITEM.label}
        actions={
          costs ? (
            // The published table is never edited: the directors change the cost and publish a new version.
            <Link href={lineHref(menuItem("produtos").href, line.id)} className={`${QUIET_LINK} text-sm`}>
              Editar custos e publicar
            </Link>
          ) : undefined
        }
      />
      <LineTabs lines={lines} current={line.id} path={ITEM.href} />
    </>
  );

  if (!table) {
    return (
      <>
        {heading}
        <p className={`${CARD} mt-4 p-5 text-slate-600`}>
          Nenhuma tabela publicada ainda.
          {costs && (
            <>
              {" "}
              <Link href={menuItem("produtos").href} className="text-brand underline">
                Publicar em {menuItem("produtos").label}
              </Link>
            </>
          )}
        </p>
      </>
    );
  }

  // Who approves orders sees how far the discount may go by destination. The percentages are
  // calculated on the server from the parameters of the version; no cost and no target leave.
  const approves = allows(session, "aprovacoes");
  // Who sells opens an order straight from the line of the equipment.
  const sells = allows(session, "pedidos");
  const board = approves ? await loadDiscountLimits(table.version, conn) : null;
  // The directors' own limit is the target; the manager's is what the company lets them approve alone.
  const upTo = costs || (approves && (await loadApprovalPolicy(conn)).managerLimit === "meta") ? "atTarget" : "noLoss";
  const typedUf = (first(query.uf) ?? "").toUpperCase();
  const destinationUf: Uf = (UFS as readonly string[]).includes(typedUf) ? (typedUf as Uf) : ORIGIN_UF;
  const taxpayer = first(query.ie) === "sim";
  const chosen = board ? (board.limits.find((limit) => limit.label === board.keyOf({ uf: destinationUf, taxpayer })) ?? null) : null;
  const view = priceTableView(table, snapshot, search, chosen ? chosen[upTo] : null);
  const top = board ? Math.max(...board.limits.map((limit) => limit[upTo]), table.freeDiscount) : 0;

  // The catalogue is never drawn whole: one slice at a time, as many rows as fit the screen of who is looking.
  const size = rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value);
  const slice = pageOf(view.rows, first(query.p), size);
  // What the address keeps from one slice to the next: the line, the search and the filters.
  const kept = { q: search || undefined, v: costs && first(query.v) ? String(table.version) : undefined, uf: board && destinationUf !== ORIGIN_UF ? destinationUf : undefined, ie: board && taxpayer ? "sim" : undefined };
  const hasFilters = (costs && versions.length > 1) || board !== null;
  const filtering = kept.v !== undefined || kept.uf !== undefined || kept.ie !== undefined;
  const hasIpi = table.ipi > 0;
  // On a wide screen the two prices and the free discount are columns; the rest opens with the row.
  const NUMBER = "hidden w-28 shrink-0 text-right md:block";

  return (
    <>
      {heading}

      <section className={`${CARD} mt-3`} aria-label="Tabela publicada">
        <form method="get" action={ITEM.href} role="search" className="flex flex-wrap items-end gap-2 p-3">
          {lines.length > 1 && <input type="hidden" name={LINE_PARAM} value={line.id} />}
          <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
            Buscar equipamento
            <input type="search" name="q" defaultValue={search} placeholder="Nome ou código" className={INPUT} />
          </label>
          <button type="submit" className={SECONDARY}>
            Buscar
          </button>
          {hasFilters && (
            <details className="basis-full" open={filtering}>
              <summary className={`${QUIET_LINK} inline-block cursor-pointer py-1 text-sm`}>Filtros{filtering ? " (em uso)" : ""}</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {costs && versions.length > 1 && (
                  <label className="text-sm font-medium text-slate-700">
                    Versão da tabela
                    <select name="v" defaultValue={table.version} className={INPUT}>
                      {versions.map((item) => (
                        <option key={item.version} value={item.version}>
                          v{item.version} · {showDate(item.publishedAt)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {board && (
                  <>
                    <label className="text-sm font-medium text-slate-700">
                      Destino (para a sua alçada)
                      <select name="uf" defaultValue={destinationUf} className={INPUT}>
                        {UFS.map((uf) => (
                          <option key={uf} value={uf}>
                            {uf} — {UF_NAMES[uf]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Inscrição estadual
                      <select name="ie" defaultValue={taxpayer ? "sim" : "nao"} className={INPUT}>
                        <option value="nao">Cliente sem IE</option>
                        <option value="sim">Cliente com IE</option>
                      </select>
                    </label>
                  </>
                )}
              </div>
            </details>
          )}
        </form>
        <p className="border-t border-slate-200 px-3 py-1.5 text-xs text-slate-600">
          Tabela v{table.version} · {showDate(table.publishedAt)} · preço em destaque: {view.mainLabel}
        </p>

        {view.rows.length === 0 ? (
          <p className="border-t border-slate-200 p-5 text-slate-600">
            Nenhum equipamento encontrado para &quot;{search}&quot;.{" "}
            <Link href={lineHref(ITEM.href, line.id)} className={QUIET_LINK}>
              Limpar a busca
            </Link>
          </p>
        ) : (
          <>
            <div className={`hidden items-center gap-3 border-t border-slate-200 bg-slate-50 px-3 py-1.5 md:flex ${SECTION_TITLE}`} aria-hidden="true">
              <span className="min-w-0 flex-1">Equipamento</span>
              {hasIpi && <span className={NUMBER}>Sem IPI</span>}
              <span className="w-32 shrink-0 text-right">{hasIpi ? "Com IPI" : "Preço"}</span>
              <span className={NUMBER}>Desconto livre</span>
              <span className="w-5 shrink-0" />
              {sells && <span className="w-[5.5rem] shrink-0" />}
            </div>
            <ul id="equipamentos">
              {slice.rows.map((row) => (
                <li key={row.id} data-row className="flex items-start gap-2 border-t border-slate-200 pr-3">
                  <details className="group min-w-0 flex-1">
                    <summary className="block min-h-[var(--control)] cursor-pointer py-2 pl-3 md:flex md:items-center md:gap-3">
                      {/* The whole name, on as many lines as it needs: it is never cut. */}
                      <span className="block min-w-0 md:flex-1">
                        <span className="block font-medium leading-snug">{row.name}</span>
                        <span className="hidden text-xs text-slate-500 md:block">{row.code ?? "sem código"}</span>
                      </span>
                      <span className="mt-0.5 flex items-baseline gap-2 md:hidden">
                        <span className="text-xs text-slate-500">{row.code ?? "sem código"}</span>
                        <span className="whitespace-nowrap font-semibold">{row.main}</span>
                        <span className="text-[0.6875rem] text-slate-500">{view.mainLabel}</span>
                        <span className="ml-auto text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true">
                          ›
                        </span>
                      </span>
                      {hasIpi && <span className={NUMBER}>{row.cells[0]}</span>}
                      <span className="hidden w-32 shrink-0 whitespace-nowrap text-right font-semibold md:block">{row.main}</span>
                      <span className={NUMBER}>{row.cells[hasIpi ? 2 : 1]}</span>
                      <span className="hidden w-5 shrink-0 text-center text-slate-500 transition-transform group-open:rotate-90 md:block" aria-hidden="true">
                        ›
                      </span>
                    </summary>
                    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 pb-3 pl-3 text-sm sm:max-w-md">
                      {view.columns.map((column, index) => (
                        <div key={column} className="contents">
                          <dt className="text-slate-600">{column}</dt>
                          <dd className="whitespace-nowrap text-right font-medium">{row.cells[index]}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                  {sells && (
                    // Opens an order with one unit of this equipment, at the version on the screen.
                    <ActionForm action={createOrderAction}>
                      <input type="hidden" name="version" value={table.version} />
                      <input type="hidden" name="productId" value={row.id} />
                      <input type="hidden" name="quantity" value="1" />
                      <button
                        type="submit"
                        aria-label={`Abrir pedido com ${row.name}`}
                        className="mt-1.5 w-[5.5rem] whitespace-nowrap rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold hover:bg-slate-100"
                      >
                        + Pedido
                      </button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
            <Pager {...slice} noun={["equipamento", "equipamentos"]} hrefFor={(page) => lineHref(ITEM.href, line.id, { ...kept, p: page > 1 ? String(page) : undefined })} />
            <FitRows listId="equipamentos" shown={size} />
          </>
        )}
      </section>

      {board && (
        <details className={`${CARD} mt-3`}>
          <summary className="flex min-h-[var(--control)] cursor-pointer items-center justify-between gap-3 px-3">
            <span className={SECTION_TITLE}>{costs ? "Desconto máximo na meta, por destino" : "Sua alçada de desconto por destino"}</span>
            <span className="text-slate-500" aria-hidden="true">
              ›
            </span>
          </summary>
          <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
            Sem frete por nossa conta. A linha marca os {showPercent(table.freeDiscount, 0)} livres do vendedor. “IE …%” é venda para outro estado com cliente
            contribuinte; as siglas são cliente sem inscrição estadual naquele estado.
          </p>
          <ul className="grid gap-x-8 gap-y-1.5 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {board.limits.map((limit) => {
              const value = limit[upTo];
              return (
                <li key={limit.label} className="flex items-center gap-3 text-sm">
                  <span className="w-14 shrink-0 font-medium">{limit.label}</span>
                  <span className="relative h-2.5 flex-1 rounded bg-slate-100">
                    <span
                      className={`absolute inset-y-0 left-0 rounded ${value > table.freeDiscount + 0.0001 ? "bg-emerald-500" : "bg-slate-400"}`}
                      style={{ width: `${top > 0 ? (value / top) * 100 : 0}%` }}
                    />
                    <span className="absolute -inset-y-0.5 w-px bg-slate-700" style={{ left: `${top > 0 ? (table.freeDiscount / top) * 100 : 0}%` }} />
                  </span>
                  <span className="w-14 shrink-0 text-right font-semibold">{showPercent(value)}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </>
  );
}

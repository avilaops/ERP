import Link from "next/link";
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
  const costs = seesCosts(session.role);

  const latest = await latestVersion(conn);
  const versions = !latest ? [] : costs ? await listVersions(conn) : [latest];
  const version = chosenVersion(costs, first(query.v), versions);
  const table = version === null ? null : await loadPublishedTable(version, conn);
  // Costs and parameters of the version are read only for who may see them.
  const snapshot = table && costs ? await loadPublishedSnapshot(table.version, conn) : null;

  const heading = (
    <>
      <h1 className="text-2xl font-semibold">{ITEM.label}</h1>
      <p className="mt-1 text-slate-600">A tabela publicada, que a equipe usa para vender.</p>
    </>
  );

  if (!table) {
    return (
      <>
        {heading}
        <p className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
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
  const board = approves ? await loadDiscountLimits(table.version, conn) : null;
  // The directors' own limit is the target; the manager's is what the company lets them approve alone.
  const upTo = costs || (approves && (await loadApprovalPolicy(conn)).managerLimit === "meta") ? "atTarget" : "noLoss";
  const typedUf = (first(query.uf) ?? "").toUpperCase();
  const destinationUf: Uf = (UFS as readonly string[]).includes(typedUf) ? (typedUf as Uf) : ORIGIN_UF;
  const taxpayer = first(query.ie) === "sim";
  const chosen = board ? (board.limits.find((limit) => limit.label === board.keyOf({ uf: destinationUf, taxpayer })) ?? null) : null;
  const view = priceTableView(table, snapshot, search, chosen ? chosen[upTo] : null);
  const top = board ? Math.max(...board.limits.map((limit) => limit[upTo]), table.freeDiscount) : 0;

  return (
    <>
      {heading}

      {board && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white" aria-labelledby="alcada">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-5 py-3">
            <h2 id="alcada" className="text-sm font-semibold uppercase tracking-wide">
              {costs ? "Desconto máximo na meta, por destino" : "Sua alçada de desconto por destino"}
            </h2>
            <p className="text-xs text-slate-600">sem frete por nossa conta · a linha marca os {showPercent(table.freeDiscount, 0)} livres do vendedor</p>
          </div>
          <ul className="grid gap-x-8 gap-y-1.5 p-5 sm:grid-cols-2 xl:grid-cols-3">
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
          <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
            As linhas “IE …%” são venda para outro estado com cliente contribuinte (tem inscrição estadual), conforme o ICMS de saída para
            o destino. As siglas são cliente sem inscrição estadual naquele estado.
          </p>
        </section>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white" aria-label="Tabela publicada">
        <div className="flex flex-wrap items-end justify-between gap-4 p-4">
          <div className="flex flex-col gap-3">
            <p className="font-medium">
              Tabela v{table.version} · publicada em {showDate(table.publishedAt)}
              {snapshot && ` por ${snapshot.publishedBy}`}
            </p>
            <form method="get" action={ITEM.href} role="search" className="flex flex-wrap gap-2">
              {costs && versions.length > 1 && (
                <select
                  name="v"
                  defaultValue={table.version}
                  aria-label="Versão da tabela"
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                >
                  {versions.map((item) => (
                    <option key={item.version} value={item.version}>
                      v{item.version} · {showDate(item.publishedAt)}
                    </option>
                  ))}
                </select>
              )}
              <input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Buscar nome ou código"
                aria-label="Buscar nome ou código"
                className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm sm:w-72 sm:flex-none outline-none focus:ring-2 focus:ring-brand"
              />
              {board && (
                <>
                  <select
                    name="uf"
                    defaultValue={destinationUf}
                    aria-label="Estado de destino"
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                  >
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf} — {UF_NAMES[uf]}
                      </option>
                    ))}
                  </select>
                  <select
                    name="ie"
                    defaultValue={taxpayer ? "sim" : "nao"}
                    aria-label="Cliente tem inscrição estadual?"
                    className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="nao">Sem IE</option>
                    <option value="sim">Com IE</option>
                  </select>
                </>
              )}
              <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                {board ? "Ver" : "Buscar"}
              </button>
            </form>
          </div>
          <p className="text-xs text-slate-600">{view.counter}</p>
        </div>

        {view.rows.length === 0 ? (
          <p className="border-t border-slate-200 p-6 text-slate-600">Nenhum equipamento encontrado para &quot;{search}&quot;.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-t border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-semibold">
                    Equipamento
                  </th>
                  {view.columns.map((column) => (
                    <th key={column} scope="col" className="whitespace-nowrap px-4 py-2 text-right font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-xs text-slate-500">{row.code ?? "sem código"}</span>
                    </td>
                    {row.cells.map((cell, index) => (
                      <td
                        key={view.columns[index]}
                        className={`whitespace-nowrap px-4 py-3 text-right ${index === 0 ? "font-semibold" : ""}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

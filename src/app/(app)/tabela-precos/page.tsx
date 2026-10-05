import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesCosts } from "@/lib/auth/permissions";
import { latestVersion, listVersions, loadPublishedSnapshot, loadPublishedTable } from "@/lib/db/price-table";
import { showDate } from "@/lib/format";
import { chosenVersion, priceTableView } from "@/lib/price-table-view";

const ITEM = menuItem("tabela-precos");

export const metadata = { title: `${ITEM.label} · ERP Ludus` };
// Never reused between profiles: what is assembled for the directors has costs.
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function TabelaPrecosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("tabela-precos");

  const query = await searchParams;
  const search = (first(query.q) ?? "").trim();
  // The profile comes from the session. Nothing in the address turns costs on.
  const costs = seesCosts(session.role);

  const latest = await latestVersion();
  const versions = !latest ? [] : costs ? await listVersions() : [latest];
  const version = chosenVersion(costs, first(query.v), versions);
  const table = version === null ? null : await loadPublishedTable(version);
  // Costs and parameters of the version are read only for who may see them.
  const snapshot = table && costs ? await loadPublishedSnapshot(table.version) : null;

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
              <Link href={menuItem("produtos").href} className="text-blue-700 underline">
                Publicar em {menuItem("produtos").label}
              </Link>
            </>
          )}
        </p>
      </>
    );
  }

  const view = priceTableView(table, snapshot, search);

  return (
    <>
      {heading}

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
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
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
                className="w-72 rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                Buscar
              </button>
            </form>
          </div>
          <p className="text-xs text-slate-600">{view.counter}</p>
        </div>

        {view.rows.length === 0 ? (
          <p className="border-t border-slate-200 p-6 text-slate-600">Nenhum equipamento encontrado para &quot;{search}&quot;.</p>
        ) : (
          <div className="overflow-x-auto">
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

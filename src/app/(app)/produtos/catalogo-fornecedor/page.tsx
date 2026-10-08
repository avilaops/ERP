import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listSupplierItems } from "@/lib/db/supplier-items";
import { matchesText } from "@/lib/products-view";

export const metadata = { title: "Catálogo do fornecedor · ERP" };
export const dynamic = "force-dynamic";

const HERE = "/produtos/catalogo-fornecedor";
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function CatalogoFornecedorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  const search = (first(query.q) ?? "").trim();
  const chosen = first(query.catalogo) ?? "";

  const all = await listSupplierItems(conn);
  const catalogs = [...new Set(all.map((item) => item.catalog))];
  const items = all.filter(
    (item) => (chosen === "" || item.catalog === chosen) && (search === "" || matchesText([item.name, item.code, item.productCode, item.productName], search)),
  );
  const href = (catalog: string) => {
    const params = new URLSearchParams();
    if (catalog !== "") params.set("catalogo", catalog);
    if (search !== "") params.set("q", search);
    const text = params.toString();
    return text === "" ? HERE : `${HERE}?${text}`;
  };

  return (
    <>
      <p className="text-sm">
        <Link href={menuItem("produtos").href} className="text-brand underline">
          ← {menuItem("produtos").label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Catálogo do fornecedor</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        O que o fornecedor vende, com o código dele e o equipamento da empresa a que corresponde. Só a diretoria vê esta tela.
      </p>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Catálogo" className="flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {["", ...catalogs].map((catalog) => (
            <Link
              key={catalog}
              href={href(catalog)}
              aria-current={catalog === chosen ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 font-medium ${catalog === chosen ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {catalog === "" ? `Todos (${all.length})` : `${catalog} (${all.filter((item) => item.catalog === catalog).length})`}
            </Link>
          ))}
        </nav>
        <form method="get" action={HERE} role="search" className="flex w-full gap-2 sm:w-auto">
          {chosen !== "" && <input type="hidden" name="catalogo" value={chosen} />}
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Nome, código do fornecedor ou da empresa"
            aria-label="Buscar no catálogo do fornecedor"
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand sm:w-80 sm:flex-none"
          />
          <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
            Buscar
          </button>
        </form>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {all.length === 0 ? "O catálogo do fornecedor ainda não foi carregado." : "Nenhum item encontrado."}
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-white text-xs text-slate-400">
                {item.hasPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- served by the app itself, per company and per session
                  <img src={`/api/fornecedor-itens/${item.id}/foto`} alt="" loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  "sem foto"
                )}
              </div>
              <div className="min-w-0 text-sm">
                <p className="font-semibold leading-tight">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {item.code} · {item.catalog}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {[
                    item.lengthMm && item.widthMm && item.heightMm ? `${item.lengthMm} × ${item.widthMm} × ${item.heightMm} mm` : null,
                    item.weightKg ? `${item.weightKg} kg` : null,
                    item.loadType,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {item.productCode ? (
                  item.productId ? (
                    <Link href={`${menuItem("produtos").href}/${item.productId}`} className="mt-1 inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">
                      {item.productCode} · {item.productName}
                    </Link>
                  ) : (
                    <span className="mt-1 inline-block rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">{item.productCode} (não cadastrado)</span>
                  )
                ) : (
                  <span className="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">sem equipamento da empresa</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

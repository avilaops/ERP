import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { menuItem, seesCosts } from "@/lib/auth/permissions";
import { latestVersion, loadPublishedTable } from "@/lib/db/price-table";
import { showMoney } from "@/lib/format";
import { compareByCode } from "@/lib/products-view";
import { ActionForm } from "../ActionForm";
import { createOrderAction } from "../actions";

export const metadata = { title: "Novo pedido · ERP" };
export const dynamic = "force-dynamic";

const CARD = "mt-6 rounded-lg border border-slate-200 bg-white";

export default async function NovoPedidoPage() {
  const session = await requirePermission("pedidos", "/pedidos/novo");
  const conn = tenantDb(session.tenant.slug);

  const latest = await latestVersion(conn);
  const table = latest ? await loadPublishedTable(latest.version, conn) : null;

  const heading = (
    <>
      <h1 className="text-2xl font-semibold">Novo pedido</h1>
      <p className="mt-1 text-slate-600">
        Escolha o primeiro equipamento. O pedido recebe um número e fica salvo enquanto você preenche o resto.
      </p>
    </>
  );

  if (!table) {
    return (
      <>
        {heading}
        <p className={`${CARD} p-6 text-slate-600`}>
          Nenhuma tabela publicada ainda. Sem ela não há preço para vender.
          {seesCosts(session.role) && (
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

  const items = [...table.items].sort((a, b) => compareByCode(a, b) || a.productId - b.productId);

  return (
    <>
      {heading}
      <section className={CARD} aria-labelledby="equipamentos">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id="equipamentos" className="text-sm font-semibold uppercase tracking-wide">
            Equipamentos
          </h2>
          <p className="text-xs text-slate-600">Tabela v{table.version}</p>
        </div>
        <ActionForm action={createOrderAction} className="flex flex-wrap items-end gap-3 p-5">
          <input type="hidden" name="version" value={table.version} />
          <div className="min-w-0 flex-1">
            <label htmlFor="productId" className="block text-sm font-medium">
              Equipamento
            </label>
            <select
              id="productId"
              name="productId"
              required
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand"
            >
              {items.map((item) => (
                <option key={item.productId} value={item.productId}>
                  {[item.code, item.name, table.ipi > 0 ? `${showMoney(item.tableWithIpi)} c/ IPI` : showMoney(item.table)].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="quantity" className="block text-sm font-medium">
              Qtd
            </label>
            <input
              id="quantity"
              name="quantity"
              type="text"
              inputMode="numeric"
              defaultValue="1"
              className="mt-1 w-20 rounded border border-slate-300 px-3 py-2 text-right outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
            Adicionar
          </button>
        </ActionForm>
      </section>
    </>
  );
}

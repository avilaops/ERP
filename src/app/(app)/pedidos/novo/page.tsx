import { LineTabs } from "@/components/LineTabs";
import { listLines } from "@/lib/db/product-lines";
import { LINE_PARAM, pickLine } from "@/lib/lines-view";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { menuItem, seesCosts } from "@/lib/auth/permissions";
import { latestVersion, loadPublishedTable } from "@/lib/db/price-table";
import { showMoney } from "@/lib/format";
import { compareByCode } from "@/lib/products-view";
import { EquipmentSearch } from "../EquipmentSearch";
import { createOrderAction } from "../actions";

export const metadata = { title: "Novo pedido · ERP" };
export const dynamic = "force-dynamic";

const CARD = "mt-6 rounded-lg border border-slate-200 bg-white";

export default async function NovoPedidoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("pedidos", "/pedidos/novo");
  const conn = tenantDb(session.tenant.slug);

  // An order is of one product line: the one of the table it is opened with.
  const lines = await listLines(conn);
  const line = pickLine(lines, (await searchParams)[LINE_PARAM]);
  const latest = await latestVersion(conn, line.id);
  const table = latest ? await loadPublishedTable(latest.version, conn) : null;

  const heading = (
    <>
      <h1 className="text-2xl font-semibold">Novo pedido</h1>
      <p className="mt-1 text-slate-600">
        Busque o primeiro equipamento. O pedido recebe um número e abre inteiro numa tela só: itens, cliente, desconto e pagamento.
      </p>
      <LineTabs lines={lines} current={line.id} path="/pedidos/novo" />
      {lines.length > 1 && <p className="mt-2 text-sm text-slate-600">O pedido é de uma linha só: os equipamentos e os preços são os da linha {line.name}.</p>}
    </>
  );

  if (!table) {
    return (
      <>
        {heading}
        <p className={`${CARD} p-6 text-slate-600`}>
          Nenhuma tabela publicada ainda. Sem ela não há preço para vender.
          {seesCosts(session) && (
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
        <EquipmentSearch
          version={table.version}
          action={createOrderAction}
          items={items.map((item) => ({
            id: item.productId,
            name: item.name,
            code: item.code,
            price: table.ipi > 0 ? `${showMoney(item.tableWithIpi)} c/ IPI` : showMoney(item.table),
          }))}
        />
      </section>
    </>
  );
}

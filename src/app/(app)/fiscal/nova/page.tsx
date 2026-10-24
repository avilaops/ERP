import { cookies } from "next/headers";
import Link from "next/link";
import { FitRows } from "@/components/FitRows";
import { CARD, EmptyState, PageHeader, Pager, Pill, PRIMARY, SECONDARY, pageOf } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { loadFiscalSettings } from "@/lib/db/fiscal";
import { listFiscalOverview } from "@/lib/db/fiscal-overview";
import { tenantDb } from "@/lib/db/pool";
import { showDateTime } from "@/lib/format";
import { rowsPerPage } from "@/lib/rows";

export const metadata = { title: "Nova nota fiscal · ERP" };
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

/**
 * A NF-e always starts from a closed order. This keeps customer, items,
 * prices and fiscal rules tied to the commercial document that created them.
 */
export default async function NewFiscalInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("fiscal");
  const conn = tenantDb(session.tenant.slug);
  const [settings, query, store] = await Promise.all([loadFiscalSettings(conn), searchParams, cookies()]);
  const overview = await listFiscalOverview({ sellerEmail: seesAllOrders(session) ? null : session.email, environment: settings.environment }, conn);
  const candidates = overview.orders.filter((order) => order.stage === "emitir");
  const size = rowsPerPage(store.get("erp_nova_nota_linhas")?.value, 1);
  const slice = pageOf(candidates, first(query.pagina), size);

  return (
    <>
      <PageHeader
        title="Nova nota fiscal"
        hint="Escolha o pedido fechado que será faturado. Cliente, itens e valores permanecem vinculados ao pedido."
        actions={<Link href="/fiscal" className={SECONDARY}>Voltar ao Fiscal</Link>}
      />
      <section className={`${CARD} mt-3`} aria-labelledby="pedidos-para-faturar">
        <h2 id="pedidos-para-faturar" className="border-b border-slate-200 px-4 py-3 text-sm font-semibold uppercase tracking-wide">Pedidos prontos para faturar</h2>
        {slice.rows.length === 0 ? (
          <EmptyState
            title="Nenhum pedido pronto para emitir"
            description="Feche o pedido comercial para que ele apareça aqui e possa gerar uma nota fiscal."
            action={<Link href="/pedidos?aba=fechados" className={PRIMARY}>Ver pedidos fechados</Link>}
          />
        ) : (
          <ul id="fiscal-nova-list" className="divide-y divide-slate-200">
            {slice.rows.map((order) => (
              <li data-row key={order.orderId} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="font-semibold">{order.customerName}</p>
                  <p className="break-words text-sm text-slate-700">Pedido #{order.orderNumber}</p>
                  <p className="text-xs text-slate-600">Fechado em {showDateTime(order.closedAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Pill tone="warn">A emitir</Pill>
                  <Link href={`/pedidos/${order.orderNumber}/fiscal`} className={PRIMARY}>Preparar nota</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pager {...slice} noun={["pedido", "pedidos"]} hrefFor={(number) => `/fiscal/nova${number > 1 ? `?pagina=${number}` : ""}`} />
      </section>
      <FitRows listId="fiscal-nova-list" shown={size} minimum={1} cookieName="erp_nova_nota_linhas" />
    </>
  );
}

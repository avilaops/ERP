import { cookies } from "next/headers";
import Link from "next/link";
import { PurchasesGrid } from "@/components/PurchasesGrid";
import { CARD, EmptyState, INPUT, LABEL, Pager, pageOf, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listPurchases, PURCHASE_KINDS, PURCHASE_STATUS } from "@/lib/db/purchases";
import type { PurchaseSort } from "@/lib/db/purchases";
import { listSuppliers } from "@/lib/db/suppliers";
import { isoDate, showIsoDate, showMoney } from "@/lib/format";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";
import { ActionForm } from "../pedidos/ActionForm";
import { createPurchaseAction, createPurchaseSupplierAction } from "./actions";
import { PurchaseFields } from "./PurchaseFields";

export const metadata = { title: `${menuItem("compras").label} · ERP` };
export const dynamic = "force-dynamic";

const HERE = menuItem("compras").href;
const TONE = { pedido: "neutral", em_transito: "warn", recebida: "good", cancelada: "neutral" } as const;
const SORTS: PurchaseSort[] = ["fornecedor", "tipo", "situacao", "pedido", "chegada", "pecas", "total"];

export default async function ComprasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("compras");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  // One task at a time: the list is the default, and the form only opens after an explicit action.
  const adding = first(query.nova) === "1";
  const supplierMode = first(query.fornecedor);
  const selectedSupplierId = /^\d+$/.test(supplierMode ?? "") ? Number(supplierMode) : undefined;

  if (adding) {
    const suppliers = await listSuppliers(conn);
    const active = suppliers.filter((supplier) => supplier.active).map((supplier) => ({ id: supplier.id, name: supplier.tradeName ?? supplier.name }));
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm"><Link href={HERE} className={QUIET_LINK}>← {menuItem("compras").label}</Link></p>
        <PageHeader title={supplierMode === "novo" ? "Novo fornecedor" : "Nova compra"} hint={supplierMode === "novo" ? "Cadastre o fornecedor e volte à compra com ele selecionado." : "Primeiro quem vende, a moeda e as datas. Os equipamentos e os custos entram na tela seguinte."} />
        {supplierMode === "novo" ? (
          <ActionForm action={createPurchaseSupplierAction} className={`${CARD} mt-3 grid gap-3 p-4 sm:grid-cols-2`}>
            <label className={LABEL}>Tipo<select name="kind" className={INPUT} defaultValue="PJ"><option value="PJ">Empresa (CNPJ)</option><option value="PF">Pessoa física (CPF)</option><option value="EX">Exterior</option></select></label>
            <label className={LABEL}>Nome ou razão social<input name="name" className={INPUT} required autoComplete="organization" /></label>
            <label className={LABEL}>CNPJ, CPF ou identificação fiscal<input name="document" className={INPUT} autoComplete="off" /></label>
            <label className={LABEL}>País (só para exterior)<input name="country" className={INPUT} autoComplete="country-name" /></label>
            <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" className={PRIMARY}>Cadastrar e usar</button><Link href={`${HERE}?nova=1`} className={SECONDARY}>Voltar à compra</Link></div>
          </ActionForm>
        ) : (
          <ActionForm action={createPurchaseAction} className={`${CARD} mt-3 flex flex-wrap items-end gap-3 p-4`}>
            <PurchaseFields saved={null} suppliers={active} today={isoDate(new Date())} selectedSupplierId={selectedSupplierId} />
            {active.length === 0 && <p className="basis-full text-sm text-slate-600">Cadastre o primeiro fornecedor nesta tela para liberar a compra.</p>}
            <div className="basis-full">
              <button type="submit" className={PRIMARY} disabled={active.length === 0}>
                Criar compra
              </button>
            </div>
          </ActionForm>
        )}
      </div>
    );
  }

  const requestedSort = first(query.ordenar);
  const sort: PurchaseSort = SORTS.includes(requestedSort as PurchaseSort) ? requestedSort as PurchaseSort : "pedido";
  const direction = first(query.direcao) === "asc" ? "asc" : "desc";
  const purchases = await listPurchases(conn, sort, direction);
  const slice = pageOf(purchases, first(query.pagina), rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value));
  const open = purchases.filter((purchase) => purchase.status === "pedido" || purchase.status === "em_transito");
  const sortHref = (next: PurchaseSort) => {
    const params = new URLSearchParams();
    params.set("ordenar", next);
    params.set("direcao", sort === next && direction === "asc" ? "desc" : "asc");
    return `${HERE}?${params}`;
  };
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ ordenar: sort, direcao: direction, pagina: String(page) });
    return `${HERE}?${params}`;
  };
  const sortHrefs = {
    supplier: sortHref("fornecedor"), kind: sortHref("tipo"), status: sortHref("situacao"), orderedOn: sortHref("pedido"),
    arrival: sortHref("chegada"), pieces: sortHref("pecas"), total: sortHref("total"),
  };
  const rows = slice.rows.map((purchase) => ({
    id: purchase.id,
    supplier: purchase.supplier,
    kind: PURCHASE_KINDS.find(([key]) => key === purchase.kind)?.[1] ?? purchase.kind,
    status: purchase.status,
    statusLabel: PURCHASE_STATUS[purchase.status],
    orderedOn: showIsoDate(purchase.orderedOn),
    arrival: purchase.receivedOn ? showIsoDate(purchase.receivedOn) : purchase.expectedOn ? `Prevista ${showIsoDate(purchase.expectedOn)}` : "—",
    pieces: String(purchase.pieces),
    total: showMoney(purchase.total),
    detail: purchase.reference ?? "",
  }));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={menuItem("compras").label}
        hint={`${open.length} a caminho · ${showMoney(open.reduce((sum, purchase) => sum + purchase.total, 0))} em mercadoria e custos`}
        actions={
          <Link href={`${HERE}?nova=1`} className={PRIMARY}>
            + Nova compra
          </Link>
        }
      />
      <section className={`${CARD} mt-3 list-screen`} aria-label="Compras realizadas">
        {rows.length === 0 ? <EmptyState title="Nenhuma compra cadastrada" description="As compras realizadas aparecerão nesta tabela." action={<Link href={`${HERE}?nova=1`} className={PRIMARY}>+ Nova compra</Link>} /> : <div className="list-results">
          <ul className="md:hidden">{rows.map((row) => <li key={row.id} className="border-t border-slate-200 first:border-t-0"><Link href={`${HERE}/${row.id}`} className="block px-4 py-3 active:bg-slate-50"><span className="flex items-start justify-between gap-3"><span className="font-medium text-brand underline">{row.supplier}</span><Pill tone={TONE[row.status]}>{row.statusLabel}</Pill></span><span className="mt-1 block text-xs text-slate-500">{row.kind} · pedido em {row.orderedOn}</span><span className="mt-2 block text-sm">{row.pieces} peça(s) · {row.total} · chegada {row.arrival.toLowerCase()}</span></Link></li>)}</ul>
          <PurchasesGrid rows={rows} sortHrefs={sortHrefs} sort={sort} direction={direction} />
        </div>}
        <Pager {...slice} noun={["compra", "compras"]} hrefFor={pageHref} />
      </section>
    </div>
  );
}

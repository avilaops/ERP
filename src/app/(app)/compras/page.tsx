import { cookies } from "next/headers";
import Link from "next/link";
import { CARD, INPUT, LABEL, Pager, pageOf, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listPurchases, PURCHASE_KINDS, PURCHASE_STATUS } from "@/lib/db/purchases";
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

export default async function ComprasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("compras");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const [purchases, suppliers] = await Promise.all([listPurchases(conn), listSuppliers(conn)]);
  const active = suppliers.filter((supplier) => supplier.active).map((supplier) => ({ id: supplier.id, name: supplier.tradeName ?? supplier.name }));
  // One task at a time: the list, or the form of a new purchase. With none yet, the form comes first.
  const adding = first(query.nova) === "1" || purchases.length === 0;
  const supplierMode = first(query.fornecedor);
  const selectedSupplierId = /^\d+$/.test(supplierMode ?? "") ? Number(supplierMode) : undefined;

  if (adding) {
    return (
      <div className="mx-auto max-w-3xl">
        {purchases.length > 0 && (
          <p className="text-sm">
            <Link href={HERE} className={QUIET_LINK}>
              ← {menuItem("compras").label}
            </Link>
          </p>
        )}
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

  const slice = pageOf(purchases, first(query.pagina), rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value));
  const open = purchases.filter((purchase) => purchase.status === "pedido" || purchase.status === "em_transito");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={menuItem("compras").label}
        hint={`${open.length} a caminho · ${showMoney(open.reduce((sum, purchase) => sum + purchase.total, 0))} em mercadoria e custos`}
        actions={
          <Link href={`${HERE}?nova=1`} className={PRIMARY}>
            + Nova compra
          </Link>
        }
      />
      <section className={`${CARD} mt-3`} aria-label="Compras">
        <table className="stack-sm w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-600">
              <th scope="col" className="px-3 py-2 font-medium">Compra</th>
              <th scope="col" className="px-3 py-2 font-medium">Situação</th>
              <th scope="col" className="px-3 py-2 font-medium">Chegada</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Peças</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {slice.rows.map((purchase) => (
              <tr key={purchase.id} className="border-t border-slate-200">
                <td className="px-3 py-2">
                  <Link href={`${HERE}/${purchase.id}`} className="font-medium text-brand underline">
                    {purchase.supplier}
                  </Link>
                  <span className="block text-xs text-slate-500">
                    {[PURCHASE_KINDS.find(([key]) => key === purchase.kind)?.[1], purchase.reference, `pedido em ${showIsoDate(purchase.orderedOn)}`].filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td data-label="Situação" className="px-3 py-2">
                  <Pill tone={TONE[purchase.status]}>{PURCHASE_STATUS[purchase.status]}</Pill>
                </td>
                <td data-label="Chegada" className="px-3 py-2">
                  {purchase.receivedOn ? showIsoDate(purchase.receivedOn) : purchase.expectedOn ? `prevista ${showIsoDate(purchase.expectedOn)}` : "—"}
                </td>
                <td data-label="Peças" className="px-3 py-2 text-right tabular-nums">{purchase.pieces}</td>
                <td data-label="Total" className="px-3 py-2 text-right tabular-nums">{showMoney(purchase.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pager {...slice} noun={["compra", "compras"]} hrefFor={(page) => `${HERE}?pagina=${page}`} />
      </section>
    </div>
  );
}

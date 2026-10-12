import { cookies } from "next/headers";
import Link from "next/link";
import { CARD, Pager, pageOf, PageHeader, Pill, PRIMARY, QUIET_LINK } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listPurchases, PURCHASE_KINDS, PURCHASE_STATUS } from "@/lib/db/purchases";
import { listSuppliers } from "@/lib/db/suppliers";
import { isoDate, showIsoDate, showMoney } from "@/lib/format";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";
import { ActionForm } from "../pedidos/ActionForm";
import { createPurchaseAction } from "./actions";
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
        <PageHeader title="Nova compra" hint="Primeiro quem vende, a moeda e as datas. Os equipamentos e os custos entram na tela seguinte." />
        {active.length === 0 ? (
          <p className={`${CARD} mt-3 p-4 text-sm`}>
            Cadastre antes o fornecedor em{" "}
            <Link href={menuItem("fornecedores").href} className="text-brand underline">
              {menuItem("fornecedores").label}
            </Link>
            .
          </p>
        ) : (
          <ActionForm action={createPurchaseAction} className={`${CARD} mt-3 flex flex-wrap items-end gap-3 p-4`}>
            <PurchaseFields saved={null} suppliers={active} today={isoDate(new Date())} />
            <div className="basis-full">
              <button type="submit" className={PRIMARY}>
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

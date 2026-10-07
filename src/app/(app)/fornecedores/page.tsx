import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { formatDocument } from "@/lib/customer";
import { tenantDb } from "@/lib/db/pool";
import { listSuppliers, SUPPLIER_KIND_LABELS } from "@/lib/db/suppliers";
import { ActionForm } from "../pedidos/ActionForm";
import { createSupplierAction } from "./actions";
import { SupplierFields } from "./SupplierFields";

export const metadata = { title: `${menuItem("fornecedores").label} · ERP` };
export const dynamic = "force-dynamic";

const HERE = menuItem("fornecedores").href;
const CARD = "rounded-lg border border-slate-200 bg-white";

export default async function FornecedoresPage() {
  const session = await requirePermission("fornecedores");
  const conn = tenantDb(session.tenant.slug);
  const suppliers = await listSuppliers(conn);

  return (
    <>
      <h1 className="text-2xl font-semibold">{menuItem("fornecedores").label}</h1>
      <p className="mt-1 text-slate-600">Quem a empresa paga: fábrica, transportadora, prestadores. Usados nas contas a pagar.</p>

      <details className={`${CARD} mt-6`} open={suppliers.length === 0}>
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold uppercase tracking-wide">+ Novo fornecedor</summary>
        <ActionForm action={createSupplierAction} className="grid gap-4 border-t border-slate-200 p-5 sm:grid-cols-2">
          <SupplierFields saved={null} />
          <div className="sm:col-span-2 sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
            <button type="submit" className="w-full rounded bg-brand px-4 py-3 font-medium text-white hover:bg-brand-dark md:w-auto md:py-2">
              Salvar fornecedor
            </button>
          </div>
        </ActionForm>
      </details>

      <section className={`${CARD} mt-6`} aria-labelledby="lista">
        <h2 id="lista" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Cadastrados ({suppliers.length})
        </h2>
        {suppliers.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nenhum fornecedor cadastrado ainda.</p>
        ) : (
          <ul>
            {suppliers.map((supplier) => (
              <li key={supplier.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 first:border-t-0">
                <div className="min-w-0">
                  <Link href={`${HERE}/${supplier.id}`} className="font-medium text-brand underline-offset-2 hover:underline">
                    {supplier.tradeName ?? supplier.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {[
                      SUPPLIER_KIND_LABELS[supplier.kind],
                      supplier.kind === "EX" ? supplier.country : supplier.document && formatDocument(supplier.document),
                      supplier.contactName,
                      supplier.phone,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {!supplier.active && <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">Desligado</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

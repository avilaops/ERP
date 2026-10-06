import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { getSupplier } from "@/lib/db/suppliers";
import { showDateTime } from "@/lib/format";
import { ActionForm } from "../../pedidos/ActionForm";
import { updateSupplierAction } from "../actions";
import { SupplierFields } from "../SupplierFields";

export const metadata = { title: "Fornecedor · ERP" };
export const dynamic = "force-dynamic";

export default async function FornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission("fornecedores");
  const conn = tenantDb(session.tenant.slug);
  const supplier = /^[1-9]\d{0,8}$/.test(id) ? await getSupplier(Number(id), conn) : null;
  if (!supplier) notFound();

  return (
    <>
      <p className="text-sm">
        <Link href={menuItem("fornecedores").href} className="text-brand underline">
          ← {menuItem("fornecedores").label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">{supplier.tradeName ?? supplier.name}</h1>
      <p className="mt-1 text-sm text-slate-600">Alterado em {showDateTime(supplier.updatedAt)}</p>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white">
        <ActionForm action={updateSupplierAction} className="grid gap-4 p-5 sm:grid-cols-2">
          <input type="hidden" name="id" value={supplier.id} />
          <input type="hidden" name="hasActive" value="1" />
          <SupplierFields saved={supplier} />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="active" value="sim" defaultChecked={supplier.active} /> Em uso (desmarcado, sai das listas de lançamento)
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
              Salvar alterações
            </button>
          </div>
        </ActionForm>
      </section>
    </>
  );
}

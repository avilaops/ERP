import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { listProducts } from "@/lib/db/products";
import { listSupplierItems } from "@/lib/db/supplier-items";
import { ActionForm } from "../../../pedidos/ActionForm";
import { ConfirmButton } from "../../../pedidos/ConfirmButton";
import { deleteSupplierItemAction, updateSupplierItemAction } from "../actions";
import { BOTTOM_BAR, ItemFields } from "../ItemFields";

export const metadata = { title: "Item do fornecedor · ERP" };
export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);
  const all = await listSupplierItems(conn);
  const products = (await listProducts({}, conn)).flatMap((product) => (product.code ? [{ code: product.code, name: product.name }] : []));
  const suppliers = [...new Set(all.map((item) => item.supplier))];
  const catalogs = [...new Set(all.map((item) => item.catalog))];
  const item = /^[1-9]\d{0,8}$/.test(id) ? all.find((entry) => entry.id === Number(id)) : undefined;
  if (!item) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-3">
        <Link href="/produtos/catalogo-fornecedor" aria-label="Voltar para o catálogo do fornecedor" className="shrink-0 rounded-lg bg-brand-soft px-3 py-1.5 text-xl text-brand">
          ←
        </Link>
        <h1 className="min-w-0 truncate text-2xl font-semibold">{item.code} · {item.name}</h1>
      </div>
      <ActionForm action={updateSupplierItemAction} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="id" value={item.id} />
        <ItemFields saved={item} products={products} suppliers={suppliers} catalogs={catalogs} />
        <div className={BOTTOM_BAR}>
          <button type="submit" className="rounded-lg bg-brand px-4 py-3.5 text-base font-semibold text-white hover:bg-brand-dark">
            Salvar
          </button>
        </div>
      </ActionForm>
      <ActionForm action={deleteSupplierItemAction} className="mt-4">
        <input type="hidden" name="id" value={item.id} />
        <ConfirmButton label="Remover item" confirmLabel="Confirmar: remover" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />
      </ActionForm>
    </div>
  );
}

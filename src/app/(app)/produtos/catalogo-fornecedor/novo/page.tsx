import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { listProducts } from "@/lib/db/products";
import { listSupplierItems } from "@/lib/db/supplier-items";
import { ActionForm } from "../../../pedidos/ActionForm";
import { createSupplierItemAction } from "../actions";
import { BOTTOM_BAR, ItemFields } from "../ItemFields";

export const metadata = { title: "Novo item do fornecedor · ERP" };
export const dynamic = "force-dynamic";

export default async function NovoItemPage() {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);
  const all = await listSupplierItems(conn);
  const products = (await listProducts({}, conn)).flatMap((product) => (product.code ? [{ code: product.code, name: product.name }] : []));
  const suppliers = [...new Set(all.map((item) => item.supplier))];
  const catalogs = [...new Set(all.map((item) => item.catalog))];

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-3">
        <Link href="/produtos/catalogo-fornecedor" aria-label="Voltar para o catálogo do fornecedor" className="shrink-0 rounded-lg bg-brand-soft px-3 py-1.5 text-xl text-brand">
          ←
        </Link>
        <h1 className="min-w-0 truncate text-2xl font-semibold">Novo item do fornecedor</h1>
      </div>
      <ActionForm action={createSupplierItemAction} className="mt-4 flex flex-col gap-4">
        <ItemFields saved={null} products={products} suppliers={suppliers} catalogs={catalogs} />
        <div className={BOTTOM_BAR}>
          <button type="submit" className="rounded-lg bg-brand px-4 py-3.5 text-base font-semibold text-white hover:bg-brand-dark">
            Adicionar ao catálogo
          </button>
        </div>
      </ActionForm>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listProducts } from "@/lib/db/products";
import { productToForm } from "@/lib/product-form";
import { deleteProductAction, saveProductScreenAction, setProductActiveAction } from "../actions";
import { ProductScreen } from "../ProductScreen";

export const metadata = { title: "Equipamento · ERP" };
export const dynamic = "force-dynamic";

export default async function EquipamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);
  const product = /^[1-9]\d{0,8}$/.test(id) ? (await listProducts({}, conn)).find((item) => item.id === Number(id)) : undefined;
  if (!product) notFound();

  return (
    <>
      <div className="mx-auto max-w-xl">
        <Link href={menuItem("produtos").href} aria-label="Voltar para Produtos e custos" className="inline-block rounded-lg bg-brand-soft px-4 py-2 text-xl text-brand">
          ←
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">{product.name}</h1>
        {!product.active && <p className="mt-1 text-sm text-slate-600">Desativado: fora da tabela e das listas.</p>}
      </div>
      <div className="mt-6">
        <ProductScreen
          key={`${product.id}-${product.active}`}
          id={product.id}
          saved={productToForm(product)}
          // The route answers with an ETag, so a changed photo is fetched again.
          photo={product.hasPhoto ? `/api/produtos/${product.id}/foto` : null}
          active={product.active}
          save={saveProductScreenAction}
          setActive={setProductActiveAction}
          remove={deleteProductAction}
        />
      </div>
    </>
  );
}

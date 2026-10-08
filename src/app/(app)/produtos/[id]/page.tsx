import { listLines } from "@/lib/db/product-lines";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { loadProductFiscal, PRODUCT_ORIGINS } from "@/lib/db/fiscal";
import { listSupplierItemsOf } from "@/lib/db/supplier-items";
import { tenantDb } from "@/lib/db/pool";
import { listProducts } from "@/lib/db/products";
import { productToForm } from "@/lib/product-form";
import { saveProductFiscalAction } from "../../parametros/fiscal/actions";
import { ActionForm } from "../../pedidos/ActionForm";
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
  const lines = await listLines(conn);
  const fiscal = await loadProductFiscal(product.id, conn);
  const fromSupplier = await listSupplierItemsOf(product.code, conn);

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
          lines={lines}
          lineId={product.lineId}
          save={saveProductScreenAction}
          setActive={setProductActiveAction}
          remove={deleteProductAction}
        />
      </div>

      {fromSupplier.length > 0 && (
        <section className="mx-auto mt-6 max-w-xl rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4" aria-label="No fornecedor">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-indigo-900">No fornecedor · só a diretoria vê</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {fromSupplier.map((item) => (
              <li key={item.id} className="flex gap-3 text-sm">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded bg-white text-xs text-slate-400">
                  {item.hasPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served by the app itself, per company and per session
                    <img src={`/api/fornecedor-itens/${item.id}/foto`} alt="" loading="lazy" className="h-full w-full object-contain" />
                  ) : (
                    "sem foto"
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">
                    {item.code} · {item.name}
                  </p>
                  <p className="text-xs text-slate-600">
                    {item.supplier} · {item.catalog}
                  </p>
                  <p className="text-xs text-slate-600">
                    {[
                      item.lengthMm && item.widthMm && item.heightMm ? `${item.lengthMm} × ${item.widthMm} × ${item.heightMm} mm` : null,
                      item.weightKg ? `${item.weightKg} kg` : null,
                      item.loadType,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fiscal && (
        <details className="mx-auto mt-6 max-w-xl rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 font-medium">Dados fiscais: NCM, origem e unidade</summary>
          <ActionForm action={saveProductFiscalAction} className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={product.id} />
            <div>
              <label htmlFor="ncm" className="block text-sm font-medium">
                NCM (8 dígitos)
              </label>
              <input id="ncm" name="ncm" type="text" inputMode="numeric" defaultValue={fiscal.ncm ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label htmlFor="unit" className="block text-sm font-medium">
                Unidade
              </label>
              <input id="unit" name="unit" type="text" defaultValue={fiscal.unit} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="origin" className="block text-sm font-medium">
                Origem da mercadoria
              </label>
              <select key={fiscal.origin ?? ""} id="origin" name="origin" defaultValue={fiscal.origin ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand">
                <option value="">—</option>
                {PRODUCT_ORIGINS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cest" className="block text-sm font-medium">
                CEST (7 dígitos, se houver)
              </label>
              <input id="cest" name="cest" type="text" inputMode="numeric" defaultValue={fiscal.cest ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 font-medium hover:bg-slate-50">
                Salvar dados fiscais
              </button>
            </div>
          </ActionForm>
        </details>
      )}
    </>
  );
}

import type { SupplierItem } from "@/lib/db/supplier-items";

const INPUT = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-brand";
const LABEL = "block font-medium";

/** The buttons kept in reach at the bottom of a phone while the fields scroll. */
export const BOTTOM_BAR =
  "sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:bg-transparent md:px-0";

/**
 * One item of the supplier's catalogue on one screen: photo, the supplier's
 * code and name, the company's equipment it corresponds to, and the rest folded
 * away. A server component: `products` are the codes of the company's own equipment.
 */
export function ItemFields({
  saved,
  products,
  suppliers,
  catalogs,
}: {
  saved: SupplierItem | null;
  products: { code: string; name: string }[];
  suppliers: string[];
  catalogs: string[];
}) {
  const text = (key: string, label: string, value: string | number | null | undefined, extra: { list?: string; numeric?: boolean } = {}) => (
    <div>
      <label htmlFor={key} className={LABEL}>
        {label}
      </label>
      <input id={key} name={key} type="text" inputMode={extra.numeric ? "decimal" : undefined} list={extra.list} defaultValue={value ?? ""} autoComplete="off" className={INPUT} />
    </div>
  );
  // A code linked before and not in the list any more (equipment removed) stays visible, so saving does not drop it silently.
  const orphan = saved?.productCode && !products.some((product) => product.code === saved.productCode) ? saved.productCode : null;

  return (
    <>
      <div className="flex items-center gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-white text-xs text-slate-500">
          {saved?.hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by the app itself, per company and per session
            <img src={`/api/fornecedor-itens/${saved.id}/foto`} alt="" className="h-full w-full object-contain" />
          ) : (
            "sem foto"
          )}
        </div>
        <div className="min-w-0">
          <label htmlFor="photo" className={LABEL}>
            {saved?.hasPhoto ? "Trocar foto" : "Foto"}
          </label>
          <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 w-full text-sm" />
        </div>
      </div>

      {text("name", "Nome no fornecedor", saved?.name)}
      {text("code", "Código do fornecedor", saved?.code)}
      <div>
        <label htmlFor="productCode" className={LABEL}>
          Equipamento da empresa
        </label>
        <select id="productCode" name="productCode" defaultValue={saved?.productCode ?? ""} className={INPUT}>
          <option value="">Fora do catálogo da empresa</option>
          {orphan && <option value={orphan}>{orphan} (não cadastrado)</option>}
          {products.map((product) => (
            <option key={product.code} value={product.code}>
              {product.code} · {product.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">É o vínculo entre o código do fornecedor e o código da empresa. Só a diretoria vê.</p>
      </div>
      {text("supplier", "Fornecedor", saved?.supplier ?? suppliers[0], { list: "fornecedores" })}
      {text("catalog", "Catálogo do fornecedor", saved?.catalog ?? catalogs[0], { list: "catalogos" })}
      <datalist id="fornecedores">
        {suppliers.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <datalist id="catalogos">
        {catalogs.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 font-medium">Mais dados: medidas, peso e descrição</summary>
        <div className="flex flex-col gap-4 border-t border-slate-200 p-4">
          <div className="grid grid-cols-3 gap-3">
            {text("lengthMm", "Compr. (mm)", saved?.lengthMm, { numeric: true })}
            {text("widthMm", "Largura (mm)", saved?.widthMm, { numeric: true })}
            {text("heightMm", "Altura (mm)", saved?.heightMm, { numeric: true })}
          </div>
          {text("weightKg", "Peso (kg)", saved?.weightKg, { numeric: true })}
          {text("line", "Linha", saved?.line)}
          {text("loadType", "Tipo de carga", saved?.loadType)}
          <div>
            <label htmlFor="description" className={LABEL}>
              Descrição
            </label>
            <textarea id="description" name="description" rows={4} defaultValue={saved?.description ?? ""} className={INPUT} />
          </div>
        </div>
      </details>
    </>
  );
}

import Link from "next/link";
import { ActionForm } from "../pedidos/ActionForm";
import { INPUT, PRIMARY } from "@/components/ui";
import type { ProductRowData } from "../produtos/ProductRow";
import type { ActionState } from "@/lib/order-form";

export function CostRow({ row, imported, action, productHref }: { row: ProductRowData; imported: boolean; action: (state: ActionState, formData: FormData) => Promise<ActionState>; productHref?: string }) {
  return <tr className="border-t border-slate-200 align-top">
    <td className="px-3 py-3">{productHref ? <Link href={productHref} className="break-words font-medium text-brand underline">{row.values.name}</Link> : <strong className="break-words font-medium">{row.values.name}</strong>}<span className="block text-xs text-slate-500">{row.values.code || "sem código"} · {row.supplier} · {row.ncm}</span></td>
    <td colSpan={6} className="p-0"><ActionForm action={action} className="grid grid-cols-6 items-start">
      <input type="hidden" name="id" value={row.id} /><input type="hidden" name="wording" value={imported ? "importada" : "nacional"} />
      <div className="px-2 py-3"><input name="advisoryCost" defaultValue={row.values.advisoryCost} inputMode="decimal" aria-label={`Custo de ${row.values.name}`} className={`${INPUT} text-right`} /></div>
      <div className="px-2 py-3"><input name="taxCredit" defaultValue={row.values.taxCredit} inputMode="decimal" aria-label={`Crédito tributário de ${row.values.name}`} className={`${INPUT} text-right`} /></div>
      <div className="px-2 py-3"><input name="packaging" defaultValue={row.values.packaging} inputMode="decimal" aria-label={`Embalagem de ${row.values.name}`} className={`${INPUT} text-right`} /></div>
      <div className="whitespace-nowrap px-2 py-3 text-right"><span className="block text-xs text-slate-500">Custo real {row.realCost}</span><strong>{row.table}</strong>{row.tableWithIpi && <span className="block text-xs text-slate-500">Com IPI {row.tableWithIpi}</span>}</div>
      <div className="whitespace-nowrap px-2 py-3 text-right text-xs">SP {row.maxSp}<span className="block">Contribuinte {row.maxTaxpayer}</span></div>
      <div className="px-2 py-3 text-right"><button type="submit" className={PRIMARY}>Salvar</button></div>
    </ActionForm></td>
  </tr>;
}

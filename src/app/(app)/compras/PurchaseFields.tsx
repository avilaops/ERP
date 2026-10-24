import Link from "next/link";
import { FormSections } from "@/components/FormSections";
import { INPUT, LABEL } from "@/components/ui";
import { CURRENCIES, PURCHASE_KINDS } from "@/lib/db/purchases";
import type { Purchase } from "@/lib/db/purchases";

/** The head of a purchase: who sells, in which currency and when. The same fields for a new one and for one on file. */
export function PurchaseFields({ saved, suppliers, today, selectedSupplierId }: { saved: Purchase | null; suppliers: { id: number; name: string }[]; today: string; selectedSupplierId?: number }) {
  const field = "min-w-0";
  const identification = <div className="grid gap-3 sm:grid-cols-2">
      <div className={field}>
        <span className="flex items-center justify-between gap-2"><label htmlFor="supplierId" className={LABEL}>Fornecedor</label><Link href="/compras?nova=1&fornecedor=novo" className="text-sm font-medium text-brand underline">Cadastrar fornecedor</Link></span>
        <select id="supplierId" name="supplierId" defaultValue={saved?.supplierId ?? selectedSupplierId ?? ""} className={INPUT}>
          <option value="" disabled>
            Escolha
          </option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </div>
      <div className={field}>
        <label htmlFor="kind" className={LABEL}>
          Tipo
        </label>
        <select id="kind" name="kind" defaultValue={saved?.kind ?? "importacao"} className={INPUT}>
          {PURCHASE_KINDS.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>;
  const dates = <div className="grid gap-3 sm:grid-cols-3">
      <div className={field}>
        <label htmlFor="reference" className={LABEL}>
          Referência (proforma, invoice, DI)
        </label>
        <input id="reference" name="reference" type="text" maxLength={60} autoComplete="off" defaultValue={saved?.reference ?? ""} className={INPUT} />
      </div>
      <div className={field}>
        <label htmlFor="orderedOn" className={LABEL}>
          Pedido ao fornecedor em
        </label>
        <input id="orderedOn" name="orderedOn" type="date" defaultValue={saved?.orderedOn ?? today} className={INPUT} />
      </div>
      <div className={field}>
        <label htmlFor="expectedOn" className={LABEL}>
          Previsão de chegada
        </label>
        <input id="expectedOn" name="expectedOn" type="date" defaultValue={saved?.expectedOn ?? ""} className={INPUT} />
      </div>
    </div>;
  const currency = <div className="grid gap-3 sm:grid-cols-2">
      <div className={field}>
        <label htmlFor="currency" className={LABEL}>
          Moeda dos preços
        </label>
        <select id="currency" name="currency" defaultValue={saved?.currency ?? "USD"} className={INPUT}>
          {CURRENCIES.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className={field}>
        <label htmlFor="exchangeRate" className={LABEL}>
          Câmbio (reais por unidade)
        </label>
        <input id="exchangeRate" name="exchangeRate" type="text" inputMode="decimal" autoComplete="off" defaultValue={saved ? String(saved.exchangeRate).replace(".", ",") : ""} placeholder="5,42" className={INPUT} />
      </div>
    </div>;
  const savedData = saved ? <div className="grid gap-3 sm:grid-cols-2">
      <div className={field}>
        <label htmlFor="invoiceNumber" className={LABEL}>Nota de entrada: número</label>
        <input id="invoiceNumber" name="invoiceNumber" type="text" maxLength={20} autoComplete="off" defaultValue={saved.invoiceNumber ?? ""} className={INPUT} />
      </div>
      <div className={field}>
        <label htmlFor="invoiceKey" className={LABEL}>Nota de entrada: chave de acesso</label>
        <input id="invoiceKey" name="invoiceKey" type="text" inputMode="numeric" maxLength={60} autoComplete="off" defaultValue={saved.invoiceKey ?? ""} className={INPUT} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="notes" className={LABEL}>Observações</label>
        <textarea id="notes" name="notes" rows={2} maxLength={1000} defaultValue={saved.notes ?? ""} className={INPUT} />
      </div>
    </div> : null;
  return <FormSections sections={[
    { title: "Fornecedor e tipo", content: identification },
    { title: "Referência e datas", content: dates },
    { title: "Moeda e câmbio", content: currency },
    ...(savedData ? [{ title: "Nota e observações", content: savedData }] : []),
  ]} />;
}

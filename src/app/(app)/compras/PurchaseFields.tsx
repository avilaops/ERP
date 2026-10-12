import { INPUT, LABEL } from "@/components/ui";
import { CURRENCIES, PURCHASE_KINDS } from "@/lib/db/purchases";
import type { Purchase } from "@/lib/db/purchases";

/** The head of a purchase: who sells, in which currency and when. The same fields for a new one and for one on file. */
export function PurchaseFields({ saved, suppliers, today }: { saved: Purchase | null; suppliers: { id: number; name: string }[]; today: string }) {
  const WIDE = "basis-full sm:basis-56 sm:flex-1";
  const NARROW = "basis-full sm:basis-36 sm:flex-1";
  return (
    <>
      <div className={WIDE}>
        <label htmlFor="supplierId" className={LABEL}>
          Fornecedor
        </label>
        <select id="supplierId" name="supplierId" required defaultValue={saved?.supplierId ?? ""} className={INPUT}>
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
      <div className={NARROW}>
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
      <div className={NARROW}>
        <label htmlFor="reference" className={LABEL}>
          Referência (proforma, invoice, DI)
        </label>
        <input id="reference" name="reference" type="text" maxLength={60} autoComplete="off" defaultValue={saved?.reference ?? ""} className={INPUT} />
      </div>
      <div className={NARROW}>
        <label htmlFor="orderedOn" className={LABEL}>
          Pedido ao fornecedor em
        </label>
        <input id="orderedOn" name="orderedOn" type="date" required defaultValue={saved?.orderedOn ?? today} className={INPUT} />
      </div>
      <div className={NARROW}>
        <label htmlFor="expectedOn" className={LABEL}>
          Previsão de chegada
        </label>
        <input id="expectedOn" name="expectedOn" type="date" defaultValue={saved?.expectedOn ?? ""} className={INPUT} />
      </div>
      <div className={NARROW}>
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
      <div className={NARROW}>
        <label htmlFor="exchangeRate" className={LABEL}>
          Câmbio (reais por unidade)
        </label>
        <input id="exchangeRate" name="exchangeRate" type="text" inputMode="decimal" autoComplete="off" defaultValue={saved ? String(saved.exchangeRate).replace(".", ",") : ""} placeholder="5,42" className={INPUT} />
      </div>
      {saved && (
        <>
          <div className={NARROW}>
            <label htmlFor="invoiceNumber" className={LABEL}>
              Nota de entrada: número
            </label>
            <input id="invoiceNumber" name="invoiceNumber" type="text" maxLength={20} autoComplete="off" defaultValue={saved.invoiceNumber ?? ""} className={INPUT} />
          </div>
          <div className={WIDE}>
            <label htmlFor="invoiceKey" className={LABEL}>
              Nota de entrada: chave de acesso
            </label>
            <input id="invoiceKey" name="invoiceKey" type="text" inputMode="numeric" maxLength={60} autoComplete="off" defaultValue={saved.invoiceKey ?? ""} className={INPUT} />
          </div>
          <div className="basis-full">
            <label htmlFor="notes" className={LABEL}>
              Observações
            </label>
            <textarea id="notes" name="notes" rows={2} maxLength={1000} defaultValue={saved.notes ?? ""} className={INPUT} />
          </div>
        </>
      )}
    </>
  );
}

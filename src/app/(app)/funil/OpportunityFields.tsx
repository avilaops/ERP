import { INPUT, LABEL } from "@/components/ui";
import type { Opportunity } from "@/lib/db/funnel";
import { formatMoney } from "@/lib/format";

/**
 * The fields of an opportunity, the same to create and to change. `saved` is
 * `null` on the screen that creates. The customers are the ones of the
 * company's register; someone who is not a customer yet goes by the name of
 * the company.
 */
export function OpportunityFields({ saved, customers }: { saved: Opportunity | null; customers: { id: number; name: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label htmlFor="title" className={LABEL}>
          O que está sendo vendido
        </label>
        <input id="title" name="title" type="text" defaultValue={saved?.title ?? ""} placeholder="Ex.: Academia nova, 12 estações" autoComplete="off" className={INPUT} />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <label htmlFor="customerId" className={LABEL}>
          Cliente do cadastro
        </label>
        <select id="customerId" name="customerId" defaultValue={saved?.customerId ?? ""} className={INPUT}>
          <option value="">Ainda não é cliente</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <label htmlFor="company" className={LABEL}>
          Empresa (se ainda não é cliente)
        </label>
        <input id="company" name="company" type="text" defaultValue={saved?.company ?? ""} autoComplete="off" className={INPUT} />
      </div>
      <div>
        <label htmlFor="contactName" className={LABEL}>
          Pessoa de contato
        </label>
        <input id="contactName" name="contactName" type="text" defaultValue={saved?.contactName ?? ""} autoComplete="off" className={INPUT} />
      </div>
      <div>
        <label htmlFor="phone" className={LABEL}>
          Telefone ou WhatsApp
        </label>
        <input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={saved?.phone ?? ""} autoComplete="off" className={INPUT} />
      </div>
      <div>
        <label htmlFor="email" className={LABEL}>
          E-mail
        </label>
        <input id="email" name="email" type="email" defaultValue={saved?.email ?? ""} autoComplete="off" className={INPUT} />
      </div>
      <div>
        <label htmlFor="estimatedValue" className={LABEL}>
          Valor estimado (R$)
        </label>
        <input id="estimatedValue" name="estimatedValue" type="text" inputMode="decimal" defaultValue={saved?.estimatedValue == null ? "" : formatMoney(saved.estimatedValue)} placeholder="0,00" autoComplete="off" className={`${INPUT} text-right`} />
      </div>
      <div className="col-span-2">
        <label htmlFor="source" className={LABEL}>
          De onde veio
        </label>
        <input id="source" name="source" type="text" defaultValue={saved?.source ?? ""} placeholder="Indicação, Instagram, feira…" autoComplete="off" className={INPUT} />
      </div>
      <details className="col-span-2" open={Boolean(saved?.notes)}>
        <summary className="inline-block cursor-pointer py-1 text-sm font-medium text-brand underline">Observações</summary>
        <label htmlFor="notes" className="sr-only">
          Observações
        </label>
        <textarea id="notes" name="notes" rows={3} defaultValue={saved?.notes ?? ""} className={INPUT} />
      </details>
    </div>
  );
}

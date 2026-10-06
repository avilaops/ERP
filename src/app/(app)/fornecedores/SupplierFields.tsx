import { BANK_FIELDS, SUPPLIER_KIND_LABELS, SUPPLIER_KINDS } from "@/lib/db/suppliers";
import type { Supplier } from "@/lib/db/suppliers";

const INPUT = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const LABEL = "block text-sm font-medium";

/**
 * The fields of the supplier record, new or saved. A server component: the
 * values come from the database, nothing is decided in the browser. Document
 * is the CNPJ, the CPF or, abroad, the tax id as it comes.
 */
export function SupplierFields({ saved }: { saved: Supplier | null }) {
  const plain = [
    ["name", "Nome ou razão social *", saved?.name],
    ["tradeName", "Nome fantasia", saved?.tradeName],
    ["document", "CNPJ, CPF ou identificação fiscal", saved?.document],
    ["country", "País (só para exterior)", saved?.country],
    ["contactName", "Contato", saved?.contactName],
    ["phone", "Telefone", saved?.phone],
    ["email", "E-mail", saved?.email],
  ] as const;
  return (
    <>
      <div>
        <label htmlFor="kind" className={LABEL}>
          Tipo
        </label>
        <select key={saved?.kind ?? "novo"} id="kind" name="kind" defaultValue={saved?.kind ?? "PJ"} className={INPUT}>
          {SUPPLIER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {SUPPLIER_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
      {plain.map(([key, label, value]) => (
        <div key={key}>
          <label htmlFor={key} className={LABEL}>
            {label}
          </label>
          <input id={key} name={key} type="text" defaultValue={value ?? ""} autoComplete="off" className={INPUT} />
        </div>
      ))}
      <fieldset className="rounded border border-slate-200 p-4 sm:col-span-2">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Dados para pagamento</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {BANK_FIELDS.map(([key, label]) => (
            <div key={key}>
              <label htmlFor={key} className={LABEL}>
                {label}
              </label>
              <input id={key} name={key} type="text" defaultValue={saved?.bank[key] ?? ""} autoComplete="off" className={INPUT} />
            </div>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <label htmlFor="notes" className={LABEL}>
          Observações
        </label>
        <input id="notes" name="notes" type="text" defaultValue={saved?.notes ?? ""} className={INPUT} />
      </div>
    </>
  );
}

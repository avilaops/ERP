import { INPUT } from "@/components/ui";
import { FormSections } from "@/components/FormSections";
import { BANK_FIELDS, SUPPLIER_KIND_LABELS, SUPPLIER_KINDS } from "@/lib/db/suppliers";
import type { Supplier } from "@/lib/db/suppliers";

const LABEL = "block text-sm font-medium";
type SupplierDefaults = Partial<Pick<Supplier, "kind" | "name" | "tradeName" | "document" | "country" | "contactName" | "phone" | "email">>;

/**
 * The fields of the supplier record, new or saved. A server component: the
 * values come from the database, nothing is decided in the browser. Document
 * is the CNPJ, the CPF or, abroad, the tax id as it comes.
 */
export function SupplierFields({ saved, defaults = {} }: { saved: Supplier | null; defaults?: SupplierDefaults }) {
  const plain = [
    ["name", "Nome ou razão social *", saved?.name ?? defaults.name],
    ["tradeName", "Nome fantasia", saved?.tradeName ?? defaults.tradeName],
    ["document", "CNPJ, CPF ou identificação fiscal", saved?.document ?? defaults.document],
    ["country", "País (só para exterior)", saved?.country ?? defaults.country],
    ["contactName", "Contato", saved?.contactName ?? defaults.contactName],
    ["phone", "Telefone", saved?.phone ?? defaults.phone],
    ["email", "E-mail", saved?.email ?? defaults.email],
  ] as const;
  const fields = (rows: readonly (typeof plain[number])[]) => rows.map(([key, label, value]) => (
    <div key={key}>
      <label htmlFor={key} className={LABEL}>{label}</label>
      <input id={key} name={key} type={key === "email" ? "email" : "text"} defaultValue={value ?? ""} autoComplete="off" className={INPUT} />
    </div>
  ));
  return (
    <FormSections sections={[
      { title: "Identificação", content: <div key="identificacao" className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="kind" className={LABEL}>
          Tipo
        </label>
        <select key={saved?.kind ?? defaults.kind ?? "novo"} id="kind" name="kind" defaultValue={saved?.kind ?? defaults.kind ?? "PJ"} className={INPUT}>
          {SUPPLIER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {SUPPLIER_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
      {fields(plain.filter(([key]) => ["name", "document"].includes(key)))}</div> },
      { title: "Empresa", content: <div key="empresa" className="grid gap-3 sm:grid-cols-2">{fields(plain.filter(([key]) => ["tradeName", "country"].includes(key)))}</div> },
      { title: "Contato", content: <div key="contato" className="grid gap-3 sm:grid-cols-2">{fields(plain.filter(([key]) => ["contactName", "phone", "email"].includes(key)))}</div> },
      ...Array.from({ length: Math.ceil(BANK_FIELDS.length / 3) }, (_, index) => ({ title: `Dados para pagamento ${index + 1}`, content: <div key={`banco-${index}`} className="grid gap-3 sm:grid-cols-2">
          {BANK_FIELDS.slice(index * 3, index * 3 + 3).map(([key, label]) => (
            <div key={key}>
              <label htmlFor={key} className={LABEL}>
                {label}
              </label>
              <input id={key} name={key} type="text" defaultValue={saved?.bank[key] ?? ""} autoComplete="off" className={INPUT} />
            </div>
          ))}
        </div> })),
      { title: "Observações", content: <div key="observacoes">
        <label htmlFor="notes" className={LABEL}>
          Observações
        </label>
        <input id="notes" name="notes" type="text" defaultValue={saved?.notes ?? ""} className={INPUT} />
      </div> },
    ]} />
  );
}

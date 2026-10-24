import Link from "next/link";
import { INPUT, LABEL, PRIMARY, SECONDARY } from "@/components/ui";
import { ActionForm } from "@/app/(app)/pedidos/ActionForm";
import type { ActionState } from "@/lib/order-form";
import { PROPOSAL_FIELDS } from "@/lib/quote/settings";
import type { ProposalDetails, ProposalSection } from "@/lib/quote/settings";

/** Every condition of one proposal is reviewed and saved atomically on one screen. */
export function ProposalFields({ sections, details, defaults = {}, revision, number, back, action }: {
  sections: ProposalSection[]; details: ProposalDetails; defaults?: ProposalDetails; revision: string;
  number?: string; back: string; action: (state: ActionState, data: FormData) => Promise<ActionState>;
}) {
  return <ActionForm action={action} className="mt-3 max-w-4xl space-y-4">
    <input type="hidden" name="revision" value={revision} />
    {number && <input type="hidden" name="number" value={number} />}
    {sections.map((group) => <section key={group.title} className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby={`proposal-${group.fields[0]}-title`}>
      <h2 id={`proposal-${group.fields[0]}-title`} className="text-sm font-semibold uppercase tracking-wide">{group.title}</h2>
      <p className="mt-1 text-sm text-slate-600">{group.hint}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {group.fields.map((key) => {
          const field = PROPOSAL_FIELDS[key];
          const id = `proposal-${key}`;
          return <div key={`${key}-${revision}`} className={field.max > 200 ? "sm:col-span-2" : undefined}><label htmlFor={id} className={LABEL}>{field.label}</label>
            {key === "freightMode" ? <select id={id} name={key} defaultValue={details[key] ?? ""} className={INPUT}>
              <option value="">A combinar</option><option value="CIF">CIF · vendedora paga</option>
              <option value="FOB">FOB · cliente paga</option><option value="retirada">Retirada pelo cliente</option>
            </select> : field.max > 200 ? <textarea id={id} name={key} rows={2} maxLength={field.max} defaultValue={details[key] ?? ""} placeholder={defaults[key] ? "Em branco: padrão da empresa" : "A definir"} className={`${INPUT} py-2`} />
              : <input id={id} name={key} maxLength={field.max} type={key === "email" ? "email" : "text"} inputMode={key === "freightAmount" ? "decimal" : undefined} defaultValue={details[key] ?? ""} className={INPUT} />}
            {defaults[key] && <details className="mt-1 text-sm font-normal text-slate-600"><summary className="flex min-h-[var(--control)] cursor-pointer items-center">Ver padrão da empresa</summary><p className="py-1">{defaults[key]}</p></details>}
          </div>;
        })}
      </div>
    </section>)}
    <div className="flex flex-wrap gap-2">
      <button type="submit" className={`${PRIMARY} flex-1 sm:flex-none`}>Salvar dados da proposta</button>
      <Link href={back} className={SECONDARY}>Sair</Link>
    </div>
  </ActionForm>;
}

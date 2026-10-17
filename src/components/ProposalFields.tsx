import Link from "next/link";
import { INPUT, LABEL, PRIMARY, SECONDARY } from "@/components/ui";
import { ActionForm } from "@/app/(app)/pedidos/ActionForm";
import type { ActionState } from "@/lib/order-form";
import { PROPOSAL_FIELDS } from "@/lib/quote/settings";
import type { ProposalDetails, ProposalStep } from "@/lib/quote/settings";

/** Each step keeps one decision visible; rejected submissions retain every typed field. */
export function ProposalFields({ steps, step, details, defaults = {}, revision, number, back, action }: {
  steps: ProposalStep[]; step: number; details: ProposalDetails; defaults?: ProposalDetails; revision: string;
  number?: string; back: string; action: (state: ActionState, data: FormData) => Promise<ActionState>;
}) {
  const current = steps[step];
  return <ActionForm action={action} className="mt-3 max-w-2xl space-y-3">
    <input type="hidden" name="step" value={step} />
    <input type="hidden" name="revision" value={revision} />
    {number && <input type="hidden" name="number" value={number} />}
    <p className="text-sm text-slate-600">{step + 1} de {steps.length} · {current.title}</p>
    {current.fields.map((key) => {
      const field = PROPOSAL_FIELDS[key];
      const id = `proposal-${key}`;
      return <div key={`${step}-${key}-${revision}`}><label htmlFor={id} className={LABEL}>{field.label}</label>
        {key === "freightMode" ? <select id={id} name={key} defaultValue={details[key] ?? ""} className={INPUT}>
          <option value="">A combinar</option><option value="CIF">CIF · vendedora paga</option>
          <option value="FOB">FOB · cliente paga</option><option value="retirada">Retirada pelo cliente</option>
        </select> : field.max > 200 ? <textarea id={id} name={key} rows={2} maxLength={field.max} defaultValue={details[key] ?? ""} placeholder={defaults[key] ? "Em branco: padrão da empresa" : "A definir"} className={`${INPUT} py-2`} />
          : <input id={id} name={key} maxLength={field.max} type={key === "email" ? "email" : "text"} inputMode={key === "freightAmount" ? "decimal" : undefined} defaultValue={details[key] ?? ""} className={INPUT} />}
        {defaults[key] && <details className="mt-1 text-sm font-normal text-slate-600"><summary className="flex min-h-[var(--control)] cursor-pointer items-center">Ver padrão da empresa</summary><p className="py-1">{defaults[key]}</p></details>}
      </div>;
    })}
    <p className="text-sm text-slate-600">{current.hint}</p>
    <div className="flex flex-wrap gap-2">
      <button type="submit" name="intent" value="next" className={`${PRIMARY} flex-1`}>{step === steps.length - 1 ? "Salvar e conferir" : "Salvar e continuar"}</button>
      {step > 0 && <button type="submit" name="intent" value="back" className={SECONDARY}>Voltar</button>}
      <Link href={back} className={SECONDARY}>Sair</Link>
    </div>
  </ActionForm>;
}

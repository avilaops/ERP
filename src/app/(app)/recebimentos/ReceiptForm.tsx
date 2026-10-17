"use client";

import { useActionState, useState } from "react";
import { INPUT, LABEL, PRIMARY } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { recordReceiptAction } from "./actions";

/** A refused write-off keeps its draft; a successful one remounts with the updated open amount. */
export function ReceiptForm({ id, openAmount, today, initialMethod, methods, initiallyOpen }: {
  id: number;
  openAmount: number;
  today: string;
  initialMethod: string | null;
  methods: string[];
  initiallyOpen: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyOpen);
  const [state, formAction, pending] = useActionState(recordReceiptAction, { error: null });
  const values = state.values ?? { receivedOn: today, amount: formatMoney(openAmount), method: initialMethod && methods.includes(initialMethod) ? initialMethod : "", note: "" };

  // React resets action forms even when the action returns a validation error.
  // The receivable's key resets the draft only after its open amount changes.
  return (
    <form action={formAction} onReset={(event) => event.preventDefault()} noValidate aria-busy={pending} className="mt-2 aria-busy:pointer-events-none aria-busy:opacity-60">
      <details open={expanded || Boolean(state.error)} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary className="inline-flex min-h-[var(--control)] cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">
          {expanded ? "Fechar baixa" : "Dar baixa"}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={id} />
          <div>
            <label htmlFor={`on-${id}`} className={LABEL}>Recebido em</label>
            <input id={`on-${id}`} name="receivedOn" type="date" defaultValue={values.receivedOn} max={today} className={INPUT} />
          </div>
          <div>
            <label htmlFor={`amount-${id}`} className={LABEL}>Valor recebido</label>
            <input id={`amount-${id}`} name="amount" type="text" inputMode="decimal" defaultValue={values.amount} className={`${INPUT} text-right`} />
          </div>
          <div>
            <label htmlFor={`method-${id}`} className={LABEL}>Forma</label>
            <select id={`method-${id}`} name="method" defaultValue={values.method} className={INPUT}>
              <option value="">—</option>
              {methods.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`note-${id}`} className={LABEL}>Observação</label>
            <input id={`note-${id}`} name="note" type="text" defaultValue={values.note} className={INPUT} />
          </div>
          <button type="submit" disabled={pending} className={`${PRIMARY} sm:col-span-2`}>Dar baixa</button>
        </div>
      </details>
      {state.error && !pending && <p role="alert" className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"><strong>Nada foi gravado.</strong> {state.error}</p>}
    </form>
  );
}

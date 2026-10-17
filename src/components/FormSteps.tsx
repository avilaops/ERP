"use client";

import { createContext, useContext, useId, useState } from "react";
import type { ReactNode } from "react";
import type { ActionState } from "@/lib/order-form";
import { INPUT } from "@/components/ui";

export const ActionFeedbackContext = createContext<ActionState | null>(null);

/** All fields stay mounted and submit together. A refused action reveals every group. */
export function FormSteps({ steps, label = "Etapa da configuração", revealAll = false }: {
  steps: { title: string; content: ReactNode }[];
  label?: string;
  revealAll?: boolean;
}) {
  const [step, setStep] = useState(0);
  const feedback = useContext(ActionFeedbackContext);
  const id = useId();
  const all = revealAll || Boolean(feedback?.error) || step === -1;
  return (
    <div className="min-w-0 sm:col-span-full">
      <label className="sr-only" htmlFor={id}>{label}</label>
      <select id={id} className={INPUT} value={all ? -1 : step} onChange={(event) => setStep(Number(event.target.value))}>
        {steps.map(({ title }, index) => <option key={title} value={index}>{index + 1} de {steps.length} · {title}</option>)}
        <option value={-1}>Revisar todos os campos</option>
      </select>
      {steps.map(({ title, content }, index) => (
        <section key={title} hidden={!all && step !== index} aria-labelledby={`${id}-${index}`} className="mt-4">
          <h3 id={`${id}-${index}`} className="sr-only">{title}</h3>
          {content}
        </section>
      ))}
    </div>
  );
}

"use client";

import { createContext, useId } from "react";
import type { ReactNode } from "react";
import type { ActionState } from "@/lib/order-form";

export const ActionFeedbackContext = createContext<ActionState | null>(null);

/** One task stays in one form. Sections organize the fields without hiding any of them. */
export function FormSections({ sections }: {
  sections: { title: string; content: ReactNode }[];
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-4 sm:col-span-full">
      {sections.map(({ title, content }, index) => (
        <section key={title} aria-labelledby={`${id}-${index}`} className="min-w-0">
          <h3 id={`${id}-${index}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
          {content}
        </section>
      ))}
    </div>
  );
}

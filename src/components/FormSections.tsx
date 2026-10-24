import type { ReactNode } from "react";

/** One task stays in one form. Sections organize fields without hiding any of them. */
export function FormSections({ sections }: { sections: { title: string; content: ReactNode }[] }) {
  return (
    <div className="grid min-w-0 gap-4 sm:col-span-full">
      {sections.map(({ title, content }) => (
        <section key={title} aria-label={title} className="min-w-0">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
          {content}
        </section>
      ))}
    </div>
  );
}

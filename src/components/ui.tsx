import Link from "next/link";
import type { ReactNode } from "react";

export { pageOf } from "@/lib/rows";

/**
 * The pieces every screen is made of (docs/ux.md). A screen that needs a card,
 * a field, a button, a status or a pager takes it from here, so the whole
 * system looks and behaves as one. Colours are the names of the light palette;
 * the dark theme and the brand of each company follow by themselves.
 */
export const CARD = "rounded-lg border border-slate-200 bg-white";
/** A group of things under one small title, without a box of its own. */
export const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wide text-slate-600";
export const LABEL = "block text-sm font-medium text-slate-700";
/** Every field is as tall as a finger needs and keeps its label above it. */
export const INPUT = "mt-1 block min-h-[var(--control)] w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-brand";
/** The one action the step exists for. One per step. */
export const PRIMARY = "inline-flex min-h-[var(--control)] items-center justify-center rounded-lg bg-brand px-5 text-base font-semibold text-white hover:bg-brand-dark disabled:opacity-60";
export const SECONDARY = "inline-flex min-h-[var(--control)] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50";
export const QUIET_LINK = "font-medium text-brand underline";

/**
 * The top of a screen: where the person is, in one line, with at most one
 * short sentence under it and the actions of the screen on the right. A long
 * explanation does not go here: it goes next to what it explains.
 */
export function PageHeader({ title, hint, actions }: { title: string; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1>{title}</h1>
        {hint && <p className="mt-0.5 text-sm text-slate-600">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const TONES = {
  good: "border-emerald-300 bg-emerald-50 text-emerald-900",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  bad: "border-red-300 bg-red-50 text-red-900",
  neutral: "border-slate-300 bg-slate-50 text-slate-700",
} as const;
export type Tone = keyof typeof TONES;

/** A state in two or three words. The words say it; the colour only helps to find it. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

/**
 * The foot of a list that does not fit one screen: where the person is in it
 * and the way to the next slice. A long list is never drawn whole.
 */
export function Pager({ page, pages, from, to, total, noun, hrefFor }: { page: number; pages: number; from: number; to: number; total: number; noun: [one: string, many: string]; hrefFor: (page: number) => string }) {
  const STEP = "inline-flex min-h-[var(--control)] min-w-[var(--control)] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium";
  const step = (to: number, label: string, short: string, enabled: boolean) =>
    enabled ? (
      <Link href={hrefFor(to)} scroll={false} aria-label={label} className={`${STEP} hover:bg-slate-50`}>
        {short}
      </Link>
    ) : (
      <span aria-hidden="true" className={`${STEP} opacity-40`}>
        {short}
      </span>
    );
  return (
    <nav aria-label="Páginas" data-after-rows className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 text-sm">
      <p className="min-w-0 text-slate-600">
        {total === 0 ? `Nenhum ${noun[0]}` : `${from}–${to} de ${total} ${total === 1 ? noun[0] : noun[1]}`}
      </p>
      {pages > 1 && (
        <div className="flex shrink-0 items-center gap-2">
          {step(page - 1, "Página anterior", "‹", page > 1)}
          <span className="whitespace-nowrap text-slate-600" aria-current="page">
            {page} de {pages}
          </span>
          {step(page + 1, "Próxima página", "›", page < pages)}
        </div>
      )}
    </nav>
  );
}

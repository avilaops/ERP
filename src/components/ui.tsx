import Link from "next/link";
import type { ReactNode } from "react";

export { pageOf } from "@/lib/rows";

/**
 * The pieces every screen is made of (docs/ux.md). A screen that needs a card,
 * a field, a button, a status or a pager takes it from here, so the whole
 * system looks and behaves as one. Colours are the names of the light palette;
 * the dark theme and the brand of each company follow by themselves.
 */
export const CARD = "rounded-xl border border-slate-200 bg-white";
/** A group of things under one small title, without a box of its own. */
export const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wide text-slate-600";
export const LABEL = "block text-sm font-medium text-slate-700";
/** Every field is as tall as a finger needs and keeps its label above it. */
export const INPUT = "mt-1 block min-h-[var(--control)] w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-brand";
/** The one action the step exists for. One per step. */
export const PRIMARY = "inline-flex min-h-[var(--control)] items-center justify-center rounded-lg bg-brand px-5 text-base font-semibold text-white hover:bg-brand-dark disabled:opacity-60";
export const SECONDARY = "inline-flex min-h-[var(--control)] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50";
/** Remove, discard, cancel: red text, as tall as any other control. */
export const DANGER = "inline-flex min-h-[var(--control)] items-center justify-center rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50";
/** The destructive action a step exists for (cancel the order, revoke the access). */
export const DANGER_OUTLINE = "inline-flex min-h-[var(--control)] items-center justify-center rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50";
export const QUIET_LINK = "font-medium text-brand underline";

/** Page views are navigation; their selected state is distinct from a primary action. */
export function ViewTabs({ label, items }: { label: string; items: { href: string; label: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="view-tabs">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.current ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Secondary context is available without taking the first fold away from the task. */
export function SectionDisclosure({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <details className={`${CARD} ${className}`}>
      <summary className="disclosure-heading">{title}<span aria-hidden="true" className="disclosure-marker">+</span></summary>
      <div className="border-t border-slate-200 p-4">{children}</div>
    </details>
  );
}

export type SummaryMetric = { label: string; value: string; note?: string; attention?: boolean };

/** The decision metrics stay in the summary; counts and secondary metrics open on request. */
export function MetricSummary({ items }: { items: SummaryMetric[] }) {
  const metrics = (rows: SummaryMetric[]) => rows.map(({ label, value, note, attention }) => (
    <div key={label} className="min-w-0">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className={`mt-1 break-words text-lg font-semibold tabular-nums ${attention ? "text-red-700" : ""}`}>{value}</dd>
      {note && <dd className="text-xs text-slate-600">{note}</dd>}
    </div>
  ));
  return (
    <details aria-label="Resumo financeiro" className={`${CARD} mt-3`}>
      <summary className="disclosure-heading">
        <span className="grid min-w-0 flex-1 grid-cols-2 gap-3">
          {items.slice(0, 2).map((item) => <span key={item.label} className="min-w-0"><span className="block font-normal text-slate-600">{item.label}</span><span className={`block break-words font-semibold ${item.attention ? "text-red-700" : ""}`}>{item.value}</span></span>)}
        </span>
        <span className="sr-only">Ver todos os indicadores</span><span className="disclosure-marker" aria-hidden="true">+</span>
      </summary>
      <dl className="grid grid-cols-2 gap-3 border-t border-slate-200 p-3">{metrics(items)}</dl>
    </details>
  );
}

/**
 * The top of a screen: where the person is, in one line, with at most one
 * short sentence under it and the actions of the screen on the right. A long
 * explanation does not go here: it goes next to what it explains.
 */
export function PageHeader({ title, hint, actions }: { title: string; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1>{title}</h1>
        {typeof hint === "string" && hint.length > 130 ? (
          <details className="mt-1 max-w-prose text-sm text-slate-600">
            <summary className="inline-flex min-h-[var(--control)] cursor-pointer items-center text-brand">Como funciona</summary>
            <p className="pb-2">{hint}</p>
          </details>
        ) : hint ? <p className="mt-1 max-w-prose text-sm text-slate-600">{hint}</p> : null}
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

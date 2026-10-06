import type { ReactNode } from "react";

export type ChartBar = { label: string; value: number };

/**
 * Horizontal bars, the largest on top of the scale. A server component: the
 * widths are calculated here, nothing is measured in the browser.
 */
export function Bars({ bars, format, empty }: { bars: ChartBar[]; format: (value: number) => string; empty: string }) {
  if (bars.length === 0) return <p className="text-sm text-slate-600">{empty}</p>;
  const top = Math.max(...bars.map((bar) => bar.value), 0);
  return (
    <ul className="flex flex-col gap-2">
      {bars.map((bar) => (
        <li key={bar.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{bar.label}</span>
            <span className="whitespace-nowrap font-medium">{format(bar.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-slate-100">
            <div className="h-2 rounded bg-brand" style={{ width: `${top > 0 ? Math.max(2, (bar.value / top) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Vertical bars for a series in time. The value of each one is read by the title and by the list for screen readers. */
export function Columns({ bars, format }: { bars: ChartBar[]; format: (value: number) => string }) {
  const top = Math.max(...bars.map((bar) => bar.value), 0);
  return (
    <div>
      <div className="flex h-40 items-end gap-1 sm:gap-2" aria-hidden="true">
        {bars.map((bar) => (
          <div key={bar.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${bar.label}: ${format(bar.value)}`}>
            <div className="rounded-t bg-brand" style={{ height: `${top > 0 && bar.value > 0 ? Math.max(2, (bar.value / top) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-slate-500 sm:gap-2 sm:text-xs" aria-hidden="true">
        {bars.map((bar) => (
          <span key={bar.label} className="min-w-0 flex-1 truncate text-center">
            {bar.label}
          </span>
        ))}
      </div>
      <ul className="sr-only">
        {bars.map((bar) => (
          <li key={bar.label}>
            {bar.label}: {format(bar.value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One indicator card. */
export function Kpi({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-lg font-bold sm:text-2xl ${tone ?? ""}`}>{value}</dd>
      {note && <dd className="text-xs text-slate-600">{note}</dd>}
    </div>
  );
}

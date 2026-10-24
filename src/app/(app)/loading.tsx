import { CARD } from "@/components/ui";

export default function AppLoading() {
  return (
    <section role="status" aria-label="Carregando página" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="animate-pulse" aria-hidden="true">
        <div className="h-8 w-52 rounded bg-slate-200" />
        <div className="mt-2 h-4 w-full max-w-md rounded bg-slate-200" />
        <div className={`${CARD} mt-5 space-y-3 p-4`}>
          <div className="h-11 rounded-lg bg-slate-100" />
          <div className="h-11 rounded-lg bg-slate-100" />
          <div className="h-11 rounded-lg bg-slate-100" />
        </div>
      </div>
    </section>
  );
}

"use client";

import { useActionState } from "react";
import type { LogoState } from "./actions";


const IDLE: LogoState = { status: "idle", message: null };

/** The company's logo: what the menu shows. Only sends the file; the server decides if it is an image. */
export function LogoForm({
  company,
  logo,
  save,
  remove,
}: {
  company: string;
  /** Address of the current logo, or `null` when the menu shows the name. */
  logo: string | null;
  save: (state: LogoState, formData: FormData) => Promise<LogoState>;
  remove: () => Promise<LogoState>;
}) {
  // One state for the two buttons: the form says which one was pressed.
  const [state, formAction, pending] = useActionState(
    (previous: LogoState, formData: FormData) => (formData.get("intent") === "remove" ? remove() : save(previous, formData)),
    IDLE,
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white" aria-labelledby="empresa">
      <h2 id="empresa" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
        Empresa
      </h2>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-40 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 p-2">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- served by the app itself, per company
              <img src={logo} alt={`Logo de ${company}`} className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-center text-xs text-slate-500">Sem logo: o menu mostra o nome</span>
            )}
          </div>
          <div>
            <p className="font-medium">{company}</p>
            <p className="text-xs text-slate-500">A logo aparece no topo do menu, para toda a equipe.</p>
          </div>
        </div>

        {state.status === "error" && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <span className="font-semibold">Nada foi gravado.</span> {state.message}
          </p>
        )}
        {(state.status === "saved" || state.status === "removed") && (
          <p role="status" className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
            {state.message}
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <form action={formAction} className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="logo" className="block text-sm font-medium">
                Trocar a logo
              </label>
              <input
                id="logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                aria-describedby="logo-ajuda"
                className="mt-1 block text-sm file:mr-3 file:rounded file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium"
              />
              <p id="logo-ajuda" className="mt-1 text-xs text-slate-500">
                PNG, JPEG ou WebP, até 512 KB. Fundo transparente fica melhor no menu.
              </p>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {pending ? "Enviando…" : "Enviar logo"}
            </button>
          </form>
          {logo && (
            <form action={formAction}>
              <input type="hidden" name="intent" value="remove" />
              <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm text-red-700 hover:bg-slate-100 disabled:opacity-60">
                Remover logo
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

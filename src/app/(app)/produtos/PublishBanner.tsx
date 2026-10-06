"use client";

import { useActionState, useState } from "react";
import { IDLE_PUBLISH } from "@/lib/price-table";
import type { PublishNotice, PublishState } from "@/lib/price-table";

type PublishAction = (state: PublishState, formData: FormData) => Promise<PublishState>;

/**
 * The notice of what the team sees, with the button that publishes the draft.
 * Only shows text that came ready from the server. Publishing takes a second
 * click here: a published version is never removed.
 */
export function PublishBanner({ notice, action }: { notice: PublishNotice; action: PublishAction }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, IDLE_PUBLISH);

  return (
    <section
      aria-label="Tabela publicada"
      className={`mt-6 rounded-lg border px-5 py-3 text-sm ${
        notice.pending ? "border-amber-300 bg-amber-50 text-amber-950" : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          {notice.strong && <strong className="font-semibold">{notice.strong} </strong>}
          {notice.text}
        </p>

        {notice.next !== null && (
          <form action={formAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="expected" value={notice.next} />
            {/* Different keys: the pressed button must never become the one that submits. */}
            {confirming ? (
              <>
                <span key="question">Publicar a v{notice.next} para a equipe?</span>
                <button
                  key="confirm"
                  type="submit"
                  disabled={pending}
                  className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {pending ? "Publicando…" : "Confirmar"}
                </button>
                <button key="cancel" type="button" onClick={() => setConfirming(false)} className="rounded px-3 py-2 hover:bg-amber-100">
                  Cancelar
                </button>
              </>
            ) : (
              <button
                key="publish"
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
              >
                Publicar v{notice.next}
              </button>
            )}
          </form>
        )}
      </div>

      {state.status === "error" && (
        <p role="alert" className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-red-900">
          <span className="font-semibold">Nada foi publicado.</span> {state.message}
        </p>
      )}
      {state.status === "published" && (
        <p role="status" className="mt-2 font-medium text-emerald-800">
          {state.message}
        </p>
      )}
    </section>
  );
}

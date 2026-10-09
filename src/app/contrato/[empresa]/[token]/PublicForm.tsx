"use client";

import { startTransition, useActionState } from "react";
import type { ReactNode } from "react";
import { IDLE_ACTION } from "@/lib/order-form";
import type { ActionState } from "@/lib/order-form";

/**
 * A form of the signing page: sends what was typed to its action and shows the
 * answer. Everything inside comes rendered from the server; nothing of the
 * contract is known or decided here.
 *
 * The action is called by hand so a refused form keeps what was typed: the
 * browser would clear name, CPF and the agreement after every answer.
 */
export function PublicForm({ action, className, children }: { action: (state: ActionState, formData: FormData) => Promise<ActionState>; className?: string; children: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, IDLE_ACTION);
  return (
    <form
      // Without JavaScript the form still posts to the action.
      action={formAction}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
      noValidate
      className={className}
      aria-busy={pending}
    >
      {children}
      {state.error && !pending && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {state.error}
        </p>
      )}
      {!state.error && state.notice && !pending && (
        <p role="status" className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {state.notice}
        </p>
      )}
      {pending && <p className="text-sm text-slate-600">Enviando…</p>}
    </form>
  );
}

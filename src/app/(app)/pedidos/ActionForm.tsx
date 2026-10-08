"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { IDLE_ACTION } from "@/lib/order-form";
import type { ActionState } from "@/lib/order-form";

/**
 * A form of the order: sends what was typed to its action and shows the refusal
 * when there is one. Everything inside comes rendered from the server; no figure
 * is calculated here. Fields in other blocks of the page reach it by its `id`.
 *
 * A refused form keeps what was typed: the browser would clear every field
 * after the action, and whoever got one field wrong would type all of them
 * again. So the action is called by hand, and the fields are cleared only when
 * it went through.
 */
export function ActionForm({
  action,
  id,
  className,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_ACTION);
  const form = useRef<HTMLFormElement>(null);
  const sent = useRef(false);

  useEffect(() => {
    if (!sent.current || pending) return;
    sent.current = false;
    // Accepted: back to what the server renders now (the saved values, or blank in a form that adds).
    if (state.error === null) form.current?.reset();
  }, [state, pending]);

  return (
    <form
      ref={form}
      id={id}
      // Without JavaScript the form still posts to the action.
      action={formAction}
      onSubmit={(event) => {
        event.preventDefault();
        // The button pressed goes along: some forms decide by it (aprovar, recusar).
        const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        sent.current = true;
        startTransition(() => formAction(data));
      }}
      noValidate
      className={className}
    >
      {children}
      {state.error && !pending && (
        <p role="alert" className="mt-2 basis-full rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <span className="font-semibold">Nada foi gravado.</span> {state.error}
        </p>
      )}
      {!state.error && state.notice && !pending && (
        <p role="status" className="mt-2 basis-full rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {state.notice}
        </p>
      )}
    </form>
  );
}

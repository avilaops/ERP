"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import { IDLE_ACTION } from "@/lib/order-form";
import type { ActionState } from "@/lib/order-form";

/**
 * A form of the order: sends what was typed to its action and shows the refusal
 * when there is one. Everything inside comes rendered from the server; no figure
 * is calculated here. Fields in other blocks of the page reach it by its `id`.
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
  const [state, formAction] = useActionState(action, IDLE_ACTION);
  return (
    <form id={id} action={formAction} noValidate className={className}>
      {children}
      {state.error && (
        <p role="alert" className="mt-2 basis-full rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <span className="font-semibold">Nada foi gravado.</span> {state.error}
        </p>
      )}
    </form>
  );
}

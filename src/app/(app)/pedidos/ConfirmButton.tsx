"use client";

import { useState } from "react";

/**
 * A submit that asks once more before going. The two buttons have different
 * keys on purpose: without them React reuses the first one as the second, and
 * a single click would already confirm.
 */
export function ConfirmButton({ label, confirmLabel, className }: { label: string; confirmLabel: string; className: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button key="ask" type="button" onClick={() => setAsking(true)} className={className}>
        {label}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button key="confirm" type="submit" className={className}>
        {confirmLabel}
      </button>
      <button key="cancel" type="button" onClick={() => setAsking(false)} className="inline-flex min-h-[var(--control)] items-center rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">
        Cancelar
      </button>
    </span>
  );
}

"use client";

import { useState } from "react";

/**
 * A password field with "Mostrar": on a phone, a symbol at the end or a
 * capital letter typed wrong cannot be seen behind the dots. The value is
 * never kept here beyond the field itself and never rendered from the server.
 */
export function PasswordField({ id, name, className }: { id: string; name: string; className: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex gap-2">
      <input id={id} name={name} type={shown ? "text" : "password"} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={`${className} min-w-0 flex-1`} />
      <button
        type="button"
        aria-pressed={shown}
        aria-controls={id}
        onClick={() => setShown(!shown)}
        className="mt-1 inline-flex min-h-[var(--control)] shrink-0 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50"
      >
        {shown ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}

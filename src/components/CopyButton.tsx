"use client";

import { useState } from "react";

/** Copies a text prepared by the server. Without the clipboard (old browser, no https) it says so instead of failing silently. */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2500);
      }}
    >
      <span aria-live="polite">{state === "copied" ? "Copiado ✓" : state === "failed" ? "Não deu para copiar" : label}</span>
    </button>
  );
}

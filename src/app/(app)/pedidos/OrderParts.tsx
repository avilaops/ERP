"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { INPUT, SECONDARY } from "@/components/ui";

export type OrderPart = { key: string; label: string; /** `null`: a part with nothing to fill in. */ filled: boolean | null };

const TONE = {
  filled: "border-emerald-300 bg-emerald-50 text-emerald-900",
  missing: "border-amber-300 bg-amber-50 text-amber-900",
  plain: "border-slate-300 bg-white text-slate-800",
};

/**
 * The order is one part at a time: the bar chooses it and the rest
 * stays out of sight (globals.css hides what is not of the part chosen). Nothing
 * leaves the page, so what was typed in another part is still there.
 */
export function OrderParts({ parts, initial, children }: { parts: OrderPart[]; initial: string; children: ReactNode }) {
  const [part, setPart] = useState(initial);

  // A link to a title of the page ("Ir para fechar") opens the part the title is in.
  useEffect(() => {
    const open = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="#"]');
      const target = link ? document.getElementById(link.getAttribute("href")!.slice(1)) : null;
      const owner = target?.closest("[data-part]")?.getAttribute("data-part")?.split(" ")[0];
      if (!target || !owner) return;
      event.preventDefault();
      const url = new URL(window.location.href);
      url.searchParams.set("ver", owner);
      window.history.pushState(null, "", url);
      setPart(owner);
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    };
    document.addEventListener("click", open);
    const restore = () => {
      const key = new URL(window.location.href).searchParams.get("ver");
      setPart(parts.some((item) => item.key === key) ? key! : initial);
    };
    window.addEventListener("popstate", restore);
    return () => {
      document.removeEventListener("click", open);
      window.removeEventListener("popstate", restore);
    };
  }, [parts, initial]);

  function choose(key: string) {
    setPart(key);
    // The address keeps the part: reloading the page comes back to it.
    const url = new URL(window.location.href);
    url.searchParams.set("ver", key);
    url.hash = "";
    window.history.pushState(null, "", url);
    window.scrollTo({ top: 0 });
  }

  return (
    <div data-order-part={part}>
      <nav aria-label="Partes do pedido" className="sticky top-[var(--topbar)] z-10 mt-3 border-b border-slate-200 bg-white py-2 text-sm">
        <label className="block md:hidden">
          <span className="font-medium">Etapa do pedido</span>
          <select className={INPUT} value={part} onChange={(event) => choose(event.target.value)}>
            {parts.map(({ key, label, filled }) => <option key={key} value={key}>{label}{filled === null ? "" : filled ? " · completo" : " · pendente"}</option>)}
          </select>
        </label>
        <div className="hidden flex-wrap gap-2 md:flex">
        {parts.map(({ key, label, filled }) => (
          <button
            key={key}
            type="button"
            onClick={() => choose(key)}
            aria-current={key === part ? "page" : undefined}
            className={`${SECONDARY} ${
              key === part ? "border-slate-900 bg-slate-900 text-white" : filled === null ? TONE.plain : filled ? TONE.filled : TONE.missing
            }`}
          >
            {filled === null ? "" : filled ? "✓ " : "• "}
            {label}
          </button>
        ))}
        </div>
      </nav>
      {children}
    </div>
  );
}

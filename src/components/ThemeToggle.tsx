"use client";

import { useState } from "react";
import { THEME_COOKIE, THEME_LABELS, THEMES } from "@/lib/theme";
import type { Theme } from "@/lib/theme";

/** Paints the page now and leaves the choice for the next ones. Without the attribute the device decides (globals.css). */
function paint(theme: Theme): void {
  if (theme === "system") window.document.documentElement.removeAttribute("data-theme");
  else window.document.documentElement.setAttribute("data-theme", theme);
  window.document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Claro, Escuro or Sistema (follows the device). The choice is of the person
 * and of the browser: a cookie, so the server already paints the next page
 * right. Nothing of it goes to the database.
 */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  const choose = (next: Theme) => {
    setTheme(next);
    paint(next);
  };

  return (
    <div role="group" aria-label="Aparência" className="flex w-fit rounded-lg border border-slate-300 p-0.5 text-xs">
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === theme}
          onClick={() => choose(option)}
          className={`rounded-md px-2.5 py-1 font-medium ${option === theme ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
        >
          {THEME_LABELS[option]}
        </button>
      ))}
    </div>
  );
}

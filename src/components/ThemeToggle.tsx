"use client";

import { useState } from "react";
import { THEME_COOKIE, THEME_LABELS, THEMES } from "@/lib/theme";
import type { Theme } from "@/lib/theme";

const SVG = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** The monitor (follows the device), the sun and the moon. Drawn here: no icon library for three drawings. */
const ICONS: Record<Theme, React.ReactNode> = {
  system: (
    <svg {...SVG}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
  light: (
    <svg {...SVG}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg {...SVG}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
};

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
          title={THEME_LABELS[option]}
          onClick={() => choose(option)}
          className={`flex items-center rounded-md px-3 py-1.5 ${option === theme ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
        >
          {ICONS[option]}
          <span className="sr-only">{THEME_LABELS[option]}</span>
        </button>
      ))}
    </div>
  );
}

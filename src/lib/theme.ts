/** How the screens are painted: the choice of each person, kept in their browser. */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "erp_theme";
export const THEME_LABELS: Record<Theme, string> = { system: "Sistema", light: "Claro", dark: "Escuro" };

/** What the cookie says, or "system" for anything else: an unknown value never reaches the page. */
export function parseTheme(value: string | undefined | null): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "system";
}

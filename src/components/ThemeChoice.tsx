import { cookies } from "next/headers";
import { ThemeToggle } from "@/components/ThemeToggle";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

/** Reads the appearance the person chose (a cookie of theirs, never the session) and shows the three options. */
export async function ThemeChoice() {
  return <ThemeToggle initial={parseTheme((await cookies()).get(THEME_COOKIE)?.value)} />;
}

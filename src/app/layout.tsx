import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, THEME_COLOR } from "@/lib/app-identity";
import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

// The two families of the prototype, kept in the project (src/app/fonts): nothing is fetched from the internet, at build or at run time.
const display = localFont({
  src: [{ path: "./fonts/barlow-500.woff2", weight: "500" }, { path: "./fonts/barlow-600.woff2", weight: "600" }, { path: "./fonts/barlow-700.woff2", weight: "700" }],
  variable: "--font-barlow-condensed",
  display: "swap",
});
// One file with every weight (a variable font).
const body = localFont({ src: "./fonts/plex.woff2", weight: "400 600", variable: "--font-plex-sans", display: "swap" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  robots: { index: false, follow: false },
  // Installed on the phone, it opens without the browser's bars and with a short name under the icon.
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: THEME_COLOR };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Claro or Escuro chosen by the person; without a choice the attribute is left out and the device decides (globals.css).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="pt-BR" data-theme={theme === "system" ? undefined : theme} className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, THEME_COLOR } from "@/lib/app-identity";
import "./globals.css";

// The two families of the prototype. Served by the application itself: nothing is fetched from Google at run time.
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow-condensed" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  robots: { index: false, follow: false },
  // Installed on the phone, it opens without the browser's bars and with a short name under the icon.
  appleWebApp: { capable: true, title: APP_SHORT_NAME, statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: THEME_COLOR };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}

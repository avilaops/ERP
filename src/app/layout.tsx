import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP Ludus Equipamentos",
  description: "Sistema comercial da Ludus Equipamentos.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

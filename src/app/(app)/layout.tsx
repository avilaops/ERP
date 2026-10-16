import { Sidebar } from "@/components/Sidebar";
import { getSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Without a session the page's own requirePermission redirects. The page must
  // still be rendered for that to happen: returning null here would answer 200.
  if (!session) return children;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar session={session} />
      {/* On a phone the last line of the page ends above the bar of destinations, never under it. */}
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:p-4 focus:text-brand">Ir para o conteúdo</a>
      <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-3 pb-[calc(var(--tabbar)+1rem)] md:px-8 md:py-6">{children}</main>
    </div>
  );
}

import { Sidebar } from "@/components/Sidebar";
import { getSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Without a session the page's own requirePermission redirects. The page must
  // still be rendered for that to happen: returning null here would answer 200.
  if (!session) return children;

  return (
    <div className="flex min-h-screen">
      <Sidebar session={session} />
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}

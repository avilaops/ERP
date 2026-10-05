import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { localProvider } from "@/lib/auth/local-provider";
import { ROLE_LABELS } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Login local · ERP Ludus" };
export const dynamic = "force-dynamic";

export default function DevLoginPage() {
  const provider = localProvider(process.env);
  if (!provider.available) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Login local</h1>
      <p className="text-sm text-slate-600">
        Só existe em desenvolvimento, com ERP_LOCAL_LOGIN=1. Escolha um perfil para ver o menu dele.
      </p>
      <form action="/dev/login/enter" method="post" className="flex flex-col gap-2">
        {provider.users.map((user) => (
          <button
            key={user.role}
            type="submit"
            name="role"
            value={user.role}
            className="rounded border border-slate-300 bg-white px-4 py-3 text-left hover:bg-slate-50"
          >
            <span className="font-medium">{ROLE_LABELS[user.role]}</span>
            <span className="block text-sm text-slate-500">{user.email}</span>
          </button>
        ))}
      </form>
    </main>
  );
}

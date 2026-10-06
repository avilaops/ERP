import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { localProvider } from "@/lib/auth/local-provider";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { tenantForHost } from "@/lib/auth/tenants";

export const metadata: Metadata = { title: "Login local · ERP" };
export const dynamic = "force-dynamic";

export default async function DevLoginPage() {
  const provider = localProvider(process.env);
  if (!provider.available) notFound();
  // On a company's own domain there is nothing to choose: it is that company.
  const hostTenant = tenantForHost(provider.tenants, (await headers()).get("host"));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Login local</h1>
      <p className="text-sm text-slate-600">
        Só existe em desenvolvimento, com ERP_LOCAL_LOGIN=1. Escolha um perfil para ver o menu dele
        {hostTenant ? ` em ${hostTenant.name}` : ""}.
      </p>
      {provider.tenants.length === 0 && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Nenhuma empresa configurada. Defina ERP_TENANTS (ex.: ludus:Ludus Equipamentos) e rode npm run db:migrate.
        </p>
      )}
      <form action="/dev/login/enter" method="post" className="flex flex-col gap-2">
        {!hostTenant && provider.tenants.length > 1 && (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Empresa
            <select name="tenant" className="rounded border border-slate-300 bg-white px-3 py-2 font-normal">
              {provider.tenants.map((tenant) => (
                <option key={tenant.slug} value={tenant.slug}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
        )}
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

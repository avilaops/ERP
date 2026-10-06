import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, listCompanies } from "@/lib/auth";

export const metadata: Metadata = { title: "Trocar de empresa · ERP" };
export const dynamic = "force-dynamic";

/** Only for who belongs to more than one company, on the shared address. */
export default async function EmpresaPage() {
  const session = await getSession();
  if (!session) redirect("/");
  const companies = await listCompanies();
  if (companies.length < 2) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1>Trocar de empresa</h1>
      <p className="text-sm text-slate-600">Você tem acesso a mais de uma empresa. Escolha em qual quer trabalhar agora.</p>
      <form action="/empresa/escolher" method="post" className="flex flex-col gap-2">
        {companies.map((company) => (
          <button
            key={company.slug}
            type="submit"
            name="tenant"
            value={company.slug}
            aria-current={company.slug === session.tenant.slug ? "true" : undefined}
            className={`rounded border px-4 py-3 text-left hover:bg-slate-50 ${
              company.slug === session.tenant.slug ? "border-brand bg-brand-soft" : "border-slate-300 bg-white"
            }`}
          >
            <span className="font-medium">{company.name}</span>
            {company.slug === session.tenant.slug && <span className="block text-sm text-slate-500">em uso agora</span>}
          </button>
        ))}
      </form>
    </main>
  );
}

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { menuItem } from "@/lib/auth/permissions";
import {
  completenessText,
  customersCounter,
  formatDocument,
  formatPhone,
  isComplete,
  matchesCustomer,
  taxpayerFromRegistration,
} from "@/lib/customer";
import { listCustomers } from "@/lib/db/customers";

const ITEM = menuItem("clientes");

export const metadata = { title: `${ITEM.label} · ERP` };
export const dynamic = "force-dynamic";

const NONE = "—";
const COLUMNS = ["Cliente", "CNPJ/CPF", "Cidade/UF", "Celular", "Contribuinte do ICMS", "Cadastro"];
const BUTTON = "rounded border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("clientes");
  const conn = tenantDb(session.tenant.slug);

  const search = (first((await searchParams).q) ?? "").trim();
  const all = await listCustomers(conn);
  const customers = all.filter((customer) => matchesCustomer(customer, search));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{ITEM.label}</h1>
          <p className="mt-1 text-slate-600">Um cadastro por CNPJ ou CPF, usado por toda a equipe nos pedidos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${ITEM.href}/novo?tipo=pj`} className={BUTTON}>
            Novo cliente PJ
          </Link>
          <Link href={`${ITEM.href}/novo?tipo=pf`} className={BUTTON}>
            Novo cliente PF
          </Link>
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white" aria-label="Clientes cadastrados">
        <div className="flex flex-wrap items-end justify-between gap-4 p-4">
          <form method="get" action={ITEM.href} role="search" className="flex w-full gap-2 sm:w-auto">
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Buscar nome, fantasia ou CNPJ/CPF"
              aria-label="Buscar nome, fantasia ou CNPJ/CPF"
              className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm sm:w-80 sm:flex-none outline-none focus:ring-2 focus:ring-brand"
            />
            <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
              Buscar
            </button>
          </form>
          <p className="text-xs text-slate-600">{customersCounter(customers.length)}</p>
        </div>

        {customers.length === 0 ? (
          <p className="border-t border-slate-200 p-6 text-slate-600">
            {all.length === 0
              ? "Nenhum cliente cadastrado ainda. O jeito mais rápido é preencher o bloco Cliente ao lançar um pedido."
              : `Nenhum cliente encontrado para "${search}".`}
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-t border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {COLUMNS.map((column) => (
                    <th key={column} scope="col" className="whitespace-nowrap px-4 py-2 text-left font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <Link href={`${ITEM.href}/${customer.id}`} className="font-medium text-brand underline">
                        {customer.name}
                      </Link>
                      {customer.tradeName && <span className="block text-xs text-slate-500">{customer.tradeName}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDocument(customer.document)}</td>
                    <td className="px-4 py-3">{[customer.city, customer.uf].filter(Boolean).join("/") || NONE}</td>
                    <td className="whitespace-nowrap px-4 py-3">{customer.phone ? formatPhone(customer.phone) : NONE}</td>
                    <td className="px-4 py-3">
                      {taxpayerFromRegistration(customer.kind, customer.stateRegistration) ? "Sim" : "Não"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          isComplete(customer) ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {completenessText(customer)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

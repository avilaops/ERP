import Link from "next/link";
import { ListPager, ListQuery } from "@/components/ListQuery";
import { CARD, EmptyState, PageHeader, Pill, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { completenessText, formatDocument, formatPhone, isComplete, taxpayerFromRegistration } from "@/lib/customer";
import { queryCustomers } from "@/lib/db/customers";
import { tenantDb } from "@/lib/db/pool";
import { showDate, showMoney } from "@/lib/format";
import { parseListQuery } from "@/lib/list-query";
import { UFS } from "@/lib/pricing/states";

const ITEM = menuItem("clientes");
const OPTIONS = {
  sorts: ["nome", "cadastro", "ultima_compra"] as const,
  defaultSort: "nome" as const,
  filters: { tipo: ["PJ", "PF"], uf: UFS, compra: ["com", "sem"] },
};

export const metadata = { title: `${ITEM.label} · ERP` };
export const dynamic = "force-dynamic";

const NONE = "—";
const COLUMNS = ["Cliente", "Documento", "Cidade/UF", "Celular", "Compras", "Última compra", "Cadastro"];

export default async function ClientesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("clientes");
  const query = parseListQuery(await searchParams, OPTIONS);
  const result = await queryCustomers(query, tenantDb(session.tenant.slug));
  const { items, ...page } = result;

  return (
    <>
      <PageHeader title={ITEM.label} hint="Um cadastro por CNPJ ou CPF, usado por toda a equipe nos pedidos." actions={<><Link href={`${ITEM.href}/novo?tipo=pj`} className={SECONDARY}>Novo cliente PJ</Link><Link href={`${ITEM.href}/novo?tipo=pf`} className={SECONDARY}>Novo cliente PF</Link></>} />

      <section className={`${CARD} mt-4 list-screen`} aria-label="Clientes cadastrados">
        <ListQuery
          path={ITEM.href}
          query={query}
          options={OPTIONS}
          searchLabel="Buscar cliente por nome, fantasia ou CPF/CNPJ"
          searchPlaceholder="Nome, fantasia ou CPF/CNPJ"
          sorts={[{ value: "nome", label: "Nome" }, { value: "cadastro", label: "Data de cadastro" }, { value: "ultima_compra", label: "Última compra" }]}
          filters={[
            { key: "tipo", label: "Tipo", multiple: true, choices: [{ value: "PJ", label: "Pessoa jurídica" }, { value: "PF", label: "Pessoa física" }] },
            { key: "compra", label: "Compras", choices: [{ value: "com", label: "Com compra" }, { value: "sem", label: "Sem compra" }] },
            { key: "uf", label: "Estado", multiple: true, choices: UFS.map((uf) => ({ value: uf, label: uf })) },
          ]}
        />

        {items.length === 0 ? (
          <EmptyState
            title={result.total === 0 && query.search === "" && Object.keys(query.filters).length === 0 ? "Nenhum cliente cadastrado" : "Nenhum cliente encontrado"}
            description={result.total === 0 && query.search === "" && Object.keys(query.filters).length === 0 ? "Cadastre o primeiro cliente para iniciar um pedido." : "Ajuste a busca ou remova os filtros para ver outros clientes."}
            action={result.total === 0 && query.search === "" && Object.keys(query.filters).length === 0 ? <Link href={`${ITEM.href}/novo?tipo=pj`} className={SECONDARY}>Cadastrar cliente</Link> : <Link href={ITEM.href} className={SECONDARY}>Limpar busca e filtros</Link>}
          />
        ) : (
          <div className="list-results">
            <ul className="md:hidden">
              {items.map((customer) => (
                <li key={customer.id} className="border-t border-slate-200 first:border-t-0">
                  <Link href={`${ITEM.href}/${customer.id}`} className="block px-4 py-3 active:bg-slate-50">
                    <span className="font-medium text-brand underline">{customer.name}</span>
                    {customer.tradeName && <span className="block text-sm text-slate-600">{customer.tradeName}</span>}
                    <span className="mt-1 block text-xs text-slate-500">{formatDocument(customer.document)} · {[customer.city, customer.uf].filter(Boolean).join("/") || NONE}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <Pill tone={customer.closedOrders > 0 ? "good" : "neutral"}>{customer.closedOrders > 0 ? `${customer.closedOrders} pedido${customer.closedOrders === 1 ? "" : "s"}` : "Sem compra"}</Pill>
                      {customer.closedOrders > 0 && <span>{showMoney(customer.totalBought)} · última em {showDate(customer.lastPurchase!)}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <table className="hidden w-full table-fixed text-sm md:table">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{COLUMNS.map((column) => <th key={column} scope="col" className="px-3 py-2 text-left font-semibold">{column}</th>)}</tr></thead>
              <tbody>
                {items.map((customer) => (
                  <tr key={customer.id} className="border-t border-slate-200 align-top">
                    <td className="px-3 py-3"><Link href={`${ITEM.href}/${customer.id}`} className="break-words font-medium text-brand underline">{customer.name}</Link>{customer.tradeName && <span className="block break-words text-xs text-slate-500">{customer.tradeName}</span>}</td>
                    <td className="px-3 py-3">{formatDocument(customer.document)}</td>
                    <td className="px-3 py-3">{[customer.city, customer.uf].filter(Boolean).join("/") || NONE}</td>
                    <td className="px-3 py-3">{customer.phone ? formatPhone(customer.phone) : NONE}</td>
                    <td className="px-3 py-3">{customer.closedOrders > 0 ? <><span className="block font-medium">{showMoney(customer.totalBought)}</span><span className="text-xs text-slate-500">{customer.closedOrders} pedido{customer.closedOrders === 1 ? "" : "s"}</span></> : NONE}</td>
                    <td className="px-3 py-3">{customer.lastPurchase ? showDate(customer.lastPurchase) : NONE}</td>
                    <td className="px-3 py-3"><Pill tone={isComplete(customer) ? "good" : "warn"}>{completenessText(customer)}</Pill><span className="mt-1 block text-xs text-slate-500">ICMS: {taxpayerFromRegistration(customer.kind, customer.stateRegistration) ? "contribuinte" : "não contribuinte"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPager path={ITEM.href} query={query} options={OPTIONS} result={page} noun={["cliente", "clientes"]} />
      </section>
    </>
  );
}

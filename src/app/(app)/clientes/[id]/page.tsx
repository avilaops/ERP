import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { allows, menuItem } from "@/lib/auth/permissions";
import { CnpjError, companySummary, lookupCnpj } from "@/lib/cnpj";
import type { CompanyRecord } from "@/lib/cnpj";
import type { CustomerFormValues } from "@/lib/customer-form";
import { ufFromCep } from "@/lib/cep";
import { completenessText, formatCep, formatDocument, formatPhone, isComplete, isRequired } from "@/lib/customer";
import type { CustomerKind } from "@/lib/customer";
import { CUSTOMER_FIELDS, customerToForm } from "@/lib/customer-form";
import { getCustomer } from "@/lib/db/customers";
import { saveCustomerAction, deleteCustomerAction } from "../actions";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { CustomerForm } from "../CustomerForm";

const ITEM = menuItem("clientes");

export const metadata = { title: `${ITEM.label} · ERP` };
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const requiredOf = (kind: CustomerKind) =>
  [...CUSTOMER_FIELDS[kind].main, ...CUSTOMER_FIELDS[kind].address].map(({ key }) => key).filter((key) => isRequired(kind, key));

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("clientes");
  const conn = tenantDb(session.tenant.slug);

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const back = (
    <Link href={ITEM.href} className="text-sm text-brand underline">
      ← {ITEM.label}
    </Link>
  );

  if (id === "novo") {
    const kind: CustomerKind = first(query.tipo) === "pf" ? "PF" : "PJ";
    // "Buscar na Receita": a company comes filled in from its CNPJ. Nothing is saved by the search.
    const typed = kind === "PJ" ? (first(query.cnpj) ?? "").trim() : "";
    let found: CompanyRecord | null = null;
    let refused: string | null = null;
    if (typed !== "") {
      try {
        found = await lookupCnpj(typed);
      } catch (error) {
        if (!(error instanceof CnpjError)) throw error;
        refused = error.message;
      }
    }
    const filled: CustomerFormValues = found
      ? {
          document: formatDocument(found.cnpj), name: found.legalName, tradeName: found.tradeName ?? "", phone: found.phone ? formatPhone(found.phone) : "", email: found.email ?? "",
          cep: found.cep ? formatCep(found.cep) : "", street: found.street ?? "", streetNumber: found.number ?? "", complement: found.complement ?? "", district: found.district ?? "", city: found.city ?? "", uf: found.uf ?? "",
        }
      : {};
    return (
      <>
        {back}
        <h1 className="mt-2 text-2xl font-semibold">{kind === "PJ" ? "Novo cliente PJ" : "Novo cliente PF"}</h1>
        <p className="mt-1 text-slate-600">
          Para gravar bastam o {kind === "PJ" ? "CNPJ e a razão social" : "CPF e o nome"}; o resto pode ser completado depois.
        </p>
        {kind === "PJ" && (
          <form method="get" role="search" className="mt-4 flex max-w-xl items-end gap-2">
            <label className="min-w-0 flex-1 text-sm font-medium text-slate-700">
              Preencher pelo CNPJ
              <input type="text" name="cnpj" inputMode="numeric" defaultValue={typed} placeholder="00.000.000/0000-00" autoComplete="off" className="mt-1 block min-h-[var(--control)] w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-brand" />
            </label>
            <button type="submit" className="inline-flex min-h-[var(--control)] items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">
              Buscar na Receita
            </button>
          </form>
        )}
        {refused && (
          <p role="alert" className="mt-2 max-w-xl rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {refused}
          </p>
        )}
        {found && (
          <p role="status" className="mt-2 max-w-4xl rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {companySummary(found)}. Confira os dados abaixo e complete o que faltar antes de gravar.
          </p>
        )}
        <div className="mt-6 max-w-4xl">
          <CustomerForm key={found?.cnpj ?? "vazio"} kind={kind} id={null} saved={filled} required={requiredOf(kind)} cepNote={null} action={saveCustomerAction} />
        </div>
      </>
    );
  }

  const customer = /^\d+$/.test(id) ? await getCustomer(Number(id), conn) : null;
  if (!customer) notFound();

  const uf = customer.cep ? ufFromCep(customer.cep) : null;
  const complete = isComplete(customer);

  return (
    <>
      {back}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{customer.tradeName ?? customer.name}</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            complete ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
          }`}
        >
          {completenessText(customer)}
        </span>
        {/* The sales in progress with this customer live in the funnel; each seller finds their own there. */}
        {allows(session, "funil") && (
          <Link href={`${menuItem("funil").href}?q=${encodeURIComponent(customer.name)}`} className="text-sm font-medium text-brand underline">
            Ver no funil
          </Link>
        )}
      </div>
      {first(query.cadastrado) && (
        <p role="status" className="mt-4 max-w-4xl rounded border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          Cliente cadastrado.{!complete && " Complete os campos com * para poder fechar pedido com ele."}
        </p>
      )}
      <div className="mt-6 max-w-4xl">
        <CustomerForm
          kind={customer.kind}
          id={customer.id}
          saved={customerToForm(customer)}
          required={requiredOf(customer.kind)}
          cepNote={uf && `Pelo CEP, o estado é ${uf}. Preencha rua, bairro e cidade.`}
          action={saveCustomerAction}
        />
        <ActionForm action={deleteCustomerAction} className="mt-4">
          <input type="hidden" name="id" value={customer.id} />
          <ConfirmButton label="Remover cliente" confirmLabel="Confirmar: remover" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />
        </ActionForm>
      </div>
    </>
  );
}

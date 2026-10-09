import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { allows, menuItem } from "@/lib/auth/permissions";
import { ufFromCep } from "@/lib/cep";
import { completenessText, isComplete, isRequired } from "@/lib/customer";
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
    return (
      <>
        {back}
        <h1 className="mt-2 text-2xl font-semibold">{kind === "PJ" ? "Novo cliente PJ" : "Novo cliente PF"}</h1>
        <p className="mt-1 text-slate-600">
          Para gravar bastam o {kind === "PJ" ? "CNPJ e a razão social" : "CPF e o nome"}; o resto pode ser completado depois.
        </p>
        <div className="mt-6 max-w-4xl">
          <CustomerForm kind={kind} id={null} saved={{}} required={requiredOf(kind)} cepNote={null} action={saveCustomerAction} />
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

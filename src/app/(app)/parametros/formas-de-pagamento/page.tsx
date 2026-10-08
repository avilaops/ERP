import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listAllPaymentMethods } from "@/lib/db/payment-methods";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { createPaymentMethodAction, updatePaymentMethodAction, deletePaymentMethodAction } from "./actions";

export const metadata = { title: "Formas de pagamento · ERP" };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";

export default async function FormasDePagamentoPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const methods = await listAllPaymentMethods(conn);

  return (
    <>
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className="text-brand underline">
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Formas de pagamento</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        É a lista que aparece no pedido, na entrada e no saldo. Forma desligada sai das listas; os pedidos que já a usaram continuam
        mostrando o nome.
      </p>

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="nova">
        <h2 id="nova" className="text-sm font-semibold uppercase tracking-wide">
          Adicionar forma
        </h2>
        <ActionForm action={createPaymentMethodAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="new-label" className="block text-sm font-medium">
              Nome
            </label>
            <input id="new-label" name="label" type="text" maxLength={60} autoComplete="off" className={`${INPUT} mt-1 w-full`} />
          </div>
          <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
            Adicionar
          </button>
        </ActionForm>
      </section>

      <section className={`${CARD} mt-6`} aria-labelledby="lista">
        <h2 id="lista" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Formas cadastradas ({methods.length})
        </h2>
        <ul>
          {methods.map((method) => (
            <li key={method.id} className="border-t border-slate-200 px-5 py-3 first:border-t-0">
              <ActionForm action={updatePaymentMethodAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={method.id} />
                <div>
                  <label htmlFor={`position-${method.id}`} className="block text-xs font-medium text-slate-600">
                    Ordem
                  </label>
                  <input
                    key={method.position}
                    id={`position-${method.id}`}
                    name="position"
                    type="text"
                    inputMode="numeric"
                    size={1}
                    defaultValue={method.position}
                    className={`${INPUT} mt-1 w-16 text-right`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label htmlFor={`label-${method.id}`} className="block text-xs font-medium text-slate-600">
                    Nome
                  </label>
                  <input
                    key={method.label}
                    id={`label-${method.id}`}
                    name="label"
                    type="text"
                    maxLength={60}
                    defaultValue={method.label}
                    className={`${INPUT} mt-1 w-full`}
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input key={String(method.active)} type="checkbox" name="active" value="sim" defaultChecked={method.active} /> Em uso
                </label>
                <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                  Salvar
                </button>
              </ActionForm>
              <ActionForm action={deletePaymentMethodAction} className="mt-1">
                <input type="hidden" name="id" value={method.id} />
                <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

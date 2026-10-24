import Link from "next/link";
import { CARD, DANGER, PageHeader, Pager, Pill, PRIMARY, SECONDARY, pageOf } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listAllPaymentMethods } from "@/lib/db/payment-methods";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { createPaymentMethodAction, updatePaymentMethodAction, deletePaymentMethodAction } from "./actions";

export const metadata = { title: "Formas de pagamento · ERP" };
export const dynamic = "force-dynamic";

const INPUT = "min-h-[var(--control)] rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-brand";

export default async function FormasDePagamentoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const methods = await listAllPaymentMethods(conn);
  const query = await searchParams;
  const slice = pageOf(methods, typeof query.pagina === "string" ? query.pagina : undefined, 10);

  return (
    <>
      <PageHeader title="Formas de pagamento" hint="É a lista que aparece no pedido, na entrada e no saldo. Forma desligada sai das listas; os pedidos que já a usaram continuam mostrando o nome." actions={<Link href={menuItem("parametros").href} className={SECONDARY}>Configurações</Link>} />

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="nova">
        <h2 id="nova" className="text-sm font-semibold uppercase tracking-wide">
          Adicionar forma
        </h2>
        <ActionForm action={createPaymentMethodAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-0 basis-full sm:basis-48 sm:flex-1">
            <label htmlFor="new-label" className="block text-sm font-medium">
              Nome
            </label>
            <input id="new-label" name="label" type="text" maxLength={60} autoComplete="off" className={`${INPUT} mt-1 w-full`} />
          </div>
          <button type="submit" className={PRIMARY}>
            Adicionar
          </button>
        </ActionForm>
      </section>

      <section className={`${CARD} mt-6`} aria-labelledby="lista">
        <h2 id="lista" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Formas cadastradas ({methods.length})
        </h2>
        <ul>
          {slice.rows.map((method) => (
            <li key={method.id} className="border-t border-slate-200 first:border-t-0">
              <details name="forma-em-edicao" className="group">
                <summary className="flex min-h-[var(--control)] cursor-pointer items-center gap-3 px-5 py-2">
                  <span className="w-6 shrink-0 text-right text-sm tabular-nums text-slate-500">{method.position}</span>
                  <span className="min-w-0 flex-1 font-medium">{method.label}</span>
                  {method.onDelivery && <Pill tone="neutral">saldo na entrega</Pill>}
                  {!method.active && <Pill tone="warn">desligada</Pill>}
                  <span className="text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                </summary>
                <div className="border-t border-slate-200 px-5 py-3">
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
                    <div className="min-w-0 basis-full sm:basis-48 sm:flex-1">
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
                    <label className="flex min-h-[var(--control)] items-center gap-2 text-sm">
                      <input key={String(method.active)} type="checkbox" name="active" value="sim" defaultChecked={method.active} /> Em uso
                    </label>
                    <label
                      className="flex min-h-[var(--control)] items-center gap-2 text-sm"
                      title="Escolhida para o saldo, vira uma parcela só, no dia em que o pedido fica pronto."
                    >
                      <input
                        key={String(method.onDelivery)}
                        type="checkbox"
                        name="onDelivery"
                        value="sim"
                        defaultChecked={method.onDelivery}
                      />{" "}
                      Saldo na entrega
                    </label>
                    <button type="submit" className={SECONDARY}>
                      Salvar
                    </button>
                  </ActionForm>
                  <ActionForm action={deletePaymentMethodAction} className="mt-1">
                    <input type="hidden" name="id" value={method.id} />
                    <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className={DANGER} />
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
        <Pager {...slice} noun={["forma", "formas"]} hrefFor={(page) => (page === 1 ? "/parametros/formas-de-pagamento" : `/parametros/formas-de-pagamento?pagina=${page}`)} />
      </section>
    </>
  );
}

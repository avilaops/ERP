import Link from "next/link";
import { CARD, DANGER, PageHeader, Pager, Pill, PRIMARY, SECONDARY, pageOf } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listAllPayableCategories } from "@/lib/db/payable-categories";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { createPayableCategoryAction, updatePayableCategoryAction, deletePayableCategoryAction } from "./actions";

export const metadata = { title: "Categorias de contas · ERP" };
export const dynamic = "force-dynamic";

const INPUT = "min-h-[var(--control)] rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-brand";

export default async function CategoriasDeContasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const categories = await listAllPayableCategories(conn);
  const query = await searchParams;
  const slice = pageOf(categories, typeof query.pagina === "string" ? query.pagina : undefined, 10);

  return (
    <>
      <PageHeader title="Categorias de contas a pagar" hint="É a lista que aparece ao lançar uma conta a pagar. Categoria desligada sai da lista; as contas que já a usaram continuam mostrando o nome." actions={<Link href={menuItem("parametros").href} className={SECONDARY}>Configurações</Link>} />

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="nova">
        <h2 id="nova" className="text-sm font-semibold uppercase tracking-wide">
          Adicionar categoria
        </h2>
        <ActionForm action={createPayableCategoryAction} className="mt-3 flex flex-wrap items-end gap-3">
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
          Categorias cadastradas ({categories.length})
        </h2>
        <ul>
          {slice.rows.map((category) => (
            <li key={category.id} className="border-t border-slate-200 first:border-t-0">
              <details name="categoria-em-edicao" className="group">
                <summary className="flex min-h-[var(--control)] cursor-pointer items-center gap-3 px-5 py-2">
                  <span className="w-6 shrink-0 text-right text-sm tabular-nums text-slate-500">{category.position}</span>
                  <span className="min-w-0 flex-1 font-medium">{category.label}</span>
                  {!category.active && <Pill tone="warn">desligada</Pill>}
                  <span className="text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                </summary>
                <div className="border-t border-slate-200 px-5 py-3">
                  <ActionForm action={updatePayableCategoryAction} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={category.id} />
                    <div>
                      <label htmlFor={`position-${category.id}`} className="block text-xs font-medium text-slate-600">
                        Ordem
                      </label>
                      <input
                        key={category.position}
                        id={`position-${category.id}`}
                        name="position"
                        type="text"
                        inputMode="numeric"
                        size={1}
                        defaultValue={category.position}
                        className={`${INPUT} mt-1 w-16 text-right`}
                      />
                    </div>
                    <div className="min-w-0 basis-full sm:basis-48 sm:flex-1">
                      <label htmlFor={`label-${category.id}`} className="block text-xs font-medium text-slate-600">
                        Nome
                      </label>
                      <input
                        key={category.label}
                        id={`label-${category.id}`}
                        name="label"
                        type="text"
                        maxLength={60}
                        defaultValue={category.label}
                        className={`${INPUT} mt-1 w-full`}
                      />
                    </div>
                    <label className="flex min-h-[var(--control)] items-center gap-2 text-sm">
                      <input key={String(category.active)} type="checkbox" name="active" value="sim" defaultChecked={category.active} /> Em
                      uso
                    </label>
                    <button type="submit" className={SECONDARY}>
                      Salvar
                    </button>
                  </ActionForm>
                  <ActionForm action={deletePayableCategoryAction} className="mt-1">
                    <input type="hidden" name="id" value={category.id} />
                    <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className={DANGER} />
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
        <Pager {...slice} noun={["categoria", "categorias"]} hrefFor={(page) => (page === 1 ? "/parametros/categorias-de-contas" : `/parametros/categorias-de-contas?pagina=${page}`)} />
      </section>
    </>
  );
}

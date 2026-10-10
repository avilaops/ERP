import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listAllPayableCategories } from "@/lib/db/payable-categories";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { createPayableCategoryAction, updatePayableCategoryAction, deletePayableCategoryAction } from "./actions";

export const metadata = { title: "Categorias de contas · ERP" };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";

export default async function CategoriasDeContasPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const categories = await listAllPayableCategories(conn);

  return (
    <>
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className="text-brand underline">
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Categorias de contas a pagar</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        É a lista que aparece ao lançar uma conta a pagar. Categoria desligada sai da lista; as contas que já a usaram continuam
        mostrando o nome.
      </p>

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
          <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
            Adicionar
          </button>
        </ActionForm>
      </section>

      <section className={`${CARD} mt-6`} aria-labelledby="lista">
        <h2 id="lista" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Categorias cadastradas ({categories.length})
        </h2>
        <ul>
          {categories.map((category) => (
            <li key={category.id} className="border-t border-slate-200 px-5 py-3 first:border-t-0">
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
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input key={String(category.active)} type="checkbox" name="active" value="sim" defaultChecked={category.active} /> Em uso
                </label>
                <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                  Salvar
                </button>
              </ActionForm>
              <ActionForm action={deletePayableCategoryAction} className="mt-1">
                <input type="hidden" name="id" value={category.id} />
                <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

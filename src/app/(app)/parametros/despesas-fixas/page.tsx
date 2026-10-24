import Link from "next/link";
import { CARD, DANGER, INPUT, PageHeader, Pager, PRIMARY, SECONDARY, pageOf } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listFixedExpenses } from "@/lib/db/fixed-expenses";
import type { FixedExpense } from "@/lib/db/fixed-expenses";
import { listAllPayableCategories } from "@/lib/db/payable-categories";
import { tenantDb } from "@/lib/db/pool";
import { formatMoney, showMoney } from "@/lib/format";
import { roundCents } from "@/lib/pricing/money";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { createFixedExpenseAction, deleteFixedExpenseAction, updateFixedExpenseAction } from "./actions";

export const metadata = { title: "Despesas fixas · ERP" };
export const dynamic = "force-dynamic";

const LABEL = "block text-xs font-medium text-slate-600";

function Fields({ saved, categories }: { saved: FixedExpense | null; categories: string[] }) {
  const id = saved?.id ?? "nova";
  const options = saved && !categories.includes(saved.category) ? [...categories, saved.category] : categories;
  return (
    <>
      <div className="min-w-40 flex-1">
        <label htmlFor={`label-${id}`} className={LABEL}>
          Despesa
        </label>
        <input key={saved?.label} id={`label-${id}`} name="label" type="text" maxLength={80} defaultValue={saved?.label ?? ""} autoComplete="off" className={INPUT} />
      </div>
      <div className="min-w-40 flex-1">
        <label htmlFor={`category-${id}`} className={LABEL}>
          Categoria
        </label>
        <select key={saved?.category} id={`category-${id}`} name="category" defaultValue={saved?.category ?? ""} className={INPUT}>
          {!saved && <option value="">—</option>}
          {options.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="w-32">
        <label htmlFor={`amount-${id}`} className={LABEL}>
          Valor (R$)
        </label>
        <input
          key={saved?.amount}
          id={`amount-${id}`}
          name="amount"
          type="text"
          inputMode="decimal"
          defaultValue={saved ? formatMoney(saved.amount) : ""}
          placeholder="0,00"
          className={`${INPUT} text-right`}
        />
      </div>
      <div className="w-24">
        <label htmlFor={`day-${id}`} className={LABEL}>
          Vence no dia
        </label>
        <input key={saved?.dueDay} id={`day-${id}`} name="dueDay" type="text" inputMode="numeric" defaultValue={saved?.dueDay ?? ""} className={`${INPUT} text-right`} />
      </div>
    </>
  );
}

export default async function DespesasFixasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const expenses = await listFixedExpenses(conn);
  const query = await searchParams;
  const slice = pageOf(expenses, typeof query.pagina === "string" ? query.pagina : undefined, 10);
  const categories = (await listAllPayableCategories(conn)).filter((category) => category.active).map((category) => category.label);
  const total = roundCents(expenses.filter((expense) => expense.active).reduce((sum, expense) => sum + expense.amount, 0));

  return (
    <>
      <PageHeader title="Despesas fixas" hint="O que a empresa paga todo mês. A soma das despesas em uso é o valor “Despesas fixas por mês” dos Parâmetros, usado no ponto de equilíbrio. Em Contas a pagar, um botão lança as contas do mês a partir desta lista." actions={<Link href={menuItem("parametros").href} className={SECONDARY}>Configurações</Link>} />
      <p className="mt-3 text-lg">
        Total em uso: <strong>{showMoney(total)}</strong> por mês
      </p>

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="nova">
        <h2 id="nova" className="text-sm font-semibold uppercase tracking-wide">
          Adicionar despesa
        </h2>
        <ActionForm action={createFixedExpenseAction} className="mt-3 flex flex-wrap items-end gap-3">
          <Fields saved={null} categories={categories} />
          <button type="submit" className={PRIMARY}>
            Adicionar
          </button>
        </ActionForm>
      </section>

      <section className={`${CARD} mt-6`} aria-labelledby="lista">
        <h2 id="lista" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Cadastradas ({expenses.length})
        </h2>
        {expenses.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nenhuma despesa fixa cadastrada ainda.</p>
        ) : (
          <ul>
            {slice.rows.map((expense) => (
              <li key={expense.id} className="border-t border-slate-200 px-5 py-3 first:border-t-0">
                <details name="despesa-em-edicao" className="group">
                  <summary className="disclosure-heading">{expense.label} · {showMoney(expense.amount)}<span className="disclosure-marker" aria-hidden="true">+</span></summary>
                  <div className="border-t border-slate-200 pt-3">
                <ActionForm action={updateFixedExpenseAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={expense.id} />
                  <input type="hidden" name="hasActive" value="1" />
                  <Fields saved={expense} categories={categories} />
                  <label className="flex min-h-[var(--control)] items-center gap-2 text-sm">
                    <input key={String(expense.active)} type="checkbox" name="active" value="sim" defaultChecked={expense.active} /> Em uso
                  </label>
                  <button type="submit" className={SECONDARY}>
                    Salvar
                  </button>
                </ActionForm>
                <ActionForm action={deleteFixedExpenseAction} className="mt-1">
                  <input type="hidden" name="id" value={expense.id} />
                  <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className={DANGER} />
                </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <Pager {...slice} noun={["despesa", "despesas"]} hrefFor={(page) => (page === 1 ? "/parametros/despesas-fixas" : `/parametros/despesas-fixas?pagina=${page}`)} />
      </section>
    </>
  );
}

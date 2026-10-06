import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listFixedExpenses } from "@/lib/db/fixed-expenses";
import type { FixedExpense } from "@/lib/db/fixed-expenses";
import { listAllPayableCategories } from "@/lib/db/payable-categories";
import { tenantDb } from "@/lib/db/pool";
import { formatMoney, showMoney } from "@/lib/format";
import { roundCents } from "@/lib/pricing/money";
import { ActionForm } from "../../pedidos/ActionForm";
import { createFixedExpenseAction, updateFixedExpenseAction } from "./actions";

export const metadata = { title: "Despesas fixas · ERP" };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
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

export default async function DespesasFixasPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const expenses = await listFixedExpenses(conn);
  const categories = (await listAllPayableCategories(conn)).filter((category) => category.active).map((category) => category.label);
  const total = roundCents(expenses.filter((expense) => expense.active).reduce((sum, expense) => sum + expense.amount, 0));

  return (
    <>
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className="text-brand underline">
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Despesas fixas</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        O que a empresa paga todo mês. A soma das despesas em uso é o valor “Despesas fixas por mês” dos Parâmetros, usado no ponto de
        equilíbrio. Em Contas a pagar, um botão lança as contas do mês a partir desta lista.
      </p>
      <p className="mt-3 text-lg">
        Total em uso: <strong>{showMoney(total)}</strong> por mês
      </p>

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="nova">
        <h2 id="nova" className="text-sm font-semibold uppercase tracking-wide">
          Adicionar despesa
        </h2>
        <ActionForm action={createFixedExpenseAction} className="mt-3 flex flex-wrap items-end gap-3">
          <Fields saved={null} categories={categories} />
          <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
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
            {expenses.map((expense) => (
              <li key={expense.id} className="border-t border-slate-200 px-5 py-3 first:border-t-0">
                <ActionForm action={updateFixedExpenseAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={expense.id} />
                  <input type="hidden" name="hasActive" value="1" />
                  <Fields saved={expense} categories={categories} />
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input key={String(expense.active)} type="checkbox" name="active" value="sim" defaultChecked={expense.active} /> Em uso
                  </label>
                  <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                    Salvar
                  </button>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

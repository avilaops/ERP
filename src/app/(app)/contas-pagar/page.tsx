import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { canAccess, menuItem } from "@/lib/auth/permissions";
import { monthLabel } from "@/lib/commissions-view";
import { listPaymentMethods } from "@/lib/db/orders";
import { listPayableCategories } from "@/lib/db/payable-categories";
import { listCommissionsDue, listPayables } from "@/lib/db/payables";
import { tenantDb } from "@/lib/db/pool";
import { listSuppliers } from "@/lib/db/suppliers";
import { formatMoney, isoDate, showIsoDate, showMoney } from "@/lib/format";
import { inPayableTab, PAYABLE_TABS, parsePayableTab, payablesSummary } from "@/lib/payables-view";
import { addDays } from "@/lib/pricing/payment";
import { ActionForm } from "../pedidos/ActionForm";
import { ConfirmButton } from "../pedidos/ConfirmButton";
import { createPayableAction, deletePayableAction, payPayableAction, unpayPayableAction } from "./actions";

export const metadata = { title: `${menuItem("contas-pagar").label} · ERP` };
export const dynamic = "force-dynamic";

const HERE = menuItem("contas-pagar").href;
const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const SMALL = "mt-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand";
const LABEL = "block text-sm font-medium";
const count = (n: number) => `${n} ${n === 1 ? "conta" : "contas"}`;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ContasPagarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("contas-pagar");
  const conn = tenantDb(session.tenant.slug);
  const tab = parsePayableTab(first((await searchParams).aba));

  const today = isoDate(new Date());
  const payables = await listPayables(conn);
  const commissions = await listCommissionsDue(conn);
  const categories = await listPayableCategories(conn);
  const methods = await listPaymentMethods(conn);
  const suppliers = (await listSuppliers(conn)).filter((supplier) => supplier.active);
  const summary = payablesSummary(payables, commissions, { today, inSevenDays: addDays(today, 7), month: today.slice(0, 7) });
  const shown = payables.filter((payable) => inPayableTab(payable, tab));
  const owed = tab === "pagas" ? [] : commissions.filter((item) => item.amount > 0);

  const cards = [
    ["A pagar", showMoney(summary.open.total), count(summary.open.count), ""],
    ["Vencidas", showMoney(summary.overdue.total), count(summary.overdue.count), summary.overdue.count > 0 ? "text-red-700" : ""],
    ["Vence em 7 dias", showMoney(summary.nextDays.total), count(summary.nextDays.count), ""],
    ["Pago no mês", showMoney(summary.paidInMonth.total), count(summary.paidInMonth.count), ""],
  ] as const;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{menuItem("contas-pagar").label}</h1>
          <p className="mt-1 text-slate-600">Tudo o que a empresa tem a pagar, com as comissões devidas aos vendedores.</p>
        </div>
        <a href="/api/contas-pagar/exportar" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
          Baixar planilha (CSV)
        </a>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map(([label, value, note, color]) => (
          <div key={label} className={`${CARD} p-4`}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className={`mt-1 text-lg font-bold sm:text-2xl ${color}`}>{value}</dd>
            <dd className="text-xs text-slate-600">{note}</dd>
          </div>
        ))}
      </dl>

      <details className={`${CARD} mt-6`}>
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold uppercase tracking-wide">+ Lançar conta</summary>
        <ActionForm action={createPayableAction} className="grid gap-4 border-t border-slate-200 p-5 sm:grid-cols-2 xl:grid-cols-3">
          <div className="sm:col-span-2 xl:col-span-3">
            <label htmlFor="description" className={LABEL}>
              Descrição
            </label>
            <input id="description" name="description" type="text" autoComplete="off" className={INPUT} />
          </div>
          <div>
            <label htmlFor="category" className={LABEL}>
              Categoria
            </label>
            <select id="category" name="category" defaultValue="" className={INPUT}>
              <option value="">—</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="supplierId" className={LABEL}>
              Fornecedor
            </label>
            <select id="supplierId" name="supplierId" defaultValue="" className={INPUT}>
              <option value="">—</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.tradeName ?? supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="amount" className={LABEL}>
              Valor (R$)
            </label>
            <input id="amount" name="amount" type="text" inputMode="decimal" placeholder="0,00" className={`${INPUT} text-right`} />
          </div>
          <div>
            <label htmlFor="dueDate" className={LABEL}>
              Vencimento
            </label>
            <input id="dueDate" name="dueDate" type="date" defaultValue={today} className={INPUT} />
          </div>
          <div>
            <label htmlFor="method" className={LABEL}>
              Forma
            </label>
            <select id="method" name="method" defaultValue="" className={INPUT}>
              <option value="">—</option>
              {methods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 xl:col-span-3">
            <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
              Lançar conta
            </button>
          </div>
        </ActionForm>
      </details>

      <nav aria-label="Situação" className="mt-6 flex w-fit flex-wrap rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
        {PAYABLE_TABS.map((item) => (
          <Link
            key={item.key}
            href={item.key === "abertas" ? HERE : `${HERE}?aba=${item.key}`}
            aria-current={item.key === tab ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 font-medium ${item.key === tab ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
          >
            {item.label} ({payables.filter((payable) => inPayableTab(payable, item.key)).length})
          </Link>
        ))}
      </nav>

      <section className={`${CARD} mt-4`} aria-label="Contas">
        {shown.length === 0 && owed.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nenhuma conta nesta aba.</p>
        ) : (
          <ul>
            {owed.map((item) => (
              <li key={`${item.sellerEmail}-${item.month}`} className="border-t border-slate-200 px-5 py-4 first:border-t-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Comissão de {item.sellerName}</p>
                    <p className="text-xs text-slate-500">Comissões · {monthLabel(item.month)} · conta automática</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{showMoney(item.amount)}</p>
                    <p className={`text-sm ${item.dueDate < today ? "font-medium text-red-700" : "text-slate-600"}`}>
                      {item.dueDate < today ? "venceu em" : "vence em"} {showIsoDate(item.dueDate)}
                    </p>
                  </div>
                </div>
                {canAccess(session.role, "comissoes") && (
                  <p className="mt-2 text-sm">
                    <Link href={`${menuItem("comissoes").href}?mes=${item.month}`} className="font-medium text-brand underline">
                      Pagar em Comissões
                    </Link>
                  </p>
                )}
              </li>
            ))}
            {shown.map((payable) => {
              const late = payable.status === "aberta" && payable.dueDate < today;
              return (
                <li key={payable.id} className="border-t border-slate-200 px-5 py-4 first:border-t-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{payable.description}</p>
                      <p className="text-xs text-slate-500">{[payable.category, payable.supplierName, payable.method].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{showMoney(payable.amount)}</p>
                      {payable.status === "paga" && payable.paidOn ? (
                        <p className="text-sm text-emerald-800">
                          paga em {showIsoDate(payable.paidOn)}
                          {payable.paidAmount !== null && payable.paidAmount !== payable.amount ? ` · ${showMoney(payable.paidAmount)}` : ""}
                        </p>
                      ) : (
                        <p className={`text-sm ${late ? "font-medium text-red-700" : "text-slate-600"}`}>
                          {late ? "venceu em" : "vence em"} {showIsoDate(payable.dueDate)}
                        </p>
                      )}
                    </div>
                  </div>
                  {payable.status === "aberta" ? (
                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                      <ActionForm action={payPayableAction} className="flex flex-wrap items-end gap-3">
                        <input type="hidden" name="id" value={payable.id} />
                        <div>
                          <label htmlFor={`on-${payable.id}`} className="block text-xs font-medium text-slate-600">
                            Pago em
                          </label>
                          <input id={`on-${payable.id}`} name="paidOn" type="date" defaultValue={today} max={today} className={SMALL} />
                        </div>
                        <div>
                          <label htmlFor={`amount-${payable.id}`} className="block text-xs font-medium text-slate-600">
                            Valor pago
                          </label>
                          <input
                            id={`amount-${payable.id}`}
                            name="paidAmount"
                            type="text"
                            inputMode="decimal"
                            defaultValue={formatMoney(payable.amount)}
                            className={`${SMALL} w-32 text-right`}
                          />
                        </div>
                        <div>
                          <label htmlFor={`method-${payable.id}`} className="block text-xs font-medium text-slate-600">
                            Forma
                          </label>
                          <select
                            id={`method-${payable.id}`}
                            name="method"
                            defaultValue={payable.method && methods.includes(payable.method) ? payable.method : ""}
                            className={SMALL}
                          >
                            <option value="">—</option>
                            {methods.map((method) => (
                              <option key={method} value={method}>
                                {method}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                          Pagar
                        </button>
                      </ActionForm>
                      <ActionForm action={deletePayableAction}>
                        <input type="hidden" name="id" value={payable.id} />
                        <ConfirmButton label="Excluir" confirmLabel="Confirmar exclusão" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />
                      </ActionForm>
                    </div>
                  ) : (
                    <ActionForm action={unpayPayableAction} className="mt-2">
                      <input type="hidden" name="id" value={payable.id} />
                      <ConfirmButton label="Desfazer pagamento" confirmLabel="Confirmar: voltar para a pagar" className="rounded px-2 py-1 text-sm text-slate-700 underline hover:bg-slate-100" />
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

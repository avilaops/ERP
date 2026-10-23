import Link from "next/link";
import { cookies } from "next/headers";
import { FitRows } from "@/components/FitRows";
import { CARD, DANGER, INPUT, PRIMARY, SECONDARY, PageHeader, MetricSummary, Pager, pageOf, ViewTabs } from "@/components/ui";
import { rowsPerPage } from "@/lib/rows";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem } from "@/lib/auth/permissions";
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
import {
  createPayableAction,
  deletePayableAction,
  launchFixedExpensesAction,
  payPayableAction,
  unpayPayableAction,
  updatePayableAction,
} from "./actions";

export const metadata = { title: `${menuItem("contas-pagar").label} · ERP` };
export const dynamic = "force-dynamic";

const HERE = menuItem("contas-pagar").href;
const SMALL = INPUT;
const LABEL = "block text-sm font-medium text-slate-700";
const count = (n: number) => `${n} ${n === 1 ? "conta" : "contas"}`;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ContasPagarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("contas-pagar");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  const tab = parsePayableTab(first(query.aba));

  const today = isoDate(new Date());
  const payables = await listPayables(conn);
  const commissions = await listCommissionsDue(conn);
  const categories = await listPayableCategories(conn);
  const methods = await listPaymentMethods(conn);
  const suppliers = (await listSuppliers(conn)).filter((supplier) => supplier.active);
  const summary = payablesSummary(payables, commissions, { today, inSevenDays: addDays(today, 7), month: today.slice(0, 7) });
  const shown = payables.filter((payable) => inPayableTab(payable, tab));
  const owed = tab === "pagas" ? [] : commissions.filter((item) => item.amount > 0);
  const size = rowsPerPage((await cookies()).get("erp_linhas_pagar")?.value, 1);
  const slice = pageOf([...owed.map((item) => ({ type: "commission" as const, item })), ...shown.map((item) => ({ type: "payable" as const, item }))], first(query.p), size);
  const visibleCommissions = slice.rows.flatMap((row) => row.type === "commission" ? [row.item] : []);
  const visiblePayables = slice.rows.flatMap((row) => row.type === "payable" ? [row.item] : []);

  const cards = [
    ["A pagar", showMoney(summary.open.total), count(summary.open.count), ""],
    ["Vencidas", showMoney(summary.overdue.total), count(summary.overdue.count), summary.overdue.count > 0 ? "text-red-700" : ""],
    ["Vence em 7 dias", showMoney(summary.nextDays.total), count(summary.nextDays.count), ""],
    ["Pago no mês", showMoney(summary.paidInMonth.total), count(summary.paidInMonth.count), ""],
  ] as const;

  return (
    <>
      <PageHeader title={menuItem("contas-pagar").label} hint="Organize vencimentos e pagamentos." />
      <MetricSummary items={cards.map(([label, value, note, color]) => ({ label, value, note, attention: Boolean(color) }))} />
      <details className={`${CARD} mt-3`}>
        <summary className="disclosure-heading">Lançar conta e ferramentas<span className="disclosure-marker" aria-hidden="true">+</span></summary>
        <div className="border-t border-slate-200 p-4">
        <div className="flex flex-wrap items-start gap-2">
          <ActionForm action={launchFixedExpensesAction}>
            <button type="submit" className={SECONDARY}>
              Lançar despesas fixas do mês
            </button>
          </ActionForm>
          <a href="/api/contas-pagar/exportar" className={SECONDARY}>
            Baixar planilha (CSV)
          </a>
        </div>
        </div>
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
            <button type="submit" className={PRIMARY}>
              Lançar conta
            </button>
          </div>
        </ActionForm>
      </details>

      <ViewTabs label="Situação" items={PAYABLE_TABS.map((item) => ({ href: `${HERE}?aba=${item.key}`, label: `${item.label} (${payables.filter((payable) => inPayableTab(payable, item.key)).length + (item.key === "pagas" ? 0 : commissions.filter((commission) => commission.amount > 0).length)})`, current: item.key === tab }))} />

      <section className={`${CARD} mt-4`} aria-label="Contas">
        {shown.length === 0 && owed.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nenhuma conta nesta aba.</p>
        ) : (
          <ul id="contas">
            {visibleCommissions.map((item) => (
              <li data-row key={`${item.sellerEmail}-${item.month}`} className="border-t border-slate-200 px-4 py-3 first:border-t-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">Comissão de {item.sellerName}</p>
                    <p className="text-xs text-slate-500">Comissões · {monthLabel(item.month)} · valor automático vinculado a recebimentos</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{showMoney(item.amount)}</p>
                    <p className={`text-sm ${item.dueDate < today ? "font-medium text-red-700" : "text-slate-600"}`}>
                      {item.dueDate < today ? "venceu em" : "vence em"} {showIsoDate(item.dueDate)}
                    </p>
                  </div>
                </div>
                {allows(session, "comissoes") && (
                  <p className="mt-2 text-sm">
                    <Link href={`${menuItem("comissoes").href}?mes=${item.month}`} className="font-medium text-brand underline">
                      Ver e corrigir em Comissões
                    </Link>
                  </p>
                )}
              </li>
            ))}
            {visiblePayables.map((payable) => {
              const late = payable.status === "aberta" && payable.dueDate < today;
              return (
                <li data-row key={payable.id} className="border-t border-slate-200 px-4 py-3 first:border-t-0">
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
                    <details className="mt-2">
                      <summary className="disclosure-heading !px-0 text-brand">Registrar pagamento<span className="disclosure-marker" aria-hidden="true">+</span></summary>
                    <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
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
                        <button type="submit" className={PRIMARY}>
                          Pagar
                        </button>
                      </ActionForm>
                      <ActionForm action={deletePayableAction}>
                        <input type="hidden" name="id" value={payable.id} />
                        <ConfirmButton label="Excluir" confirmLabel="Confirmar exclusão" className={DANGER} />
                      </ActionForm>
                    </div>
                    </details>
                  ) : null}
                  {payable.status === "aberta" ? (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-brand underline">Alterar esta conta</summary>
                      <ActionForm action={updatePayableAction} className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <input type="hidden" name="id" value={payable.id} />
                        <div className="sm:col-span-2 xl:col-span-3">
                          <label htmlFor={`description-${payable.id}`} className={LABEL}>
                            Descrição
                          </label>
                          <input id={`description-${payable.id}`} name="description" type="text" defaultValue={payable.description} className={INPUT} />
                        </div>
                        <div>
                          <label htmlFor={`category-${payable.id}`} className={LABEL}>
                            Categoria
                          </label>
                          <select id={`category-${payable.id}`} name="category" defaultValue={payable.category} className={INPUT}>
                            {(categories.includes(payable.category) ? categories : [...categories, payable.category]).map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`supplier-${payable.id}`} className={LABEL}>
                            Fornecedor
                          </label>
                          <select id={`supplier-${payable.id}`} name="supplierId" defaultValue={payable.supplierId ?? ""} className={INPUT}>
                            <option value="">—</option>
                            {payable.supplierId !== null && !suppliers.some((supplier) => supplier.id === payable.supplierId) && (
                              <option value={payable.supplierId}>{payable.supplierName}</option>
                            )}
                            {suppliers.map((supplier) => (
                              <option key={supplier.id} value={supplier.id}>
                                {supplier.tradeName ?? supplier.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`value-${payable.id}`} className={LABEL}>
                            Valor (R$)
                          </label>
                          <input id={`value-${payable.id}`} name="amount" type="text" inputMode="decimal" defaultValue={formatMoney(payable.amount)} className={`${INPUT} text-right`} />
                        </div>
                        <div>
                          <label htmlFor={`due-${payable.id}`} className={LABEL}>
                            Vencimento
                          </label>
                          <input id={`due-${payable.id}`} name="dueDate" type="date" defaultValue={payable.dueDate} className={INPUT} />
                        </div>
                        <div>
                          <label htmlFor={`form-${payable.id}`} className={LABEL}>
                            Forma
                          </label>
                          <select id={`form-${payable.id}`} name="method" defaultValue={payable.method && methods.includes(payable.method) ? payable.method : ""} className={INPUT}>
                            <option value="">—</option>
                            {methods.map((method) => (
                              <option key={method} value={method}>
                                {method}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2 xl:col-span-3">
                          <button type="submit" className={SECONDARY}>
                            Salvar alterações
                          </button>
                        </div>
                      </ActionForm>
                    </details>
                  ) : (
                    <ActionForm action={unpayPayableAction} className="mt-2">
                      <input type="hidden" name="id" value={payable.id} />
                      <ConfirmButton label="Desfazer pagamento" confirmLabel="Confirmar: voltar para a pagar" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-slate-700 underline hover:bg-slate-100" />
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Pager {...slice} noun={["conta", "contas"]} hrefFor={(page) => `${HERE}?${new URLSearchParams({ aba: tab, ...(page > 1 ? { p: String(page) } : {}) })}`} />
      <FitRows listId="contas" shown={size} minimum={1} cookieName="erp_linhas_pagar" />
    </>
  );
}

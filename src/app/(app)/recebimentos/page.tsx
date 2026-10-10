import { monthLabel } from "@/lib/commissions-view";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { confirmsRefunds, menuItem } from "@/lib/auth/permissions";
import { listPaymentMethods } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { listOpenReceivables, listPendingRefunds, listReceipts, receivedInMonth } from "@/lib/db/receivables";
import { formatMoney, isoDate, showDateTime, showIsoDate, showMoney } from "@/lib/format";
import { addDays } from "@/lib/pricing/payment";
import { isOverdue, receivablesSummary } from "@/lib/receivables-view";
import { ActionForm } from "../pedidos/ActionForm";
import { decideRefundAction, recordReceiptAction, requestRefundAction } from "./actions";

export const metadata = { title: `${menuItem("recebimentos").label} · ERP` };
export const dynamic = "force-dynamic";

const ORDERS = menuItem("pedidos").href;
const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand";
const count = (n: number) => `${n} ${n === 1 ? "valor" : "valores"}`;

const HERE = menuItem("recebimentos").href;

export default async function RecebimentosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("recebimentos");
  const conn = tenantDb(session.tenant.slug);

  const today = isoDate(new Date());
  const open = await listOpenReceivables(conn);
  const receipts = await listReceipts(20, conn);
  const methods = await listPaymentMethods(conn);
  const refunds = await listPendingRefunds(conn);
  const decides = confirmsRefunds(session);
  const summary = receivablesSummary(open, today, addDays(today, 30));
  const received = await receivedInMonth(today.slice(0, 7), conn);
  // One part at a time: what is still to come in, the refunds waiting for a decision, and what came in.
  const TABS = [["aberto", `Em aberto (${open.length})`], ...(refunds.length > 0 ? ([["estornos", `Estornos (${refunds.length})`]] as [string, string][]) : []), ["recebidos", "Recebidos"]] as [string, string][];
  const asked = (await searchParams).ver;
  const tab = TABS.find(([key]) => key === (Array.isArray(asked) ? asked[0] : asked))?.[0] ?? "aberto";

  const cards = [
    ["A receber", showMoney(summary.open.total), count(summary.open.count), ""],
    ["Vencido", showMoney(summary.overdue.total), count(summary.overdue.count), summary.overdue.count > 0 ? "text-red-700" : ""],
    ["Próximos 30 dias", showMoney(summary.nextDays.total), `${count(summary.nextDays.count)} a vencer`, ""],
    ["Recebido no mês", showMoney(received), monthLabel(today.slice(0, 7)), ""],
  ] as const;

  return (
    <>
      <h1 className="text-2xl font-semibold">{menuItem("recebimentos").label}</h1>
      <p className="mt-1 text-slate-600">Entradas e parcelas dos pedidos fechados. A baixa gera a comissão do vendedor.</p>

      <nav aria-label="Partes dos recebimentos" className="mt-3 flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={key === "aberto" ? HERE : `${HERE}?ver=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "aberto" && (
        <>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map(([label, value, note, color]) => (
          <div key={label} className={`${CARD} p-4`}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className={`mt-1 text-2xl font-bold ${color}`}>{value}</dd>
            <dd className="text-xs text-slate-600">{note}</dd>
          </div>
        ))}
      </dl>

      <section className={`${CARD} mt-6`} aria-labelledby="abertos">
        <h2 id="abertos" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Em aberto ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nada a receber. Os valores aparecem aqui quando um pedido é fechado.</p>
        ) : (
          <ul>
            {open.map((item) => {
              const late = isOverdue(item, today);
              return (
                <li key={item.id} className="border-t border-slate-200 px-5 py-4 first:border-t-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`${ORDERS}/${item.orderNumber}`} className="font-medium text-brand underline-offset-2 hover:underline">
                        {item.customerName ?? "sem cliente"}
                      </Link>
                      <p className="text-xs text-slate-500">
                        #{item.orderNumber} · {item.label} · vendedor: {item.sellerName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{showMoney(item.open)}</p>
                      {item.open !== item.amount && <p className="text-xs text-slate-500">falta receber, de {showMoney(item.amount)}</p>}
                      <p className={`text-sm ${late ? "font-medium text-red-700" : "text-slate-600"}`}>
                        {item.dueDate === null ? "sem data" : `${late ? "venceu em" : "vence em"} ${showIsoDate(item.dueDate)}`}
                      </p>
                    </div>
                  </div>
                  <ActionForm action={recordReceiptAction} className="mt-3 flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={item.id} />
                    <div>
                      <label htmlFor={`on-${item.id}`} className="block text-xs font-medium text-slate-600">
                        Recebido em
                      </label>
                      <input id={`on-${item.id}`} name="receivedOn" type="date" defaultValue={today} max={today} className={`${INPUT} mt-1`} />
                    </div>
                    <div>
                      <label htmlFor={`amount-${item.id}`} className="block text-xs font-medium text-slate-600">
                        Valor recebido
                      </label>
                      <input
                        key={item.open}
                        id={`amount-${item.id}`}
                        name="amount"
                        type="text"
                        inputMode="decimal"
                        defaultValue={formatMoney(item.open)}
                        className={`${INPUT} mt-1 w-32 text-right`}
                      />
                    </div>
                    <div>
                      <label htmlFor={`method-${item.id}`} className="block text-xs font-medium text-slate-600">
                        Forma
                      </label>
                      <select
                        id={`method-${item.id}`}
                        name="method"
                        defaultValue={item.method && methods.includes(item.method) ? item.method : ""}
                        className={`${INPUT} mt-1`}
                      >
                        <option value="">—</option>
                        {methods.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-40 flex-1">
                      <label htmlFor={`note-${item.id}`} className="block text-xs font-medium text-slate-600">
                        Observação
                      </label>
                      <input id={`note-${item.id}`} name="note" type="text" className={`${INPUT} mt-1 w-full`} />
                    </div>
                    <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                      Dar baixa
                    </button>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </section>
        </>
      )}
      {tab === "estornos" && (
        <>
      {refunds.length > 0 && (
        <section className={`${CARD} mt-8 border-amber-300`} aria-labelledby="estornos">
          <h2 id="estornos" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
            Estornos aguardando a diretoria ({refunds.length})
          </h2>
          <ul>
            {refunds.map((refund) => (
              <li key={refund.id} className="border-t border-slate-200 px-5 py-4 first:border-t-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`${ORDERS}/${refund.orderNumber}`} className="font-medium text-brand underline-offset-2 hover:underline">
                      {refund.customerName ?? "sem cliente"}
                    </Link>
                    <p className="text-xs text-slate-500">
                      #{refund.orderNumber} · {refund.label} · recebido em {showIsoDate(refund.receivedOn)} · vendedor: {refund.sellerName}
                    </p>
                    <p className="mt-1 text-sm">
                      <strong>Motivo:</strong> {refund.reason}
                    </p>
                    <p className="text-xs text-slate-500">
                      Pedido por {refund.requestedBy === session.email ? "você" : refund.requestedBy} em {showDateTime(refund.requestedAt)}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-red-700">– {showMoney(refund.amount)}</p>
                </div>
                {decides ? (
                  <ActionForm action={decideRefundAction} className="mt-3 flex flex-wrap gap-3">
                    <input type="hidden" name="id" value={refund.id} />
                    <button type="submit" name="decision" value="confirmar" className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                      Confirmar estorno
                    </button>
                    <button type="submit" name="decision" value="recusar" className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
                      Recusar
                    </button>
                  </ActionForm>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">A diretoria confirma ou recusa. Até lá o recebimento continua valendo.</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
        </>
      )}
      {tab === "recebidos" && (
        <>
      {receipts.length === 0 && <p className={`${CARD} mt-4 p-4 text-sm text-slate-700`}>Nenhum recebimento registrado ainda.</p>}
      {receipts.length > 0 && (
        <section className={`${CARD} mt-8`} aria-labelledby="recebidos">
          <h2 id="recebidos" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
            Últimos recebimentos
          </h2>
          <div className="relative overflow-x-auto">
            <table className="stack-sm w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {["Pedido", "Recebido em", "Forma", "Vendedor"].map((column) => (
                    <th key={column} scope="col" className="px-4 py-2 text-left font-semibold">
                      {column}
                    </th>
                  ))}
                  {["Valor", "Comissão"].map((column) => (
                    <th key={column} scope="col" className="px-4 py-2 text-right font-semibold">
                      {column}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2 text-left font-semibold">
                    Estorno
                  </th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.id} className="border-t border-slate-200 align-top">
                    <td className="px-4 py-3">
                      <Link href={`${ORDERS}/${receipt.orderNumber}`} className="font-medium text-brand underline-offset-2 hover:underline">
                        {receipt.customerName ?? "sem cliente"}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        #{receipt.orderNumber} · {receipt.label}
                      </span>
                    </td>
                    <td data-label="Recebido em" className="whitespace-nowrap px-4 py-3">{showIsoDate(receipt.receivedOn)}</td>
                    <td data-label="Forma" className="px-4 py-3">{receipt.method ?? "—"}</td>
                    <td data-label="Vendedor" className="px-4 py-3">{receipt.sellerName}</td>
                    <td data-label="Valor" className="whitespace-nowrap px-4 py-3 text-right font-semibold">{showMoney(receipt.amount)}</td>
                    <td data-label="Comissão" className="whitespace-nowrap px-4 py-3 text-right">{showMoney(receipt.commission)}</td>
                    <td className="px-4 py-3">
                      {receipt.state === "estornado" ? (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-900">Estornado</span>
                      ) : receipt.state === "estorno-pedido" ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">Aguardando a diretoria</span>
                      ) : (
                        <ActionForm action={requestRefundAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="id" value={receipt.id} />
                          <input
                            name="reason"
                            type="text"
                            placeholder="Motivo"
                            aria-label={`Motivo do estorno do pedido ${receipt.orderNumber}`}
                            className={`${INPUT} w-40`}
                          />
                          <button type="submit" className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
                            Pedir estorno
                          </button>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
        </>
      )}
    </>
  );
}

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listPaymentMethods } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { listOpenReceivables, listReceipts } from "@/lib/db/receivables";
import { isoDate, showIsoDate, showMoney } from "@/lib/format";
import { addDays } from "@/lib/pricing/payment";
import { isOverdue, receivablesSummary } from "@/lib/receivables-view";
import { ActionForm } from "../pedidos/ActionForm";
import { recordReceiptAction } from "./actions";

export const metadata = { title: `${menuItem("recebimentos").label} · ERP` };
export const dynamic = "force-dynamic";

const ORDERS = menuItem("pedidos").href;
const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand";
const count = (n: number) => `${n} ${n === 1 ? "valor" : "valores"}`;

export default async function RecebimentosPage() {
  const session = await requirePermission("recebimentos");
  const conn = tenantDb(session.tenant.slug);

  const today = isoDate(new Date());
  const open = await listOpenReceivables(conn);
  const receipts = await listReceipts(20, conn);
  const methods = await listPaymentMethods(conn);
  const summary = receivablesSummary(open, today, addDays(today, 7));

  const cards = [
    ["A receber", showMoney(summary.open.total), count(summary.open.count), ""],
    ["Atrasado", showMoney(summary.overdue.total), count(summary.overdue.count), summary.overdue.count > 0 ? "text-red-700" : ""],
    ["Vence em 7 dias", showMoney(summary.nextDays.total), count(summary.nextDays.count), ""],
  ] as const;

  return (
    <>
      <h1 className="text-2xl font-semibold">{menuItem("recebimentos").label}</h1>
      <p className="mt-1 text-slate-600">Entradas e parcelas dos pedidos fechados. A baixa gera a comissão do vendedor.</p>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
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
                      <p className="text-lg font-bold">{showMoney(item.amount)}</p>
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
                    <div className="min-w-0 flex-1">
                      <label htmlFor={`note-${item.id}`} className="block text-xs font-medium text-slate-600">
                        Observação
                      </label>
                      <input id={`note-${item.id}`} name="note" type="text" className={`${INPUT} mt-1 w-full`} />
                    </div>
                    <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                      Dar baixa de {showMoney(item.amount)}
                    </button>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {receipts.length > 0 && (
        <section className={`${CARD} mt-8`} aria-labelledby="recebidos">
          <h2 id="recebidos" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
            Últimos recebimentos
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt, index) => (
                  <tr key={`${receipt.orderNumber}-${index}`} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <Link href={`${ORDERS}/${receipt.orderNumber}`} className="font-medium text-brand underline-offset-2 hover:underline">
                        {receipt.customerName ?? "sem cliente"}
                      </Link>
                      <span className="block text-xs text-slate-500">#{receipt.orderNumber}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{showIsoDate(receipt.receivedOn)}</td>
                    <td className="px-4 py-3">{receipt.method ?? "—"}</td>
                    <td className="px-4 py-3">{receipt.sellerName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{showMoney(receipt.amount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(receipt.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

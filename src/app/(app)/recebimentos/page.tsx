import { monthLabel } from "@/lib/commissions-view";
import { cookies } from "next/headers";
import Link from "next/link";
import { FitRows } from "@/components/FitRows";
import { CARD, DANGER_OUTLINE, pageOf, Pager, PRIMARY, SECONDARY, PageHeader, MetricSummary, ViewTabs } from "@/components/ui";
import { rowsPerPage } from "@/lib/rows";
import { OrderReference } from "@/components/OrderReference";
import { requirePermission } from "@/lib/auth";
import { confirmsRefunds, menuItem } from "@/lib/auth/permissions";
import { listPaymentMethods } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { listOpenReceivables, listPendingRefunds, listReceipts, receivedInMonth } from "@/lib/db/receivables";
import { isoDate, showDateTime, showIsoDate, showMoney } from "@/lib/format";
import { addDays } from "@/lib/pricing/payment";
import { isOverdue, receivablesSummary } from "@/lib/receivables-view";
import { ActionForm } from "../pedidos/ActionForm";
import { decideRefundAction, requestRefundAction } from "./actions";
import { ReceiptForm } from "./ReceiptForm";

export const metadata = { title: `${menuItem("recebimentos").label} · ERP` };
export const dynamic = "force-dynamic";

const INPUT = "min-h-[var(--control)] rounded border border-slate-300 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-brand";
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
  // Each open amount is a form of its own: a few at a time, the ones due first.
  const askedPage = (await searchParams).pagina;
  const pageNumber = Array.isArray(askedPage) ? askedPage[0] : askedPage;
  const size = rowsPerPage((await cookies()).get("erp_linhas_receber")?.value, 1);
  const slice = pageOf(open, pageNumber, size);
  const receiptSlice = pageOf(receipts, pageNumber, size);
  const refundSlice = pageOf(refunds, pageNumber, size);
  const activeSlice = tab === "recebidos" ? receiptSlice : tab === "estornos" ? refundSlice : slice;

  const cards = [
    ["A receber", showMoney(summary.open.total), count(summary.open.count), ""],
    ["Vencido", showMoney(summary.overdue.total), count(summary.overdue.count), summary.overdue.count > 0 ? "text-red-700" : ""],
    ["Próximos 30 dias", showMoney(summary.nextDays.total), `${count(summary.nextDays.count)} a vencer`, ""],
    ["Recebido no mês", showMoney(received), monthLabel(today.slice(0, 7)), ""],
  ] as const;

  return (
    <>
      <PageHeader title={menuItem("recebimentos").label} hint="Entradas e parcelas dos pedidos fechados." />

      <ViewTabs label="Partes dos recebimentos" items={TABS.map(([key, label]) => ({ href: `${HERE}?ver=${key}`, label, current: key === tab }))} />
      {tab === "aberto" && (
        <>
      <MetricSummary items={cards.map(([label, value, note, color]) => ({ label, value, note, attention: Boolean(color) }))} />

      <section className={`${CARD} mt-6`} aria-labelledby="abertos">
        <h2 id="abertos" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Em aberto ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nada a receber. Os valores aparecem aqui quando um pedido é fechado.</p>
        ) : (
          <>
          <ul id="parcelas">
            {slice.rows.map((item) => {
              const late = isOverdue(item, today);
              return (
                <li data-row key={item.id} className="border-t border-slate-200 px-4 py-3 first:border-t-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <OrderReference access={session} number={item.orderNumber} customer={item.customerName} />
                      <p className="text-xs text-slate-500">
                        #{item.orderNumber} · {item.label} · vendedor: {item.sellerName}
                      </p>
                      <Link href={`${menuItem("recebimentos").href}/${item.id}/pix`} className="text-sm font-medium text-brand underline">
                        Cobrar por PIX
                      </Link>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold">{showMoney(item.open)}</p>
                      {item.open !== item.amount && <p className="text-xs text-slate-500">falta receber, de {showMoney(item.amount)}</p>}
                      <p className={`text-sm ${late ? "font-medium text-red-700" : "text-slate-600"}`}>
                        {item.dueDate === null ? "sem data" : `${late ? "venceu em" : "vence em"} ${showIsoDate(item.dueDate)}`}
                      </p>
                    </div>
                  </div>
                  <ReceiptForm key={`${item.id}:${item.open}`} id={item.id} openAmount={item.open} today={today} initialMethod={item.method} methods={methods} initiallyOpen={false} />
                </li>
              );
            })}
          </ul>
          <div className="border-t border-slate-200 px-4 pb-3">
            <Pager {...slice} noun={["valor", "valores"]} hrefFor={(page) => `${HERE}${page > 1 ? `?pagina=${page}` : ""}`} />
          </div>
          </>
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
            {refundSlice.rows.map((refund) => (
              <li data-row key={refund.id} className="border-t border-slate-200 px-4 py-3 first:border-t-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <OrderReference access={session} number={refund.orderNumber} customer={refund.customerName} />
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
                    <button type="submit" name="decision" value="confirmar" className={PRIMARY}>
                      Confirmar estorno
                    </button>
                    <button type="submit" name="decision" value="recusar" className={SECONDARY}>
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
                {receiptSlice.rows.map((receipt) => (
                  <tr data-row key={receipt.id} className="border-t border-slate-200 align-top">
                    <td className="px-4 py-3">
                      <OrderReference access={session} number={receipt.orderNumber} customer={receipt.customerName} />
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
                        <details><summary className="disclosure-heading !px-0 text-red-700">Pedir estorno<span className="disclosure-marker" aria-hidden="true">+</span></summary>
                        <ActionForm action={requestRefundAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="id" value={receipt.id} />
                          <input
                            name="reason"
                            type="text"
                            placeholder="Motivo"
                            aria-label={`Motivo do estorno do pedido ${receipt.orderNumber}`}
                            className={`${INPUT} w-40`}
                          />
                          <button type="submit" className={DANGER_OUTLINE}>
                            Pedir estorno
                          </button>
                        </ActionForm>
                        </details>
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
      {tab !== "aberto" && <Pager {...activeSlice} noun={tab === "estornos" ? ["estorno", "estornos"] : ["recebimento", "recebimentos"]} hrefFor={(page) => `${HERE}?ver=${tab}&pagina=${page}`} />}
      {tab === "aberto" && <FitRows listId="parcelas" shown={size} minimum={1} cookieName="erp_linhas_receber" />}
    </>
  );
}

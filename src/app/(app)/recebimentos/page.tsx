import { monthLabel } from "@/lib/commissions-view";
import { cookies } from "next/headers";
import Link from "next/link";
import { FitRows } from "@/components/FitRows";
import { CARD, INPUT, DANGER_OUTLINE, pageOf, Pager, PRIMARY, SECONDARY, PageHeader, MetricSummary, ViewTabs } from "@/components/ui";
import { rowsPerPage } from "@/lib/rows";
import { OrderReference } from "@/components/OrderReference";
import { requirePermission } from "@/lib/auth";
import { allows, confirmsRefunds, menuItem, seesCosts } from "@/lib/auth/permissions";
import { listPaymentMethods } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { listOpenReceivables, listPendingRefunds, listReceipts, receivedInMonth } from "@/lib/db/receivables";
import { isoDate, showDateTime, showIsoDate, showMoney } from "@/lib/format";
import { addDays } from "@/lib/pricing/payment";
import { isOverdue, receivablesSummary } from "@/lib/receivables-view";
import { ActionForm } from "../pedidos/ActionForm";
import { adjustReceivableAction, createManualReceivableAction, decideRefundAction, requestRefundAction } from "./actions";
import { ReceiptForm } from "./ReceiptForm";

export const metadata = { title: `${menuItem("recebimentos").label} · ERP` };
export const dynamic = "force-dynamic";

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

      {seesCosts(session) && (
        <details className={`${CARD} mt-3`}>
          <summary className="disclosure-heading">Incluir cobrança manual<span className="disclosure-marker" aria-hidden="true">+</span></summary>
          <ActionForm action={createManualReceivableAction} className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2">
            <label className="text-sm">Número do pedido
              <input name="orderNumber" className={INPUT} required placeholder="261008-RUZL" />
            </label>
            <label className="text-sm">Valor
              <input name="amount" className={INPUT} required inputMode="decimal" placeholder="0,00" />
            </label>
            <label className="text-sm">Vencimento
              <input name="dueDate" className={INPUT} type="date" required />
            </label>
            <label className="text-sm">Forma
              <select name="method" className={INPUT}><option value="">Não definida</option>{methods.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            </label>
            <label className="text-sm sm:col-span-2">Motivo
              <textarea name="reason" className={INPUT} rows={2} minLength={10} required placeholder="Justifique a cobrança adicional" />
            </label>
            <p className="text-xs text-slate-600 sm:col-span-2">Cria uma provisão sem registrar dinheiro recebido. Pedidos com vínculos fiscais, contratos assinados, produção ou movimentação financeira ficam bloqueados.</p>
            <button className={PRIMARY} type="submit">Incluir cobrança</button>
          </ActionForm>
        </details>
      )}
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
                        {allows(session, "pedidos") ? <Link href={`${menuItem("pedidos").href}/${item.orderNumber}`} className="font-medium text-brand underline">Abrir pedido #{item.orderNumber}</Link> : <span>Pedido #{item.orderNumber}</span>} · {item.label} · vendedor: {item.sellerName}
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
                  <p className="mt-2 text-xs text-slate-600">Para corrigir uma cobrança incorreta, não use Dar baixa. Consulte o pedido e seus vínculos financeiros; a edição administrativa depende de validação.</p>
                  {seesCosts(session) && (
                    <details className="mt-3 rounded-lg border border-slate-200 p-3">
                      <summary className="cursor-pointer font-medium text-brand">Editar ou cancelar cobrança</summary>
                      <p className="mt-2 text-xs text-slate-600">Somente sem baixas ou vínculos fiscais, contratuais e de produção. Toda alteração exige justificativa e fica registrada.</p>
                      <ActionForm action={adjustReceivableAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="id" value={item.id} />
                        <label className="text-sm">Vencimento
                          <input className={INPUT} name="dueDate" type="date" defaultValue={item.dueDate ?? ""} />
                        </label>
                        <label className="text-sm">Forma de cobrança
                          <select className={INPUT} name="method" defaultValue={item.method ?? ""}>
                            <option value="">Não definida</option>
                            {[...new Set([...methods, ...(item.method ? [item.method] : [])])].map((method) => <option key={method} value={method}>{method}</option>)}
                          </select>
                        </label>
                        <label className="text-sm sm:col-span-2">Justificativa obrigatória
                          <textarea className={INPUT} name="reason" required minLength={10} rows={2} placeholder="Descreva o motivo da alteração" />
                        </label>
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                          <button className={SECONDARY} name="action" value="editar" type="submit">Salvar alteração</button>
                          <button className={DANGER_OUTLINE} name="action" value="cancelar" type="submit">Cancelar cobrança</button>
                        </div>
                      </ActionForm>
                    </details>
                  )}
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

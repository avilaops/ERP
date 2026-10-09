import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { listOnDeliveryMethods } from "@/lib/db/payment-methods";
import { tenantDb } from "@/lib/db/pool";
import { allows, menuItem, seesAllOrders, seesCosts } from "@/lib/auth/permissions";
import { ufFromCep } from "@/lib/cep";
import { completenessText, isComplete, isRequired, normalizeDocument, taxpayerFromRegistration } from "@/lib/customer";
import type { CustomerKind } from "@/lib/customer";
import { CUSTOMER_FIELDS, customerToForm } from "@/lib/customer-form";
import { lastDecision } from "@/lib/db/approvals";
import { listCarriers, loadOrderTransport } from "@/lib/db/carriers";
import { loadOrderDelivery } from "@/lib/db/order-delivery";
import { listLines } from "@/lib/db/product-lines";
import { lineWords } from "@/lib/line-words";
import { listOrderInvoiceMails } from "@/lib/db/send-nfe-mail";
import { listOrderInvoiceEvents, listOrderInvoices } from "@/lib/db/invoices";
import { previewOrderNfe } from "@/lib/db/order-nfe";
import { findCustomerByDocument } from "@/lib/db/customers";
import { getOrder, listPaymentMethods, loadOrderStanding } from "@/lib/db/orders";
import { ContractError, isOpen, listOrderContracts, loadContractSettings, standingText } from "@/lib/db/contracts";
import { draftOrderContract } from "@/lib/db/send-contract";
import { contractNumber } from "@/lib/contract/text";
import { formatDocument } from "@/lib/customer";
import { loadProposalSettings, loadApprovalPolicy } from "@/lib/db/company";
import { latestVersion, loadDiscountLimits, loadPublishedSnapshot, loadPublishedTable } from "@/lib/db/price-table";
import { formatMoney, formatPercent, isoDate, showDateTime, showIsoDate, showMoney, showPercent } from "@/lib/format";
import { BAND_TEXT, REASON_TEXT, STATUS_LABELS, UF_NAMES } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";
import { closingProblems, directorOf, dueDates, paymentOf, productionText, saleOf } from "@/lib/order-quote";
import { ORIGIN_UF, UFS } from "@/lib/pricing/states";
import { compareByCode } from "@/lib/products-view";
import { CopyButton } from "@/components/CopyButton";
import { DiscountFields } from "@/components/DiscountFields";
import { DownPaymentFields } from "@/components/DownPaymentFields";
import { proposalText } from "@/lib/quote/text";
import { decideApprovalAction } from "../../aprovacoes/actions";
import { FREIGHT_MODES } from "@/lib/fiscal/nfe";
import { cancelContractAction, resendContractAction, sendContractAction, sendUploadedContractAction, signContractAction } from "../contract-actions";
import { issueNfeAction, registerNfeEventAction, saveDeliveryAction, saveTransportAction, sendNfeMailAction } from "../nfe-actions";
import { CustomerForm } from "../../clientes/CustomerForm";
import { ActionForm } from "../ActionForm";
import {
  addItemAction,
  closeOrderAction,
  deleteOrderAction,
  removeItemAction,
  reopenOrderAction,
  saveOrderCustomerAction,
  saveInstallmentsAction,
  savePaymentAction,
  saveTermsAction,
  setItemQuantityAction,
} from "../actions";
import { ConfirmButton } from "../ConfirmButton";
import { DirectorBoard } from "../DirectorBoard";

export const metadata = { title: "Pedido · ERP" };
// Never reused between profiles: what is assembled for the directors has costs.
export const dynamic = "force-dynamic";

const NONE = "—";
const TERMS = "condicoes";
const CARD = "rounded-lg border border-slate-200 bg-white";
const TITLE = "text-sm font-semibold uppercase tracking-wide";
const INPUT = "rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const BUTTON = "rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50";
const PRIMARY = "rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark";
const HELP = "mt-1 text-xs text-slate-500";

const BAND_COLORS = {
  "na-meta": "border-emerald-300 bg-emerald-50 text-emerald-900",
  "abaixo-da-meta": "border-amber-300 bg-amber-50 text-amber-900",
  prejuizo: "border-red-300 bg-red-50 text-red-900",
} as const;

const PROFIT_TITLES = { "na-meta": "Lucro na meta", "abaixo-da-meta": "Lucro abaixo da meta", prejuizo: "Prejuízo" } as const;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
/** "—" where there is nothing to show, as the prototype does for a discount of zero. */
const moneyOrNone = (value: number) => (value === 0 ? NONE : showMoney(value));

const requiredOf = (kind: CustomerKind) =>
  [...CUSTOMER_FIELDS[kind].main, ...CUSTOMER_FIELDS[kind].address].map(({ key }) => key).filter((key) => isRequired(kind, key));

const INVOICE_LABELS = { assinada: "aguardando resposta da SEFAZ", autorizada: "autorizada", rejeitada: "rejeitada", denegada: "denegada", cancelada: "cancelada" } as const;
/** The colours of a contract by how it stands; `vencido` is one sent whose link ran out. */
const CONTRACT_COLORS: Record<"enviado" | "assinado" | "recusado" | "cancelado" | "vencido", string> = {
  enviado: "border-sky-300 bg-sky-50 text-sky-900",
  assinado: "border-emerald-300 bg-emerald-50 text-emerald-900",
  recusado: "border-red-300 bg-red-50 text-red-900",
  cancelado: "border-slate-300 bg-slate-50 text-slate-700",
  vencido: "border-amber-300 bg-amber-50 text-amber-900",
};

const INVOICE_COLORS = {
  assinada: "border-amber-300 bg-amber-50 text-amber-900",
  autorizada: "border-emerald-300 bg-emerald-50 text-emerald-900",
  rejeitada: "border-red-300 bg-red-50 text-red-900",
  denegada: "border-red-300 bg-red-50 text-red-900",
  cancelada: "border-slate-300 bg-slate-100 text-slate-700",
} as const;

export default async function PedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ numero: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ numero }, query] = await Promise.all([params, searchParams]);
  // Only a well-formed number goes into the address the login returns to.
  const wellFormed = ORDER_NUMBER.test(numero);
  const session = await requirePermission("pedidos", wellFormed ? `/pedidos/${numero}` : undefined);
  const conn = tenantDb(session.tenant.slug);
  if (!wellFormed) notFound();

  const scope = { sellerEmail: seesAllOrders(session) ? null : session.email };
  const order = await getOrder(numero, scope, conn);
  if (!order) notFound();
  const decision = await lastDecision(order.number, scope, conn);

  // The team's account: prices of the version of the order, no cost.
  const table = await loadPublishedTable(order.priceTableVersion, conn);
  if (!table) notFound();
  const standing = await loadOrderStanding(order, conn);
  // The profile comes from the session. Costs are read only for who may see them.
  const costs = seesCosts(session);
  const snapshot = costs ? await loadPublishedSnapshot(order.priceTableVersion, conn) : null;
  // The board is there from the first item: while the order has no state of delivery saved, it is
  // calculated for the customer's state or, without one, for the state the goods leave from, and says so.
  const assumedUf = order.deliveryUf === null ? (order.customer?.uf ?? ORIGIN_UF) : null;
  const board = snapshot ? directorOf(assumedUf ? { ...order, deliveryUf: assumedUf } : order, snapshot) : null;

  // The newest table of the line of this order: another line publishing does not make this one old.
  const latest = await latestVersion(conn, table.lineId);
  // How the cost of this line is called: bought abroad or in the country.
  const lineImported = (await listLines(conn)).find((line) => line.id === table.lineId)?.imported ?? true;
  const sale = saleOf(order, table);
  const today = isoDate(new Date());
  const dates = dueDates(order, table, today);
  const editable = order.status === "em_negociacao";
  const plan = paymentOf(order, sale, table, today);
  // The installments of the balance, as they stand: the rows the seller may change one by one.
  const installmentRows = plan.receipts.filter((receipt) => receipt.label !== "Entrada");
  const agreedInstallments = order.customInstallments.length > 0 && installmentRows.length === order.customInstallments.length;
  const missing = editable ? closingProblems(order, sale) : [];
  // The forms of payment are the company's own list; one already used and since turned off still shows.
  const methods = await listPaymentMethods(conn);
  // The forms that mean "the balance is paid at delivery".
  const onDelivery = await listOnDeliveryMethods(conn);
  const methodsWith = (used: string | null) => (used && !methods.includes(used) ? [...methods, used] : methods);
  const reasons = standing.policy?.reasons ?? [];
  const shortOfRequired = board ? Math.max(0, board.quote.requiredDownPayment - plan.downPayment) : 0;
  const ipi = `${formatPercent(table.ipi)}%`;
  // A company without IPI (national line) shows no column nor line of it.
  const hasIpi = table.ipi > 0;

  const products = new Map(table.items.map((item) => [item.productId, item]));
  const catalog = [...table.items].sort((a, b) => compareByCode(a, b) || a.productId - b.productId);
  const units = order.items.reduce((total, item) => total + item.quantity, 0);
  const discountValue = sale.tableTotal - sale.netSale;
  // The bar of the discount: for who approves, how far their own decision goes in this destination.
  // Only the percentage leaves the server, as in Tabela de preços; a seller gets none.
  let authority: number | null = null;
  if (allows(session, "aprovacoes") && order.deliveryUf) {
    const limits = await loadDiscountLimits(table.version, conn);
    const upTo = costs || (await loadApprovalPolicy(conn)).managerLimit === "meta" ? "atTarget" : "noLoss";
    const key = limits?.keyOf({ uf: order.deliveryUf, taxpayer: order.taxpayer });
    authority = limits?.limits.find((limit) => limit.label === key)?.[upTo] ?? null;
  }
  // The contracts of the order, and, while it is closed, the one that would leave now (or why none can).
  const now = new Date();
  const contracts = await listOrderContracts(order.id, conn);
  const waiting = contracts.find((contract) => contract.status === "enviado") ?? null;
  // When the company asks for the second code, sending a contract also asks for the mobile phone of who signs.
  const asksPhone = order.status === "fechado" ? (await loadContractSettings(conn)).secondFactor : false;
  const contractDraft =
    order.status === "fechado" && !waiting
      ? await draftOrderContract(order, session.tenant.name, now, conn).catch((error: unknown) => {
          if (error instanceof ContractError) return error.message;
          throw error;
        })
      : null;
  // The conference of the invoice: only for a closed order and for who edits the fiscal parameters.
  const invoice = order.status === "fechado" && allows(session, "parametros") ? await previewOrderNfe(order.number, new Date(), conn) : null;
  const invoices = invoice ? await listOrderInvoices(order.id, conn) : [];
  const events = invoice ? await listOrderInvoiceEvents(order.id, conn) : [];
  const mails = invoice ? await listOrderInvoiceMails(order.id, conn) : [];
  const carriers = invoice ? await listCarriers(conn) : [];
  const transport = await loadOrderTransport(order.id, conn);
  const delivery = invoice ? await loadOrderDelivery(order.id, conn) : null;
  // What "Copiar proposta" puts in the clipboard: only what the customer reads in the PDF.
  const proposalSettings = await loadProposalSettings(conn);
  const proposal = proposalText({
    manager: proposalSettings.managerName,
    place: proposalSettings.place,
    company: session.tenant.name,
    number: order.number,
    customer: order.customer ? { name: order.customer.name, document: order.customer.document } : null,
    delivery: order.deliveryUf ? UF_NAMES[order.deliveryUf] : null,
    items: sale.lines.map((line, index) => {
      const product = products.get(order.items[index].productId);
      return { quantity: order.items[index].quantity, name: product?.name ?? "", code: product?.code ?? null, unit: line.unitWithIpi };
    }),
    tableTotal: sale.tableTotal,
    discount: sale.discount,
    total: sale.invoiceTotal,
    receipts: plan.receipts,
    validUntil: dates.proposalValidUntil,
    production: order.productionDays === null ? null : productionText(order.productionDays, order.productionUnit),
    notes: order.notes,
  });

  // The block Cliente: the linked customer, or the one searched for by document.
  const linked = order.customer;
  const asked = first(query.cliente);
  const tab: CustomerKind = asked === "pf" ? "PF" : asked === "pj" ? "PJ" : (linked?.kind ?? "PJ");
  const typedDocument = (first(query.doc) ?? "").trim();
  const searched = normalizeDocument(typedDocument);
  const found = searched === "" ? null : await findCustomerByDocument(searched, conn);
  const shown = found ?? (searched === "" && linked?.kind === tab ? linked : null);
  const kind = shown?.kind ?? tab;
  const cepUf = shown?.cep ? ufFromCep(shown.cep) : null;
  const here = `/pedidos/${order.number}`;
  const canBeTaxpayer = linked !== null && taxpayerFromRegistration(linked.kind, linked.stateRegistration);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pedido #{order.number}</h1>
          <p className="mt-1 text-sm text-slate-600">
            De {order.sellerEmail === session.email ? "Você" : order.sellerName} · atualizado {showDateTime(order.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-slate-200 px-3 py-1 font-medium">{STATUS_LABELS[order.status]}</span>
          <span className="rounded-full border border-slate-300 px-3 py-1">Tabela v{table.version}</span>
          {order.items.length > 0 && (
            <a href={`/api/pedidos/${order.number}/orcamento`} target="_blank" rel="noopener" className={BUTTON}>
              Salvar PDF
            </a>
          )}
          {order.items.length > 0 && <CopyButton text={proposal} label="Copiar proposta" className={BUTTON} />}
        </div>
      </div>
      {latest && latest.version !== table.version && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Este pedido usa a tabela v{table.version}; a tabela atual é a v{latest.version}. Os preços dele não mudam.
        </p>
      )}
      {editable && decision && !decision.approved && (
        <p role="status" className="mt-3 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900">
          <strong>Aprovação recusada</strong> por {decision.decidedBy} em {showDateTime(decision.decidedAt)}: {decision.comment}
        </p>
      )}
      {order.status === "aguardando_aprovacao" && allows(session, "aprovacoes") && (
        <section className="mt-3 rounded-lg border border-brand bg-white p-4" aria-labelledby="sua-decisao">
          <h2 id="sua-decisao" className="text-sm font-semibold uppercase tracking-wide">
            Sua decisão
          </h2>
          {reasons.length > 0 && (
            <p className="mt-1 text-sm text-slate-600">
              <strong>Pede aprovação por:</strong> {reasons.map((reason) => REASON_TEXT[reason]).join("; ")}.
            </p>
          )}
          {authority !== null && (
            <p className="mt-1 text-sm text-slate-600">
              Desconto do pedido: {showPercent(order.discount)}. Você pode aprovar até {showPercent(authority)} neste destino.
            </p>
          )}
          {/* The same action of Aprovações: the server checks again who may approve what. */}
          <ActionForm action={decideApprovalAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="number" value={order.number} />
            <div className="min-w-0 flex-1">
              <label htmlFor="decision-comment" className="block text-sm font-medium">
                Nota para o vendedor <span className="font-normal text-slate-500">(obrigatória para recusar)</span>
              </label>
              <input id="decision-comment" name="comment" type="text" placeholder="Ex.: fechar com entrada de 50%" className={`${INPUT} mt-1 w-full`} />
            </div>
            <button type="submit" name="decision" value="aprovar" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
              Aprovar {showPercent(order.discount)}
            </button>
            <button type="submit" name="decision" value="recusar" className="rounded border border-red-300 bg-white px-4 py-2 font-medium text-red-700 hover:bg-red-50">
              Recusar
            </button>
          </ActionForm>
        </section>
      )}
      {(contracts.length > 0 || contractDraft !== null) && (
        <section className="mt-3 rounded-lg border border-slate-200 bg-white p-4 text-sm" aria-labelledby="contrato">
          <h2 id="contrato" className="text-sm font-semibold uppercase tracking-wide">
            Contrato
          </h2>
          <p className="mt-1 text-slate-600">
            O cliente recebe um link por e-mail, lê o contrato e assina com nome, CPF e um código enviado ao e-mail dele. O PDF assinado sai com o registro das
            assinaturas na última folha.
          </p>
          {contracts.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {contracts.map((contract) => {
                const open = isOpen(contract, now);
                const live = contract.status === "enviado" || contract.status === "assinado";
                const mine = contract.companySignatures.some((signature) => signature.email === session.email);
                return (
                  <li key={contract.id} className={`rounded border px-3 py-2 ${CONTRACT_COLORS[contract.status === "enviado" && !open ? "vencido" : contract.status]}`}>
                    <strong>
                      Contrato nº {contractNumber(order.number, contract.sequence)} · {standingText(contract, now)}
                    </strong>
                    <span className="block">
                      {contract.fileName ? `Arquivo próprio (${contract.fileName}) enviado` : "Enviado"} para {contract.recipientName} ({contract.recipientEmail}) em {showDateTime(contract.createdAt)}
                      {contract.status === "enviado" && ` · link válido até ${showDateTime(contract.expiresAt)}`}
                    </span>
                    {contract.status === "assinado" && (
                      <span className="block">
                        Assinou: {contract.signerName}, CPF {formatDocument(contract.signerDocument ?? "")}
                      </span>
                    )}
                    {contract.status === "recusado" && contract.refusalReason && <span className="block">Motivo informado: {contract.refusalReason}</span>}
                    {contract.companySignatures.map((signature) => (
                      <span key={signature.email} className="block">
                        Pela empresa: {signature.name} ({signature.role}) em {showDateTime(signature.signedAt)}
                      </span>
                    ))}
                    <span className="mt-1 flex flex-wrap items-start gap-x-4 gap-y-2 text-slate-900">
                      <a href={`/api/pedidos/${order.number}/contrato/${contract.id}`} target="_blank" rel="noopener" className="font-medium underline">
                        {contract.status === "assinado" ? "Contrato assinado (PDF)" : "Abrir o contrato (PDF)"}
                      </a>
                      {live && !mine && (
                        <ActionForm action={signContractAction}>
                          <input type="hidden" name="number" value={order.number} />
                          <input type="hidden" name="contractId" value={contract.id} />
                          <ConfirmButton label="Assinar pela empresa" confirmLabel={`Confirmar: assinar como ${session.name}`} className="rounded border border-slate-300 bg-white px-3 py-1 font-medium hover:bg-slate-50" />
                        </ActionForm>
                      )}
                      {contract.status === "enviado" && (
                        <>
                          <ActionForm action={resendContractAction}>
                            <input type="hidden" name="number" value={order.number} />
                            <input type="hidden" name="contractId" value={contract.id} />
                            <ConfirmButton label="Enviar o link de novo" confirmLabel="Confirmar: o link anterior deixa de valer" className="rounded border border-slate-300 bg-white px-3 py-1 font-medium hover:bg-slate-50" />
                          </ActionForm>
                          <ActionForm action={cancelContractAction}>
                            <input type="hidden" name="number" value={order.number} />
                            <input type="hidden" name="contractId" value={contract.id} />
                            <ConfirmButton label="Cancelar contrato" confirmLabel="Confirmar: cancelar" className="rounded border border-red-300 bg-white px-3 py-1 font-medium text-red-700 hover:bg-red-50" />
                          </ActionForm>
                        </>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {typeof contractDraft === "string" && <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">{contractDraft}</p>}
          {order.status === "fechado" && !waiting && (
            <details className="mt-3 border-t border-slate-200 pt-2">
              <summary className="inline-block cursor-pointer py-1 font-medium text-brand underline">Enviar um PDF próprio em vez do modelo</summary>
              <p className="mt-1 text-slate-600">
                Para contrato fora do padrão. O cliente lê e assina exatamente o arquivo enviado (até 6 MB, sem senha); o sistema só junta a folha de registro das
                assinaturas.
              </p>
              <ActionForm action={sendUploadedContractAction} className="mt-2 flex flex-wrap items-end gap-3">
                <input type="hidden" name="number" value={order.number} />
                <div className="min-w-56 flex-1 basis-full">
                  <label htmlFor="contractFile" className="block text-xs font-medium text-slate-600">
                    Contrato em PDF
                  </label>
                  <input id="contractFile" name="file" type="file" accept="application/pdf,.pdf" className={`${INPUT} w-full`} />
                </div>
                <div className="min-w-56 flex-1">
                  <label htmlFor="fileRecipientName" className="block text-xs font-medium text-slate-600">
                    Quem assina pelo cliente
                  </label>
                  <input id="fileRecipientName" name="recipientName" type="text" defaultValue={order.customer?.contactName ?? order.customer?.name ?? ""} autoComplete="off" className={`${INPUT} w-full`} />
                </div>
                <div className="min-w-56 flex-1">
                  <label htmlFor="fileRecipientEmail" className="block text-xs font-medium text-slate-600">
                    E-mail de quem assina
                  </label>
                  <input id="fileRecipientEmail" name="recipientEmail" type="email" defaultValue={order.customer?.email ?? ""} autoComplete="off" className={`${INPUT} w-full`} />
                </div>
                {asksPhone && (
                  <div className="min-w-56 flex-1">
                    <label htmlFor="fileRecipientPhone" className="block text-xs font-medium text-slate-600">
                      Celular de quem assina (recebe o segundo código por SMS)
                    </label>
                    <input id="fileRecipientPhone" name="recipientPhone" type="tel" inputMode="tel" defaultValue={order.customer?.phone ?? ""} placeholder="(17) 99999-8888" autoComplete="off" className={`${INPUT} w-full`} />
                  </div>
                )}
                <button type="submit" className="rounded border border-slate-300 bg-white px-4 py-2 font-semibold hover:bg-slate-50">
                  Enviar este PDF para assinatura
                </button>
              </ActionForm>
            </details>
          )}
          {contractDraft !== null && typeof contractDraft !== "string" && (
            <ActionForm action={sendContractAction} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="number" value={order.number} />
              {contractDraft.blanks.length > 0 && (
                <p className="basis-full rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                  Vai sair em branco no contrato, porque não está cadastrado: {contractDraft.blanks.join("; ")}.
                </p>
              )}
              <div className="min-w-56 flex-1">
                <label htmlFor="recipientName" className="block text-xs font-medium text-slate-600">
                  Quem assina pelo cliente
                </label>
                <input id="recipientName" name="recipientName" type="text" defaultValue={order.customer?.contactName ?? order.customer?.name ?? ""} autoComplete="off" className={`${INPUT} w-full`} />
              </div>
              <div className="min-w-56 flex-1">
                <label htmlFor="recipientEmail" className="block text-xs font-medium text-slate-600">
                  E-mail de quem assina (recebe o link e o código)
                </label>
                <input id="recipientEmail" name="recipientEmail" type="email" defaultValue={order.customer?.email ?? ""} autoComplete="off" className={`${INPUT} w-full`} />
              </div>
              {asksPhone && (
                <div className="min-w-56 flex-1">
                  <label htmlFor="recipientPhone" className="block text-xs font-medium text-slate-600">
                    Celular de quem assina (recebe o segundo código por SMS)
                  </label>
                  <input id="recipientPhone" name="recipientPhone" type="tel" inputMode="tel" defaultValue={order.customer?.phone ?? ""} placeholder="(17) 99999-8888" autoComplete="off" className={`${INPUT} w-full`} />
                </div>
              )}
              <a href={`/api/pedidos/${order.number}/contrato-previa`} target="_blank" rel="noopener" className="py-2 font-medium text-brand underline">
                Conferir o contrato (PDF)
              </a>
              <button type="submit" className="rounded bg-brand px-4 py-2 font-semibold text-white hover:opacity-90">
                {contracts.length > 0 ? "Enviar novo contrato para assinatura" : "Enviar contrato para assinatura"}
              </button>
            </ActionForm>
          )}
        </section>
      )}
      {invoice && (
        <section className="mt-3 rounded-lg border border-slate-200 bg-white p-4 text-sm" aria-labelledby="nota-fiscal">
          <h2 id="nota-fiscal" className="text-sm font-semibold uppercase tracking-wide">
            Nota fiscal
          </h2>
          <p className="mt-1 text-slate-600">
            A conferência não envia nada nem consome número. Emitir assina com o certificado da empresa e envia à SEFAZ, no ambiente
            escolhido em Parâmetros → Fiscal ({invoice.input.environment === "producao" ? "produção: nota com valor fiscal" : "homologação: nota de teste, sem valor fiscal"}).
          </p>
          {invoices.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {invoices.map((item) => (
                <li key={item.id} className={`rounded border px-3 py-2 ${INVOICE_COLORS[item.status]}`}>
                  <strong>
                    Nota {item.number} · série {item.series} · {INVOICE_LABELS[item.status]}
                  </strong>
                  {item.environment === "homologacao" && " · homologação"}
                  {item.protocol && ` · protocolo ${item.protocol}`}
                  {item.statusReason && <span className="block">{item.statusCode}: {item.statusReason}</span>}
                  <span className="block break-all text-xs">Chave {item.accessKey} · {showDateTime(item.issuedAt)}</span>
                  {events
                    .filter((event) => event.invoiceId === item.id)
                    .map((event) => (
                      <span key={event.id} className="mt-1 block border-t border-current/20 pt-1">
                        <strong>{event.kind === "cancelamento" ? "Cancelamento" : `Carta de correção ${event.sequence}`}</strong> · protocolo {event.protocol} ·{" "}
                        {showDateTime(event.createdAt)}: {event.text}
                      </span>
                    ))}
                  {item.status === "autorizada" && (
                    <span className="flex flex-wrap gap-x-4">
                      <a href={`/api/pedidos/${order.number}/danfe`} target="_blank" rel="noopener" className="font-medium underline">
                        DANFE (PDF)
                      </a>
                      <a href={`/api/pedidos/${order.number}/nfe`} className="font-medium underline">
                        Baixar XML autorizado
                      </a>
                    </span>
                  )}
                  {mails
                    .filter((mail) => mail.invoiceId === item.id)
                    .map((mail) => (
                      <span key={mail.id} className="mt-1 block border-t border-current/20 pt-1 text-xs">
                        E-mail {mail.kind === "cancelamento" ? "do cancelamento" : "da nota"} para {mail.recipient} · {showDateTime(mail.sentAt)} ·{" "}
                        {mail.status === "enviado" ? "enviado" : `não saiu: ${mail.detail ?? "falha"}`} · pela caixa {mail.channel === "empresa" ? "da empresa" : "da Ávila Ops"}
                      </span>
                    ))}
                  {(item.status === "autorizada" || item.status === "cancelada") && (
                    <ActionForm action={sendNfeMailAction} className="mt-2 flex flex-wrap items-end gap-2 text-slate-900">
                      <input type="hidden" name="number" value={order.number} />
                      <input type="hidden" name="invoiceId" value={item.id} />
                      <div>
                        <label htmlFor={`email-${item.id}`} className="block text-xs font-medium">
                          Enviar {item.status === "cancelada" ? "o cancelamento" : "XML e DANFE"} por e-mail para
                        </label>
                        <input key={order.customer?.email ?? ""} id={`email-${item.id}`} name="to" type="email" defaultValue={order.customer?.email ?? ""} autoComplete="off" className={`${INPUT} mt-1 w-72 max-w-full`} />
                      </div>
                      <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                        Enviar por e-mail
                      </button>
                    </ActionForm>
                  )}
                  {item.status === "autorizada" && item.environment === invoice.input.environment && (
                    <details className="mt-2">
                      <summary className="cursor-pointer font-medium">Carta de correção ou cancelamento</summary>
                      <ActionForm action={registerNfeEventAction} className="mt-2 flex flex-col gap-2">
                        <input type="hidden" name="number" value={order.number} />
                        <input type="hidden" name="kind" value="correcao" />
                        <label htmlFor={`correcao-${item.id}`} className="text-xs font-medium">
                          Carta de correção (não corrige valor, imposto, quantidade, cliente nem data)
                        </label>
                        <textarea id={`correcao-${item.id}`} name="text" rows={2} placeholder="Ex.: Onde se lê Rua A, 10, leia-se Rua B, 20." className={`${INPUT} w-full text-slate-900`} />
                        <ConfirmButton label="Registrar carta de correção" confirmLabel="Confirmar: enviar à SEFAZ" className="self-start rounded border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-900 hover:bg-slate-50" />
                      </ActionForm>
                      <ActionForm action={registerNfeEventAction} className="mt-3 flex flex-col gap-2">
                        <input type="hidden" name="number" value={order.number} />
                        <input type="hidden" name="kind" value="cancelamento" />
                        <label htmlFor={`cancelar-${item.id}`} className="text-xs font-medium">
                          Cancelar a nota: motivo (a SEFAZ só aceita dentro do prazo legal, e não tem volta)
                        </label>
                        <input id={`cancelar-${item.id}`} name="text" type="text" placeholder="Ex.: Pedido cancelado pelo cliente antes da saída." className={`${INPUT} w-full text-slate-900`} />
                        <ConfirmButton label="Cancelar nota fiscal" confirmLabel="Confirmar: cancelar na SEFAZ" className="self-start rounded border border-red-300 bg-white px-3 py-1.5 font-medium text-red-700 hover:bg-red-50" />
                      </ActionForm>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={saveTransportAction} className="mt-3 grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="number" value={order.number} />
            <div className="sm:col-span-2">
              <label htmlFor="freightMode" className="block text-xs font-medium text-slate-600">
                Modalidade do frete na nota
              </label>
              <select key={invoice.input.freightMode} id="freightMode" name="freightMode" defaultValue={invoice.input.freightMode} className={`${INPUT} mt-1 w-full`}>
                {FREIGHT_MODES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {code} - {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="carrierId" className="block text-xs font-medium text-slate-600">
                Transportadora (opcional) ·{" "}
                <Link href="/parametros/transportadoras" className="text-brand underline">
                  cadastrar
                </Link>
              </label>
              <select key={transport.carrier?.id ?? ""} id="carrierId" name="carrierId" defaultValue={transport.carrier?.id ?? ""} className={`${INPUT} mt-1 w-full`}>
                <option value="">— sem transportadora na nota —</option>
                {carriers.map((carrier) => (
                  <option key={carrier.id} value={carrier.id}>
                    {carrier.name}
                  </option>
                ))}
              </select>
            </div>
            {(
              [
                ["volumes", "Volumes (qtd.)", transport.volumes === null ? "" : String(transport.volumes), "numeric"],
                ["volumeKind", "Espécie (caixa, palete…)", transport.volumeKind ?? "", "text"],
                ["grossWeight", "Peso bruto (kg)", transport.grossWeight === null ? "" : String(transport.grossWeight).replace(".", ","), "decimal"],
                ["netWeight", "Peso líquido (kg)", transport.netWeight === null ? "" : String(transport.netWeight).replace(".", ","), "decimal"],
              ] as const
            ).map(([name, label, value, mode]) => (
              <div key={name}>
                <label htmlFor={name} className="block text-xs font-medium text-slate-600">
                  {label}
                </label>
                <input key={value} id={name} name={name} type="text" inputMode={mode} defaultValue={value} autoComplete="off" className={`${INPUT} mt-1 w-full`} />
              </div>
            ))}
            <div className="sm:col-span-4">
              <button type="submit" className={BUTTON}>
                Salvar transporte
              </button>
            </div>
          </ActionForm>
          <details className="mt-3 rounded border border-slate-200 p-3" open={delivery !== null || (order.customer !== null && order.deliveryUf !== null && order.customer.uf !== order.deliveryUf)}>
            <summary className="cursor-pointer text-sm font-medium">
              Local de entrega: {delivery ? `${delivery.street}, ${delivery.number} - ${delivery.city}/${delivery.uf}` : "o endereço do cadastro do cliente"}
            </summary>
            <p className="mt-2 text-xs text-slate-600">
              Preencha só quando a mercadoria vai para outro endereço. O estado tem de ser o da entrega do pedido
              {order.deliveryUf ? ` (${order.deliveryUf})` : ""}: é ele que define a operação e o imposto da nota.
            </p>
            <ActionForm action={saveDeliveryAction} className="mt-3 grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="number" value={order.number} />
              {(
                [
                  ["deliveryCep", "CEP", delivery?.cep ?? "", "numeric", ""],
                  ["deliveryStreet", "Rua", delivery?.street ?? "", "text", "sm:col-span-2"],
                  ["deliveryNumber", "Número", delivery?.number ?? "", "text", ""],
                  ["deliveryComplement", "Complemento (opcional)", delivery?.complement ?? "", "text", ""],
                  ["deliveryDistrict", "Bairro", delivery?.district ?? "", "text", ""],
                  ["deliveryCity", "Cidade", delivery?.city ?? "", "text", ""],
                ] as const
              ).map(([name, label, value, mode, span]) => (
                <div key={name} className={span}>
                  <label htmlFor={name} className="block text-xs font-medium text-slate-600">
                    {label}
                  </label>
                  <input key={value} id={name} name={name} type="text" inputMode={mode} defaultValue={value} autoComplete="off" className={`${INPUT} mt-1 w-full`} />
                </div>
              ))}
              <div>
                <label htmlFor="deliveryState" className="block text-xs font-medium text-slate-600">
                  Estado
                </label>
                <select key={delivery?.uf ?? order.deliveryUf ?? ""} id="deliveryState" name="deliveryState" defaultValue={delivery?.uf ?? order.deliveryUf ?? ""} className={`${INPUT} mt-1 w-full`}>
                  <option value="">—</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
              {(
                [
                  ["deliveryName", "Quem recebe (opcional)", delivery?.name ?? "", "text", "sm:col-span-2"],
                  ["deliveryDocument", "CNPJ ou CPF de quem recebe (opcional)", delivery?.document ?? "", "text", ""],
                  ["deliveryPhone", "Telefone (opcional)", delivery?.phone ?? "", "tel", ""],
                ] as const
              ).map(([name, label, value, mode, span]) => (
                <div key={name} className={span}>
                  <label htmlFor={name} className="block text-xs font-medium text-slate-600">
                    {label}
                  </label>
                  <input key={value} id={name} name={name} type="text" inputMode={mode} defaultValue={value} autoComplete="off" className={`${INPUT} mt-1 w-full`} />
                </div>
              ))}
              <div className="flex flex-wrap gap-2 sm:col-span-4">
                <button type="submit" className={BUTTON}>
                  Salvar local de entrega
                </button>
                {delivery ? (
                  <button type="submit" name="clear" value="1" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
                    Usar o endereço do cadastro
                  </button>
                ) : null}
              </div>
            </ActionForm>
          </details>
          {invoice.problems.length > 0 ? (
            <>
              <p className="mt-3 font-medium">Para montar a nota, falta:</p>
              <ul className="mt-1 list-disc pl-5 text-slate-700">
                {invoice.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                {(
                  [
                    ["Produtos", invoice.totals.products],
                    ["IPI", invoice.totals.ipi],
                    ["ICMS", invoice.totals.icms],
                    ["DIFAL + FCP", invoice.totals.difal + invoice.totals.fcp],
                    ["PIS", invoice.totals.pis],
                    ["COFINS", invoice.totals.cofins],
                    ["Total da nota", invoice.totals.invoice],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="font-semibold">{formatMoney(value)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3">
                <a href={`/api/pedidos/${order.number}/nfe-previa`} className="font-medium text-brand underline">
                  Baixar XML de conferência
                </a>{" "}
                <span className="text-slate-600">(sem assinatura e sem valor fiscal)</span>
                {" · "}
                <a href={`/api/pedidos/${order.number}/danfe-previa`} target="_blank" rel="noopener" className="font-medium text-brand underline">
                  DANFE de conferência
                </a>
              </p>
              {!invoices.some((item) => item.status === "autorizada" && item.environment === invoice.input.environment) && (
                <ActionForm action={issueNfeAction} className="mt-3">
                  <input type="hidden" name="number" value={order.number} />
                  <ConfirmButton
                    label={invoices.some((item) => item.status === "assinada") ? "Reenviar a nota à SEFAZ" : "Emitir nota fiscal"}
                    confirmLabel="Confirmar: assinar e enviar à SEFAZ"
                    className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
                  />
                </ActionForm>
              )}
            </>
          )}
        </section>
      )}
      {!editable && (
        <div className="mt-3 rounded border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700">
          <p>
            {order.status === "aguardando_aprovacao"
              ? `Aguardando aprovação${reasons.length > 0 ? `: ${reasons.map((reason) => REASON_TEXT[reason]).join("; ")}` : ""}. Somente leitura.`
              : order.status === "fechado" && order.closedAt
                ? `Pedido fechado em ${showDateTime(order.closedAt)}. Somente leitura.`
                : "Pedido fora de negociação: somente leitura."}
          </p>
          {(order.status === "fechado" || order.status === "aguardando_aprovacao") && (
            <ActionForm action={reopenOrderAction} className="mt-2">
              <input type="hidden" name="number" value={order.number} />
              <ConfirmButton label="Reabrir para alterar" confirmLabel="Confirmar: voltar para negociação" className={BUTTON} />
              <span className="ml-3 text-xs text-slate-600">Os preços continuam os da tabela v{table.version}.</span>
            </ActionForm>
          )}
        </div>
      )}

      {/* On a phone the page is long: the parts stay one touch away, each saying whether it is filled in. */}
      <nav aria-label="Partes do pedido" className="sticky top-[var(--topbar)] z-10 -mx-4 mt-4 flex gap-2 overflow-x-auto border-b border-slate-200 bg-[#edefeb] px-4 py-2 text-sm md:hidden">
        {(
          [
            ["equipamentos", "Itens", order.items.length > 0],
            ["cliente", "Cliente", linked !== null && isComplete(linked)],
            ["entrega", "Entrega", order.deliveryUf !== null && order.productionDays !== null],
            ["pagamento", "Pagamento", plan.balance === 0 || (order.installmentCount !== null && order.balanceMethod !== null)],
          ] as const
        ).map(([anchor, label, filled]) => (
          <a
            key={anchor}
            href={`#${anchor}`}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 font-medium ${filled ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
          >
            {filled ? "✓" : "•"} {label}
          </a>
        ))}
      </nav>

      <fieldset disabled={!editable} className="mt-6 flex min-w-0 flex-col gap-6">
        <section className={CARD} aria-labelledby="equipamentos">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 id="equipamentos" className={TITLE}>
              Equipamentos
            </h2>
            <p className="text-xs text-slate-600">{units} un.</p>
          </div>
          {/* On a phone each item is a card; the table is for wider screens. */}
          <ul className="md:hidden">
            {order.items.map((item, index) => {
              const product = products.get(item.productId);
              const line = sale.lines[index];
              return (
                <li key={item.productId} className="border-b border-slate-200 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium">{product?.name}</span>
                      <span className="block text-xs text-slate-500">
                        {product?.code ?? "sem código"} · {showMoney(line.unitWithIpi)} {hasIpi ? "c/ IPI cada" : "cada"}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold">{showMoney(line.totalWithIpi)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <ActionForm action={setItemQuantityAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="number" value={order.number} />
                      <input type="hidden" name="productId" value={item.productId} />
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        Qtd
                        <input
                          key={item.quantity}
                          name="quantity"
                          type="text"
                          inputMode="numeric"
                          size={1}
                          defaultValue={item.quantity}
                          className={`${INPUT} w-16 py-1.5 text-right text-slate-900`}
                        />
                      </label>
                      {editable && (
                        <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-brand">
                          Alterar
                        </button>
                      )}
                    </ActionForm>
                    {editable && order.items.length > 1 && (
                      <ActionForm action={removeItemAction}>
                        <input type="hidden" name="number" value={order.number} />
                        <input type="hidden" name="productId" value={item.productId} />
                        <button type="submit" className="rounded px-2 py-1.5 text-sm text-red-700">
                          Remover
                        </button>
                      </ActionForm>
                    )}
                  </div>
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-sm font-semibold">
              <span>
                Total · {units} un.
                {discountValue > 0 && <span className="block text-xs font-normal text-slate-600">desconto de {showMoney(discountValue)}</span>}
              </span>
              <span className="text-base">{showMoney(sale.invoiceTotal)}</span>
            </li>
          </ul>
          <div className="relative hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-semibold">
                    Equipamento
                  </th>
                  <th scope="col" className="px-4 py-2 text-left font-semibold">
                    Qtd
                  </th>
                  {(hasIpi
                    ? ["Valor unit. s/ IPI", "Valor desconto", "IPI unit.", "Valor unit. c/ IPI", "Total c/ IPI"]
                    : ["Valor unit. tabela", "Valor desconto", "Valor unit. com desconto", "Total"]
                  ).map((column) => (
                    <th key={column} scope="col" className="whitespace-nowrap px-4 py-2 text-right font-semibold">
                      {column}
                    </th>
                  ))}
                  <th scope="col" className="px-4 py-2">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, index) => {
                  const product = products.get(item.productId);
                  const line = sale.lines[index];
                  return (
                    <tr key={item.productId} className="border-t border-slate-200 align-top">
                      <td className="px-4 py-3">
                        <span className="font-medium">{product?.name}</span>
                        <span className="block text-xs text-slate-500">{product?.code ?? "sem código"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <ActionForm action={setItemQuantityAction} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="number" value={order.number} />
                          <input type="hidden" name="productId" value={item.productId} />
                          <input
                            key={item.quantity}
                            name="quantity"
                            type="text"
                            inputMode="numeric"
                            size={1}
                            defaultValue={item.quantity}
                            aria-label={`Quantidade de ${product?.name}`}
                            className={`${INPUT} w-16 py-1 text-right`}
                          />
                          {editable && (
                            <button type="submit" className="rounded px-2 py-1 text-xs text-brand hover:bg-slate-100">
                              Alterar
                            </button>
                          )}
                        </ActionForm>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(line.unitPrice)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{moneyOrNone(line.unitDiscount)}</td>
                      {hasIpi && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {showMoney(line.unitIpi)}
                          <span className="block text-xs text-slate-500">{ipi}</span>
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(line.unitWithIpi)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{showMoney(line.totalWithIpi)}</td>
                      <td className="px-4 py-3 text-right">
                        {editable && order.items.length > 1 && (
                          <ActionForm action={removeItemAction}>
                            <input type="hidden" name="number" value={order.number} />
                            <input type="hidden" name="productId" value={item.productId} />
                            <button type="submit" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-slate-100">
                              Remover
                            </button>
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3">{units} un.</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(sale.tableTotal)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">{moneyOrNone(discountValue)}</td>
                  {hasIpi && <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(sale.ipi)}</td>}
                  <td />
                  <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(sale.invoiceTotal)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          {editable && (
            <ActionForm action={addItemAction} className="flex flex-wrap items-end gap-3 border-t border-slate-200 p-5">
              <input type="hidden" name="number" value={order.number} />
              <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                <label htmlFor="productId" className="block text-sm font-medium">
                  Adicionar equipamento da tabela v{table.version}
                </label>
                <select id="productId" name="productId" className={`${INPUT} mt-1 w-full`}>
                  {catalog.map((item) => (
                    <option key={item.productId} value={item.productId}>
                      {[item.code, item.name, hasIpi ? `${showMoney(item.tableWithIpi)} c/ IPI` : showMoney(item.table)].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="quantity" className="block text-sm font-medium">
                  Qtd
                </label>
                <input id="quantity" name="quantity" type="text" inputMode="numeric" defaultValue="1" className={`${INPUT} mt-1 w-20 text-right`} />
              </div>
              <button type="submit" className={PRIMARY}>
                Adicionar
              </button>
            </ActionForm>
          )}
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className={CARD} aria-labelledby="cliente">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
                <h2 id="cliente" className={TITLE}>
                  Cliente
                </h2>
                {linked ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                    <Link href={`${menuItem("clientes").href}/${linked.id}`} className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-900 underline">
                      Cadastrado
                    </Link>
                    <span
                      className={`rounded-full px-3 py-1 ${
                        isComplete(linked) ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {completenessText(linked)}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">Sem cliente ligado ao pedido</p>
                )}
              </div>
              <div className="flex flex-col gap-4 p-5">
                {linked && (
                  <p className="text-sm">
                    Ligado ao pedido: <span className="font-medium">{linked.name}</span>
                  </p>
                )}
                {editable && (
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <nav aria-label="Tipo de cliente" className="flex w-fit rounded-lg border border-slate-200 p-0.5 text-sm">
                      {(
                        [
                          ["PJ", "pj", "Empresa (CNPJ)"],
                          ["PF", "pf", "Pessoa física (CPF)"],
                        ] as const
                      ).map(([value, slug, label]) => (
                        <Link
                          key={value}
                          href={`${here}?cliente=${slug}`}
                          aria-current={kind === value ? "page" : undefined}
                          className={`rounded-md px-3 py-1.5 font-medium ${
                            kind === value ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {label}
                        </Link>
                      ))}
                    </nav>
                    <form method="get" action={here} role="search" className="flex w-full gap-2 sm:w-auto">
                      <input type="hidden" name="cliente" value={kind === "PF" ? "pf" : "pj"} />
                      <input
                        type="search"
                        name="doc"
                        defaultValue={typedDocument}
                        placeholder={kind === "PJ" ? "CNPJ já cadastrado" : "CPF já cadastrado"}
                        aria-label={kind === "PJ" ? "Buscar cliente pelo CNPJ" : "Buscar cliente pelo CPF"}
                        className={`${INPUT} min-w-0 flex-1 text-sm sm:w-56 sm:flex-none`}
                      />
                      <button type="submit" className={BUTTON}>
                        Buscar
                      </button>
                    </form>
                  </div>
                )}
                {searched !== "" && (
                  <p role="status" className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {found
                      ? `Cliente já cadastrado: ${found.name}. Confira e clique em Salvar cliente para ligar ao pedido.`
                      : "Nenhum cliente com este documento. Preencha a ficha e salve para cadastrar e ligar ao pedido."}
                  </p>
                )}
                {(editable || shown) && (
                  <CustomerForm
                    key={`${kind}-${shown?.id ?? "novo"}-${searched}`}
                    kind={kind}
                    id={shown?.id ?? null}
                    saved={shown ? customerToForm(shown) : { document: typedDocument }}
                    required={requiredOf(kind)}
                    cepNote={cepUf && `Pelo CEP, o estado é ${cepUf}. Preencha rua, bairro e cidade.`}
                    hidden={{ number: order.number }}
                    action={saveOrderCustomerAction}
                  />
                )}
              </div>
            </section>

            <section className={CARD} aria-labelledby="entrega">
              <h2 id="entrega" className={`${TITLE} border-b border-slate-200 px-5 py-3`}>
                Entrega e condições
              </h2>
              <ActionForm id={TERMS} action={saveTermsAction} className="grid gap-5 p-5 sm:grid-cols-2">
                <input type="hidden" name="number" value={order.number} />
                <div>
                  <label htmlFor="deliveryUf" className="block text-sm font-medium">
                    Estado de entrega
                  </label>
                  <select
                    key={order.deliveryUf ?? ""}
                    id="deliveryUf"
                    name="deliveryUf"
                    defaultValue={order.deliveryUf ?? ""}
                    className={`${INPUT} mt-1 w-full`}
                  >
                    <option value="">—</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf} — {UF_NAMES[uf]}
                      </option>
                    ))}
                  </select>
                  <p className={HELP}>Segue a UF do endereço. Troque só se a entrega for em outro estado.</p>
                </div>
                <fieldset>
                  <legend className="block text-sm font-medium">Cliente contribuinte do ICMS (tem IE)?</legend>
                  <div key={String(order.taxpayer)} className="mt-2 flex gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="taxpayer" value="nao" defaultChecked={!order.taxpayer} /> Não
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="taxpayer" value="sim" defaultChecked={order.taxpayer} disabled={!canBeTaxpayer} /> Sim
                    </label>
                  </div>
                  <p className={HELP}>Marcado sozinho pela inscrição estadual. ISENTO = Não.</p>
                </fieldset>
                <div>
                  <label htmlFor="productionDays" className="block text-sm font-medium">
                    Prazo de fabricação <span className="text-red-700">*</span>
                  </label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      id="productionDays"
                      name="productionDays"
                      type="text"
                      inputMode="numeric"
                      defaultValue={order.productionDays ?? ""}
                      className={`${INPUT} w-24 text-right`}
                    />
                    <select key={order.productionUnit} name="productionUnit" defaultValue={order.productionUnit} aria-label="Unidade do prazo de fabricação" className={`${INPUT} w-auto`}>
                      <option value="corridos">dias corridos</option>
                      <option value="uteis">dias úteis</option>
                    </select>
                  </div>
                  {dates.completion && (
                    <p className={HELP}>
                      Previsão de conclusão: <strong>{showIsoDate(dates.completion)}</strong>, contando do pagamento da entrada
                      {order.productionUnit === "uteis" ? " (segunda a sexta; feriado não é descontado)" : ""}.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="freight" className="block text-sm font-medium">
                    Frete por nossa conta (R$)
                  </label>
                  <input
                    id="freight"
                    name="freight"
                    type="text"
                    inputMode="decimal"
                    defaultValue={order.freight === 0 ? "" : formatMoney(order.freight)}
                    placeholder="0,00"
                    className={`${INPUT} mt-1 w-full text-right`}
                  />
                  <p className={HELP}>Deixe vazio se o cliente paga ou retira.</p>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="notes" className="block text-sm font-medium">
                    Observações
                  </label>
                  <input
                    id="notes"
                    name="notes"
                    type="text"
                    defaultValue={order.notes ?? ""}
                    placeholder="Prazo, condição de pagamento…"
                    className={`${INPUT} mt-1 w-full`}
                  />
                </div>
                {editable && (
                  <div className="sm:col-span-2">
                    <button type="submit" className={PRIMARY}>
                      Salvar condições e desconto
                    </button>
                  </div>
                )}
              </ActionForm>
            </section>

            <section className={CARD} aria-labelledby="pagamento">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
                <h2 id="pagamento" className={TITLE}>
                  Forma de pagamento
                </h2>
                <p className="text-xs text-slate-600">
                  Política: entrada de pelo menos {showPercent(table.minDownPayment, 0)} da nota ({showMoney(plan.policyDownPayment)})
                </p>
              </div>
              <ActionForm action={savePaymentAction} className="grid gap-5 p-5 sm:grid-cols-3">
                <input type="hidden" name="number" value={order.number} />
                <div className="sm:col-span-3 lg:col-span-1">
                  <DownPaymentFields key={`${order.downPayment}-${sale.invoiceTotal}`} name="downPayment" amount={order.downPayment === 0 ? "" : formatMoney(order.downPayment)} invoiceTotal={sale.invoiceTotal} />
                  <p className={HELP}>
                    {showPercent(plan.downPaymentRate)} da nota ·{" "}
                    {plan.meetsPolicy ? "dentro da política" : "abaixo da política: precisa de aprovação"}
                  </p>
                </div>
                <div>
                  <label htmlFor="downPaymentMethod" className="block text-sm font-medium">
                    Forma da entrada
                  </label>
                  <select
                    key={order.downPaymentMethod ?? ""}
                    id="downPaymentMethod"
                    name="downPaymentMethod"
                    defaultValue={order.downPaymentMethod ?? ""}
                    className={`${INPUT} mt-1 w-full`}
                  >
                    <option value="">—</option>
                    {methodsWith(order.downPaymentMethod).map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="downPaymentDate" className="block text-sm font-medium">
                    Data da entrada
                  </label>
                  <input
                    id="downPaymentDate"
                    name="downPaymentDate"
                    type="date"
                    defaultValue={order.downPaymentDate ?? ""}
                    className={`${INPUT} mt-1 w-full`}
                  />
                  <p className={HELP}>Vazio: na confirmação do pedido.</p>
                </div>
                <div>
                  <label htmlFor="installmentCount" className="block text-sm font-medium">
                    Parcelas do saldo
                  </label>
                  <input
                    id="installmentCount"
                    name="installmentCount"
                    type="text"
                    inputMode="numeric"
                    defaultValue={order.installmentCount ?? ""}
                    className={`${INPUT} mt-1 w-24 text-right`}
                  />
                  <p className={HELP}>Saldo: {showMoney(plan.balance)}</p>
                </div>
                <div>
                  <label htmlFor="balanceMethod" className="block text-sm font-medium">
                    Forma do saldo
                  </label>
                  <select
                    key={order.balanceMethod ?? ""}
                    id="balanceMethod"
                    name="balanceMethod"
                    defaultValue={order.balanceMethod ?? ""}
                    className={`${INPUT} mt-1 w-full`}
                  >
                    <option value="">—</option>
                    {methodsWith(order.balanceMethod).map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                  {onDelivery.length > 0 && (
                    <p className={HELP}>
                      {order.balanceOnDelivery
                        ? `Saldo na entrega: uma parcela de ${showMoney(plan.balance)} no dia em que o pedido fica pronto${dates.completion ? ` (${showIsoDate(dates.completion)})` : ""}.`
                        : `Com "${onDelivery[0]}", o saldo vira uma parcela só, no dia em que o pedido fica pronto; parcelas e prazos não são usados.`}
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <div>
                    <label htmlFor="firstInstallmentDays" className="block text-sm font-medium">
                      1ª parcela em
                    </label>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        id="firstInstallmentDays"
                        name="firstInstallmentDays"
                        type="text"
                        inputMode="numeric"
                        size={1}
                        defaultValue={order.firstInstallmentDays ?? ""}
                        className={`${INPUT} w-16 text-right`}
                      />
                      <span className="text-xs text-slate-600">dias</span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="installmentIntervalDays" className="block text-sm font-medium">
                      Intervalo
                    </label>
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        id="installmentIntervalDays"
                        name="installmentIntervalDays"
                        type="text"
                        inputMode="numeric"
                        size={1}
                        defaultValue={order.installmentIntervalDays ?? ""}
                        className={`${INPUT} w-16 text-right`}
                      />
                      <span className="text-xs text-slate-600">dias</span>
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor="paymentNotes" className="block text-sm font-medium">
                    Observações do pagamento
                  </label>
                  <input
                    id="paymentNotes"
                    name="paymentNotes"
                    type="text"
                    defaultValue={order.paymentNotes ?? ""}
                    className={`${INPUT} mt-1 w-full`}
                  />
                </div>
                {editable && (
                  <div className="sm:col-span-3">
                    <button type="submit" className={PRIMARY}>
                      Salvar pagamento
                    </button>
                  </div>
                )}
              </ActionForm>
              {editable && !order.balanceOnDelivery && installmentRows.length > 0 && (
                <div className="border-t border-slate-200 p-5">
                  <h3 className="text-sm font-semibold">Parcelas do saldo</h3>
                  <p className={HELP}>
                    Para mudar a data, o valor ou a forma de uma parcela, edite aqui e salve.{" "}
                    {agreedInstallments ? "Estas parcelas foram combinadas uma a uma." : "Hoje elas são calculadas pelo número de parcelas e pelos prazos acima."} Salvar o
                    pagamento acima recalcula tudo.
                  </p>
                  <ActionForm action={saveInstallmentsAction} className="mt-3 flex flex-col gap-2">
                    <input type="hidden" name="number" value={order.number} />
                    {installmentRows.map((part, index) => (
                      <div key={`${part.label}-${part.dueDate}-${part.amount}-${part.method ?? ""}`} className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2 sm:grid-cols-[3rem_11rem_10rem_minmax(0,1fr)]">
                        <span className="pb-2 text-sm font-medium">{part.label}</span>
                        <label className="block text-xs font-medium text-slate-600">
                          {index === 0 ? "Vencimento" : <span className="sr-only">Vencimento da parcela {part.label}</span>}
                          <input name="dueDate" type="date" defaultValue={part.dueDate} className={`${INPUT} mt-1 w-full`} />
                        </label>
                        <label className="block text-xs font-medium text-slate-600">
                          {index === 0 ? "Valor (R$)" : <span className="sr-only">Valor da parcela {part.label}</span>}
                          <input name="amount" type="text" inputMode="decimal" defaultValue={formatMoney(part.amount)} className={`${INPUT} mt-1 w-full text-right`} />
                        </label>
                        <label className="col-span-3 block text-xs font-medium text-slate-600 sm:col-span-1">
                          {index === 0 ? "Forma" : <span className="sr-only">Forma da parcela {part.label}</span>}
                          <select name="method" defaultValue={part.method ?? ""} className={`${INPUT} mt-1 w-full`}>
                            <option value="">—</option>
                            {methodsWith(part.method).filter((method) => !onDelivery.includes(method)).map((method) => (
                              <option key={method} value={method}>
                                {method}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}
                    <p className="text-xs text-slate-600">
                      As parcelas têm de somar o saldo: <strong>{showMoney(plan.balance)}</strong>.
                    </p>
                    <div>
                      <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                        Salvar parcelas
                      </button>
                    </div>
                  </ActionForm>
                </div>
              )}
              {plan.receipts.length > 0 && (
                <div className="relative overflow-x-auto border-t border-slate-200">
                  <table className="w-full text-sm">
                    <caption className="px-5 py-2 text-left text-xs text-slate-600">
                      Recebimentos previstos. A comissão é uma previsão: só vale quando o valor entra.
                    </caption>
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        {["Parcela", "Vencimento", "Forma"].map((column) => (
                          <th key={column} scope="col" className="px-5 py-2 text-left font-semibold">
                            {column}
                          </th>
                        ))}
                        {["Valor", "Comissão"].map((column) => (
                          <th key={column} scope="col" className="px-5 py-2 text-right font-semibold">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plan.receipts.map((receipt) => (
                        <tr key={receipt.label} className="border-t border-slate-200">
                          <td className="px-5 py-2 font-medium">{receipt.label}</td>
                          <td className="px-5 py-2">{showIsoDate(receipt.dueDate)}</td>
                          <td className="px-5 py-2">{receipt.method ?? NONE}</td>
                          <td className="whitespace-nowrap px-5 py-2 text-right">{showMoney(receipt.amount)}</td>
                          <td className="whitespace-nowrap px-5 py-2 text-right">{showMoney(receipt.commission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <section className={`${CARD} p-5`} aria-labelledby="desconto">
              <div className="flex items-center justify-between">
                <h2 id="desconto" className={TITLE}>
                  Desconto
                </h2>
                <p className="text-xs text-slate-600">sobre a tabela</p>
              </div>
              {/* The field belongs to the form of "Entrega e condições": one save, one account. */}
              <div className="mt-3 flex flex-col gap-3">
                {/* The key gives a fresh field after each save: the amount in reais follows the items. */}
                <DiscountFields
                  key={`${order.discount}:${sale.tableTotal}`}
                  form={TERMS}
                  name="discount"
                  percent={formatPercent(order.discount)}
                  tableTotal={sale.tableTotal}
                  disabled={!editable}
                  invoiceFactor={1 + table.ipi}
                  free={table.freeDiscount}
                  limit={authority}
                />
                {editable && (
                  <button form={TERMS} type="submit" className={`${BUTTON} self-start`}>
                    Aplicar
                  </button>
                )}
              </div>
              {board && (
                <p className="mt-3 text-xs text-slate-600">
                  <strong>Na meta</strong> até {showPercent(board.max.atTarget)} · <strong>Abaixo da meta</strong> até{" "}
                  {showPercent(board.max.noLoss)} · <strong>Prejuízo</strong> acima
                </p>
              )}
              {standing.band ? (
                <div className={`mt-3 rounded-lg border p-3 text-sm ${BAND_COLORS[standing.band]}`}>
                  <p className="font-semibold uppercase tracking-wide">
                    {board ? PROFIT_TITLES[standing.band] : BAND_TEXT[standing.band].label}
                  </p>
                  <p className="mt-1">
                    {board
                      ? `Lucro líquido de ${showPercent(board.quote.netProfitRate)} (${showMoney(board.quote.netProfit)}). Meta: ${showPercent(board.targetNetProfit)}.`
                      : BAND_TEXT[standing.band].text}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">Informe o estado de entrega para ver a situação do desconto.</p>
              )}
            </section>

            <section className={`${CARD} p-5`} aria-label="Resumo">
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
                {(
                  [
                    ["Total de tabela", showMoney(sale.tableTotal)],
                    [`Desconto (${showPercent(sale.discount)})`, `– ${showMoney(discountValue)}`],
                    ...(hasIpi ? ([["Valor sem IPI", showMoney(sale.netSale)], [`IPI (${ipi})`, showMoney(sale.ipi)]] as const) : []),
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-slate-600">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
                <div className="contents">
                  <dt className="border-t border-slate-200 pt-3 font-medium">Total da nota</dt>
                  <dd className="border-t border-slate-200 pt-3 text-right text-2xl font-bold">{showMoney(sale.invoiceTotal)}</dd>
                </div>
                <div className="contents">
                  <dt className="text-slate-600">Entrada ({showPercent(plan.downPaymentRate)})</dt>
                  <dd className="text-right font-medium">{showMoney(plan.downPayment)}</dd>
                  <dt className="text-slate-600">Saldo</dt>
                  <dd className="text-right font-medium">{showMoney(plan.balance)}</dd>
                </div>
                <div className="contents text-xs">
                  <dt className="text-slate-600">Prazo de fabricação</dt>
                  <dd className="text-right">{order.productionDays === null ? NONE : productionText(order.productionDays, order.productionUnit)}</dd>
                  <dt className="text-slate-600">Validade da proposta</dt>
                  <dd className="text-right">{showIsoDate(dates.proposalValidUntil)}</dd>
                </div>
              </dl>
            </section>

            {board && (
              <DirectorBoard
                board={board}
                imported={lineImported}
                note={assumedUf ? `Calculado para entrega em ${UF_NAMES[assumedUf]}: o pedido ainda não tem o estado de entrega gravado.` : null}
              />
            )}
            {board && shortOfRequired > 0 && (
              <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Faltam <strong>{showMoney(shortOfRequired)}</strong> de entrada para cobrir {lineWords(lineImported).payShort}, o lucro da meta e a comissão.
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {/* On a phone the total stays in sight, with the way to the closing. */}
      <div className="sticky bottom-[var(--tabbar)] z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
        <span>
          <span className="block text-xs text-slate-600">Total da nota</span>
          <span className="block text-lg font-bold leading-tight">{showMoney(sale.invoiceTotal)}</span>
        </span>
        {editable ? (
          <a href="#fechar" className="rounded-lg bg-brand px-4 py-3 font-semibold text-white">
            {missing.length > 0 ? `Faltam ${missing.length} para fechar` : "Ir para fechar"}
          </a>
        ) : (
          <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-medium">{STATUS_LABELS[order.status]}</span>
        )}
      </div>

      {editable && (
        <section className={`${CARD} mt-6 scroll-mt-20 p-5`} aria-labelledby="fechar">
          <h2 id="fechar" className={`${TITLE} scroll-mt-24`}>
            Fechar pedido
          </h2>
          {missing.length > 0 ? (
            <ul className="mt-3 list-disc pl-5 text-sm text-slate-700">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-700">
              {reasons.length > 0
                ? `Vai para aprovação, porque ${reasons.map((reason) => REASON_TEXT[reason]).join(" e ")}.`
                : "Dentro da política: fecha na hora."}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <ActionForm action={closeOrderAction}>
              <input type="hidden" name="number" value={order.number} />
              <button type="submit" disabled={missing.length > 0} className={`${PRIMARY} disabled:cursor-not-allowed disabled:opacity-50`}>
                {reasons.length > 0 && missing.length === 0 ? "Enviar para aprovação" : "Fechar pedido"}
              </button>
            </ActionForm>
            <ActionForm action={deleteOrderAction}>
              <input type="hidden" name="number" value={order.number} />
              <ConfirmButton
                label="Excluir pedido"
                confirmLabel="Confirmar exclusão"
                className="rounded border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              />
            </ActionForm>
          </div>
        </section>
      )}
    </>
  );
}

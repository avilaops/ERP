import { addressLine } from "@/lib/contract/text";
import { formatDocument, formatPhone } from "@/lib/customer";
import type { OrderTransport } from "@/lib/db/carriers";
import type { FiscalSettings } from "@/lib/db/fiscal";
import type { OrderDelivery } from "@/lib/db/order-delivery";
import type { Order } from "@/lib/db/orders";
import type { PixSettings } from "@/lib/db/pix";
import { parseMoney, showMoney } from "@/lib/format";
import { pixCode } from "@/lib/pix";
import { UF_NAMES } from "@/lib/order-form";
import type { QuoteDocument } from "@/lib/quote/document";
import type { ProposalDetails } from "@/lib/quote/settings";

export type QuoteContext = {
  issuer: FiscalSettings;
  companyDetails: ProposalDetails;
  orderDetails: ProposalDetails;
  delivery: OrderDelivery | null;
  transport: OrderTransport;
  pix: PixSettings | null;
  /** Remaining down payment, net of actual receipts and confirmed refunds. */
  downPaymentOpen: number | null;
  downPaymentIsPix: boolean;
  acceptance: string | null;
};
export type QuoteMeasures = { weightKg?: number | null; ncm?: string | null };

/** PIX through a payment link keeps the provider's flow instead of a direct company QR. */
export const usesCompanyPix = (method: string | null, code: string | null): boolean => code === "17" && !/\blink\b/i.test(method ?? "");

/** Only confirmed register data and authored terms; missing commercial terms stay explicit. */
export function completeQuote(document: QuoteDocument, order: Pick<Order, "number" | "status" | "customer" | "items" | "downPayment" | "customInstallments" | "installmentIntervalDays">, context: QuoteContext, products: Map<number, QuoteMeasures>): QuoteDocument {
  const { issuer, companyDetails: contact, delivery, transport } = context;
  const terms = { ...contact, ...context.orderDetails };
  const issuerLines = [
    issuer.legalName && issuer.legalName !== document.company ? issuer.legalName : null,
    `CNPJ: ${issuer.cnpj ? formatDocument(issuer.cnpj) : "a cadastrar"}`,
    `Inscrição estadual: ${issuer.stateRegistration ?? "a cadastrar"}`,
    addressLine(issuer) || "Endereço: a cadastrar",
    contact.phone ? `Telefone: ${formatPhone(contact.phone)}` : "Telefone: a cadastrar",
    contact.email ?? "E-mail comercial: a cadastrar",
    contact.website ? `Site: ${contact.website}` : "Site: a cadastrar",
  ].filter((line): line is string => Boolean(line));
  const differentState = !delivery && order.customer?.uf && document.delivery && document.delivery !== UF_NAMES[order.customer.uf];
  const address = delivery ? addressLine({ ...delivery, streetNumber: delivery.number }) : order.customer && !differentState ? addressLine(order.customer) : "";
  const location = address || document.delivery || "a definir";
  const addressSource = delivery ? "endereço de entrega informado no pedido" : address ? "endereço do cadastro do cliente" : "estado informado no pedido; confirmar endereço completo";
  const freight = terms.freightMode === "CIF" ? "CIF: contratação e pagamento pela vendedora."
    : terms.freightMode === "FOB" ? "FOB: contratação e pagamento pelo cliente."
    : terms.freightMode === "retirada" ? "Retirada pelo cliente." : "Modalidade e responsável pelo frete: a definir.";
  const weightComplete = order.items.every((item) => products.get(item.productId)?.weightKg != null);
  const totalWeight = order.items.reduce((sum, item) => sum + (products.get(item.productId)?.weightKg ?? 0) * item.quantity, 0);
  const logistics = [
    `Local: ${location} (${addressSource})`,
    freight,
    ...(terms.freightAmount ? [`Frete pago diretamente à transportadora: ${showMoney(parseMoney(terms.freightAmount)!)}; não integra o total dos equipamentos.`] : []),
    ...(terms.freightTerms ? [terms.freightTerms] : []),
    `Transporte após a fabricação: ${terms.deliveryEstimate ?? "prazo a definir com a transportadora; o prazo de fabricação não inclui transporte."}`,
    ...(terms.deliveryNotes ? [terms.deliveryNotes] : []),
    ...(transport.carrier ? [`Transportadora: ${transport.carrier.name}`] : []),
    weightComplete ? `Peso total dos equipamentos: ${totalWeight.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg.` : "Peso total: completar o peso dos equipamentos no cadastro.",
    transport.volumes === null ? "Volumes e cubagem para transporte: a informar após a embalagem." : `Volumes: ${transport.volumes}${transport.volumeKind ? ` (${transport.volumeKind})` : ""}. Cubagem embalada: a informar.`,
    ...(transport.grossWeight !== null ? [`Peso bruto informado para transporte: ${transport.grossWeight.toLocaleString("pt-BR")} kg.`] : []),
  ];
  const downOpen = context.downPaymentOpen ?? order.downPayment;
  const status = order.status === "fechado" ? `Pedido fechado${order.downPayment > 0 && downOpen > 0 ? " · aguardando entrada" : ""}`
    : order.status === "aguardando_aprovacao" ? "Orçamento aguardando aprovação interna" : order.status === "em_negociacao" ? "Orçamento em negociação" : "Pedido cancelado ou perdido";
  const cadence = order.customInstallments.length === 0 && document.payment.some((line) => /em \d+ parcelas/.test(line)) && order.installmentIntervalDays
    ? [`Vencimentos calculados a cada ${order.installmentIntervalDays} dias.`] : [];
  const footer = [`${document.company}${issuer.cnpj ? ` · CNPJ ${formatDocument(issuer.cnpj)}` : ""}`, [contact.phone ? formatPhone(contact.phone) : null, contact.email].filter(Boolean).join(" · ")].filter(Boolean);
  return {
    ...document, issuerLines, status, footer, electronicAcceptance: context.acceptance !== null,
    delivery: null,
    manager: document.manager && document.manager === document.manager.toUpperCase() ? displayName(document.manager) : document.manager,
    payment: [...document.payment, ...cadence, ...(context.downPaymentIsPix && downOpen > 0 && !context.pix ? ["Dados para PIX: solicitar à vendedora antes de pagar."] : [])],
    items: document.items.map((item) => ({ ...item, description: [`NCM: ${products.get(item.productId)?.ncm ?? "a cadastrar"}`, item.description].filter(Boolean).join(" · ") })),
    sections: [
      { title: "Entrega e transporte", lines: logistics },
      { title: "Garantia e serviços", lines: [`Garantia: ${terms.warranty ?? "prazo e cobertura a definir."}`, `Montagem/instalação: ${terms.installation ?? "inclusão e condições a definir."}`] },
      { title: "Condições comerciais", lines: [
        document.validUntil ? `Validade da proposta: ${document.validUntil}.` : "Validade de orçamento: não se aplica a este pedido fechado.",
        `Pagamento em atraso: ${terms.latePayment ?? "condições a definir no contrato."}`,
        `Cancelamento: ${terms.cancellation ?? "condições a definir no contrato."}`,
        `Atraso da entrada: ${terms.delayedDownPayment ?? "o prazo de fabricação conta do pagamento da entrada; demais condições a definir no contrato."}`,
      ] },
      ...(context.acceptance ? [{ title: "Aceite digital", lines: [context.acceptance] }] : []),
    ],
    pix: context.pix && context.downPaymentIsPix && downOpen > 0 && ["em_negociacao", "fechado"].includes(order.status) ? {
      key: context.pix.key, name: context.pix.name, amount: showMoney(downOpen),
      code: pixCode({ ...context.pix, amount: downOpen, identifier: `${order.number}E` }),
    } : undefined,
  };
}

/** Presentation only: never rewrites the registered legal name or document. */
export function displayName(value: string): string {
  return value.toLocaleLowerCase("pt-BR").replace(/(^|[\s-])\p{L}/gu, (piece) => piece.toLocaleUpperCase("pt-BR")).replace(/\b(Da|Das|De|Do|Dos|E)\b/g, (piece) => piece.toLowerCase());
}

import { formatDocument, formatPhone } from "@/lib/customer";
import type { Order } from "@/lib/db/orders";
import type { PublishedTable } from "@/lib/db/price-table";
import { formatPercent, showIsoDate, showMoney, showPercent } from "@/lib/format";
import { UF_NAMES } from "@/lib/order-form";
import { productionText } from "@/lib/order-quote";
import type { DueDates, PaymentPlan } from "@/lib/order-quote";
import type { SaleQuote } from "@/lib/pricing/order";
import { compareByCode } from "@/lib/products-view";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class QuoteError extends Error {}

export const NO_ITEMS_MESSAGE = "Inclua ao menos um equipamento para gerar o orçamento.";

export type QuoteCustomer = {
  name: string;
  tradeName: string | null;
  /** CNPJ or CPF, with its punctuation. */
  document: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  /** `Cidade/UF`, or only what there is. */
  cityUf: string | null;
};

export type QuoteItem = {
  productId: number;
  /** Empty for a product without a code. */
  code: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: string;
  /** `null` when the order has no discount: the column is not drawn. */
  unitDiscount: string | null;
  unitIpi: string;
  unitWithIpi: string;
  totalWithIpi: string;
};

/** One row of the summary. `strong` is the one drawn larger: the invoice total. */
export type QuoteTotal = { label: string; value: string; strong: boolean };

/** The quotation in text, ready to be drawn: what the customer reads, and nothing else. */
export type QuoteDocument = {
  /** The company that sells: the one of the session. */
  company: string;
  /** `Orçamento #260930-BBMN`. */
  title: string;
  /** `DD/MM/AAAA`. */
  issuedOn: string;
  validUntil: string;
  seller: { name: string; email: string };
  /** The commercial manager of the company and where the proposal is issued, when the company registered them. */
  manager: string | null;
  place: string | null;
  /** `Votuporanga/SP, 8 de outubro de 2026`: what goes above the signatures. Without a place, only the date. */
  signedAt: string;
  /** The payment as agreed, one line each: down payment, then the balance. Empty while nothing was agreed. */
  payment: string[];
  customer: QuoteCustomer | null;
  /** The name of the state of delivery. */
  delivery: string | null;
  production: string | null;
  notes: string | null;
  items: QuoteItem[];
  /** Whether the items show the column of the discount. */
  hasDiscount: boolean;
  /** `false` for a company without IPI: the proposal shows no column nor line of it. */
  hasIpi: boolean;
  /** The summary of the screen, from the table total down to `Total da nota`. */
  totals: QuoteTotal[];
  /** Sum of the quantities. */
  units: number;
};

type QuoteInput = {
  /** Name of the company of the session. */
  company: string;
  order: Pick<Order, "number" | "sellerName" | "sellerEmail" | "customer" | "deliveryUf" | "productionDays" | "notes" | "items"> & Partial<Pick<Order, "productionUnit">>;
  table: Pick<PublishedTable, "version" | "ipi" | "items">;
  /** The team's account of this order (`saleOf`): one line per item, in the order of `order.items`. */
  sale: SaleQuote;
  dates: Pick<DueDates, "proposalValidUntil">;
  products: Map<number, { description: string | null }>;
  /** `AAAA-MM-DD`. */
  today: string;
  /** From the company's parameters; absent or `null`, the proposal goes without them. */
  manager?: string | null;
  place?: string | null;
  /** The payment plan of the order (`paymentOf`), to print the conditions. Absent, nothing about payment is printed. */
  payment?: { plan: PaymentPlan; onDelivery: boolean } | null;
};

const blankToNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** `2026-10-08` → `8 de outubro de 2026`. */
const longDate = (day: string) => `${Number(day.slice(8, 10))} de ${MONTHS[Number(day.slice(5, 7)) - 1]} de ${day.slice(0, 4)}`;

/**
 * Dimensions and weight of an equipment, as the proposal prints them under its
 * name. What was not registered is left out; nothing registered, no line.
 */
export function measuresText({ lengthMm, widthMm, heightMm, weightKg }: { lengthMm: number | null; widthMm: number | null; heightMm: number | null; weightKg: number | null }): string | null {
  const metres = (mm: number) => (mm / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sides = [lengthMm, widthMm, heightMm];
  const size = sides.every((side) => side !== null)
    ? `Dimensões (C x L x A): ${sides.map((side) => metres(side as number)).join(" x ")} m`
    : [lengthMm !== null && `Comprimento: ${metres(lengthMm)} m`, widthMm !== null && `Largura: ${metres(widthMm)} m`, heightMm !== null && `Altura: ${metres(heightMm)} m`].filter(Boolean).join(" · ");
  const weight = weightKg === null ? "" : `Peso: ${weightKg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
  return [size, weight].filter((part) => part !== "").join(" · ") || null;
}

/** The payment as the customer reads it: the down payment and then the balance, by how it was agreed. */
function paymentLines(plan: PaymentPlan, onDelivery: boolean): string[] {
  const [first, ...rest] = plan.receipts;
  if (!first) return [];
  const down = first.label === "Entrada" ? first : null;
  const parts = down ? rest : plan.receipts;
  const lines: string[] = [];
  if (down) lines.push(`Entrada de ${showMoney(down.amount)} (${showPercent(plan.downPaymentRate)})${down.method ? ` via ${down.method}` : ""} em ${showIsoDate(down.dueDate)}`);
  if (parts.length === 0) {
    if (plan.balance > 0) lines.push(`Saldo de ${showMoney(plan.balance)}: a combinar`);
  } else if (onDelivery) {
    lines.push(`Saldo de ${showMoney(plan.balance)} na entrega (previsão: ${showIsoDate(parts[0].dueDate)})`);
  } else {
    const method = parts[0].method ? ` via ${parts[0].method}` : "";
    lines.push(`Saldo de ${showMoney(plan.balance)} em ${parts.length} ${parts.length === 1 ? "parcela" : "parcelas"}${method}:`);
    for (const part of parts) lines.push(`${part.label}: ${showMoney(part.amount)} em ${showIsoDate(part.dueDate)}`);
  }
  return lines;
}

/**
 * What goes on the quotation, from the team's account of the order. Name, code
 * and price are the ones of the version of the order; the description is the
 * one registered today. The seller is the one of the order, whoever asks.
 */
export function quoteDocument({ company, order, table, sale, dates, products, today, manager = null, place = null, payment = null }: QuoteInput): QuoteDocument {
  if (order.items.length === 0) throw new QuoteError(NO_ITEMS_MESSAGE);
  if (sale.lines.length !== order.items.length) throw new Error("A conta do pedido não tem uma linha por equipamento.");

  const hasDiscount = sale.discount > 0;
  const hasIpi = table.ipi > 0;
  const published = new Map(table.items.map((item) => [item.productId, item]));
  const items = order.items
    .map(({ productId, quantity }, index) => {
      const product = published.get(productId);
      if (!product) throw new Error(`Equipamento ${productId} não está na tabela v${table.version}.`);
      return { productId, quantity, product, line: sale.lines[index] };
    })
    .sort((a, b) => compareByCode(a.product, b.product) || a.productId - b.productId)
    .map(({ productId, quantity, product, line }) => ({
      productId,
      code: product.code ?? "",
      name: product.name,
      description: blankToNull(products.get(productId)?.description),
      quantity,
      unitPrice: showMoney(line.unitPrice),
      unitDiscount: hasDiscount ? showMoney(line.unitDiscount) : null,
      unitIpi: showMoney(line.unitIpi),
      unitWithIpi: showMoney(line.unitWithIpi),
      totalWithIpi: showMoney(line.totalWithIpi),
    }));

  const { customer } = order;
  const totals: QuoteTotal[] = [
    { label: "Total de tabela", value: showMoney(sale.tableTotal), strong: false },
    { label: `Desconto (${showPercent(sale.discount)})`, value: `– ${showMoney(sale.tableTotal - sale.netSale)}`, strong: false },
    { label: "Valor sem IPI", value: showMoney(sale.netSale), strong: false },
    { label: `IPI (${formatPercent(table.ipi)}%)`, value: showMoney(sale.ipi), strong: false },
    { label: "Total da nota", value: showMoney(sale.invoiceTotal), strong: true },
  ].filter((_, index) => (hasDiscount || index !== 1) && (hasIpi || (index !== 2 && index !== 3)));

  return {
    company,
    title: `Orçamento #${order.number}`,
    issuedOn: showIsoDate(today),
    validUntil: showIsoDate(dates.proposalValidUntil),
    seller: { name: order.sellerName, email: order.sellerEmail },
    manager: blankToNull(manager),
    place: blankToNull(place),
    signedAt: [blankToNull(place), longDate(today)].filter(Boolean).join(", "),
    payment: payment ? paymentLines(payment.plan, payment.onDelivery) : [],
    customer: customer && {
      name: customer.name,
      tradeName: customer.tradeName,
      document: formatDocument(customer.document),
      contactName: customer.contactName,
      phone: customer.phone === null ? null : formatPhone(customer.phone),
      email: customer.email,
      cityUf: [customer.city, customer.uf].filter(Boolean).join("/") || null,
    },
    delivery: order.deliveryUf === null ? null : UF_NAMES[order.deliveryUf],
    production: order.productionDays === null ? null : `${productionText(order.productionDays, order.productionUnit)}, contados do pagamento da entrada`,
    notes: blankToNull(order.notes),
    items,
    hasDiscount,
    hasIpi,
    totals,
    units: order.items.reduce((total, item) => total + item.quantity, 0),
  };
}

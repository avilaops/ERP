import type { FiscalSettings, ProductFiscal } from "@/lib/db/fiscal";
import type { FiscalRules } from "@/lib/db/fiscal-rules";
import type { OrderDelivery } from "@/lib/db/order-delivery";
import type { Order } from "@/lib/db/orders";
import { cityCode } from "@/lib/fiscal/cities";
import { nfeProblems, nfeTotals } from "@/lib/fiscal/nfe";
import type { FreightMode, NfeInput, NfeTotals, NfeTransport } from "@/lib/fiscal/nfe";
import { roundCents } from "@/lib/pricing/money";
import type { PricingParams } from "@/lib/pricing/params";
import { UFS } from "@/lib/pricing/states";
import type { Uf } from "@/lib/pricing/states";

export type OrderNfeSource = {
  settings: FiscalSettings;
  rules: FiscalRules;
  order: Pick<Order, "number" | "customer" | "discount" | "taxpayer" | "deliveryUf" | "items" | "freight">;
  /** Name, code and table price of each equipment of the order, in the version of the order. */
  products: ReadonlyMap<number, { name: string; code: string | null; table: number }>;
  fiscal: ReadonlyMap<number, ProductFiscal>;
  /** The parameters of the version of the order: where the ICMS and the IPI come from. */
  params: Pick<PricingParams, "icmsSp" | "icmsInterstate" | "ipi" | "stateRates">;
  /** Down payment and installments as agreed, with the name of the form of each. */
  receipts: { method: string | null; amount: number }[];
  /** The code of the invoice (`tPag`) of each form of payment of the company, by its name. */
  paymentCodes: ReadonlyMap<string, string | null>;
  /** What was chosen for the invoice of this order, or `null`: then the suggestion holds. */
  freightMode: FreightMode | null;
  transport: NfeTransport;
  /** Where the goods go when it is not the customer's address, or `null`. */
  delivery: OrderDelivery | null;
  number: number;
  randomCode: string;
  issuedAt: string;
  software: string;
};

/** Freight paid by the company in the order is CIF; otherwise the customer hires it. A suggestion: the screen lets it be changed. */
export const suggestedFreightMode = (freight: number): FreightMode => (freight > 0 ? "0" : "1");

/**
 * The invoice of an order, as the layout takes it. What the registers do not
 * have yet goes blank, and `problems` says where each one is fixed: nothing is
 * invented to fill a hole.
 */
export function orderNfe(source: OrderNfeSource): { input: NfeInput; problems: string[]; totals: NfeTotals } {
  const { settings, rules, order, params } = source;
  const customer = order.customer;
  const issuerUf = settings.uf ?? "";
  const recipientUf = customer?.uf ?? "";
  const delivery = source.delivery;
  // The state the goods go to: it is what the layout takes for internal or interstate and for the DIFAL.
  const destination = (delivery?.uf ?? customer?.uf ?? null) as Uf | null;
  const interstate = issuerUf !== (destination ?? "");
  const registration = customer?.stateRegistration && /^\d+$/.test(customer.stateRegistration) ? customer.stateRegistration : null;

  const items = order.items.map((item) => {
    const product = source.products.get(item.productId);
    const fiscal = source.fiscal.get(item.productId);
    return {
      code: product?.code ?? String(item.productId),
      name: product?.name ?? "",
      ncm: fiscal?.ncm ?? "",
      cest: fiscal?.cest ?? null,
      origin: fiscal?.origin ?? -1,
      unit: fiscal?.unit ?? "UN",
      quantity: item.quantity,
      // Full precision: the layout takes ten decimals, and the total of the line is what gets rounded.
      unitPrice: (product?.table ?? 0) * (1 - order.discount),
      ipiRate: params.ipi,
    };
  });

  const rates = destination && (UFS as readonly string[]).includes(destination) ? params.stateRates[destination] : null;

  const input: NfeInput = {
    environment: settings.environment,
    freightMode: source.freightMode ?? suggestedFreightMode(source.order.freight),
    transport: source.transport,
    series: settings.series,
    number: source.number,
    randomCode: source.randomCode,
    issuedAt: source.issuedAt,
    issuer: {
      cnpj: settings.cnpj ?? "",
      legalName: settings.legalName ?? "",
      stateRegistration: settings.stateRegistration ?? "",
      taxRegime: settings.taxRegime ?? 3,
      street: settings.street ?? "",
      number: settings.streetNumber ?? "",
      district: settings.district ?? "",
      cityCode: settings.cityCode ?? cityCode(settings.city, settings.uf) ?? "",
      city: settings.city ?? "",
      uf: issuerUf,
      cep: settings.cep ?? "",
    },
    recipient: {
      kind: customer?.kind === "PF" ? "PF" : "PJ",
      document: customer?.document ?? "",
      name: customer?.name ?? "",
      stateRegistration: registration,
      taxpayer: order.taxpayer,
      street: customer?.street ?? "",
      number: customer?.streetNumber ?? "",
      complement: customer?.complement ?? null,
      district: customer?.district ?? "",
      cityCode: cityCode(customer?.city ?? null, customer?.uf ?? null) ?? "",
      city: customer?.city ?? "",
      uf: recipientUf,
      cep: customer?.cep ?? "",
      phone: customer?.phone ?? null,
      email: customer?.email ?? null,
    },
    delivery: delivery
      ? {
          kind: (delivery.document ?? customer?.document ?? "").length === 11 ? "PF" : "PJ",
          document: delivery.document ?? customer?.document ?? "",
          name: delivery.name,
          street: delivery.street,
          number: delivery.number,
          complement: delivery.complement,
          district: delivery.district,
          cityCode: cityCode(delivery.city, delivery.uf) ?? "",
          city: delivery.city,
          uf: delivery.uf,
          cep: delivery.cep,
          phone: delivery.phone,
        }
      : null,
    rules: {
      operationNature: rules.operationNature ?? "",
      cfopInternal: rules.cfopInternal ?? "",
      cfopInterstate: rules.cfopInterstate ?? "",
      cfopInterstateNonTaxpayer: rules.cfopInterstateNonTaxpayer ?? "",
      icmsCode: rules.icmsCode ?? "",
      ipiCst: rules.ipiCst,
      ipiFrameCode: rules.ipiFrameCode,
      pisCst: rules.pisCst ?? "",
      pisRate: rules.pisRate,
      cofinsCst: rules.cofinsCst ?? "",
      cofinsRate: rules.cofinsRate,
      finalConsumer: rules.finalConsumer,
      ipiInIcmsBase: rules.ipiInIcmsBase,
      additionalInfo: [rules.additionalInfo, `Pedido ${order.number}`].filter(Boolean).join(" - "),
      // Without the two codes the group is left out, and the invoice says so when the regime asks for it.
      ibsCbs: rules.ibsCbsCst && rules.ibsCbsClass ? { cst: rules.ibsCbsCst, classCode: rules.ibsCbsClass, ibsStateRate: rules.ibsStateRate, ibsCityRate: rules.ibsCityRate, cbsRate: rules.cbsRate } : null,
    },
    items,
    // Inside the state, its internal rate; to another, the outbound rate of the destination (7%, 12% or the general one).
    icmsRate: !interstate ? params.icmsSp : rates ? (rates.outboundIcms ?? params.icmsInterstate) : params.icmsInterstate,
    destination: rates ? { internalIcms: rates.internalIcms, fcp: rates.fcp } : { internalIcms: 0, fcp: 0 },
    payments: [],
    software: source.software,
  };

  // The forms of payment of the order, each with its code. The cents the invoice rounds differently go to the last one.
  const total = nfeTotals(input).invoice;
  const payments = source.receipts
    .filter((receipt) => receipt.amount > 0)
    .map((receipt) => {
      const code = receipt.method === null ? "" : (source.paymentCodes.get(receipt.method) ?? "");
      return { code, description: code === "99" ? receipt.method : null, amount: roundCents(receipt.amount) };
    });
  const paid = roundCents(payments.reduce((sum, payment) => sum + payment.amount, 0));
  const last = payments.at(-1);
  if (last && Math.abs(total - paid) <= 0.05 * Math.max(1, items.length)) last.amount = roundCents(last.amount + total - paid);
  input.payments = payments;

  const problems = nfeProblems(input);
  if (!customer) problems.unshift("Pedido sem cliente.");
  if (settings.taxRegime === null) problems.unshift("Empresa: regime tributário (Parâmetros → Fiscal).");
  // The state of delivery of the order formed its price: the invoice has to go to the same state.
  if (customer && order.deliveryUf && destination && order.deliveryUf !== destination) {
    problems.push(
      delivery
        ? `O local de entrega da nota é em ${destination} e o pedido foi fechado para entrega em ${order.deliveryUf}: corrija o local de entrega abaixo.`
        : `O pedido é para entrega em ${order.deliveryUf} e o cliente é de ${customer.uf}: informe o local de entrega abaixo.`,
    );
  }
  return { input, problems, totals: nfeTotals(input) };
}

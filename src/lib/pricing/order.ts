import { BAND_SLACK, RATE_EPSILON, roundCents } from "@/lib/pricing/money";
import type { PricingParams } from "@/lib/pricing/params";
import { requiredDownPayment } from "@/lib/pricing/payment";
import { chinaPayment } from "@/lib/pricing/product";
import type { MaxDiscounts } from "@/lib/pricing/table";
import { channelRate, saleTaxes } from "@/lib/pricing/taxes";
import type { Destination } from "@/lib/pricing/taxes";

export type OrderItem = {
  quantity: number;
  /** Table price of one unit, without IPI. */
  tableUnitPrice: number;
  unitRealCost: number;
  unitAdvisoryCost: number;
};

export type OrderInput = {
  items: OrderItem[];
  /** One discount for the whole order, as a fraction of the table price. */
  discount: number;
  destination: Destination;
  /** Freight paid by Ludus, in reais. */
  freight?: number;
};

/** One row of the items table. Values in reais, rounded to cents. */
export type OrderLine = {
  quantity: number;
  /** Table price of one unit, without IPI. */
  unitPrice: number;
  /** Discount on one unit. */
  unitDiscount: number;
  unitIpi: number;
  unitWithIpi: number;
  totalWithIpi: number;
};

/**
 * The order's figures. Values in reais, rounded to cents; rates are fractions.
 * Everything from `taxes` down is the "Só o diretor vê" board: it never goes
 * to the browser of anyone outside Diretoria.
 */
export type OrderQuote = {
  lines: OrderLine[];
  tableTotal: number;
  discount: number;
  /** Value without IPI: table total with the discount. */
  netSale: number;
  ipi: number;
  invoiceTotal: number;

  /** Channel + ICMS, as a rate of the value without IPI. */
  taxRate: number;
  taxes: number;
  difalRate: number;
  difal: number;
  equipmentCost: number;
  freight: number;
  profitBeforeIncomeTax: number;
  incomeTax: number;
  netProfit: number;
  /** Net profit over the value without IPI. */
  netProfitRate: number;

  chinaPayment: number;
  targetNetProfit: number;
  downPaymentCommission: number;
  requiredDownPayment: number;
  /** Required down payment over the invoice total. */
  requiredDownPaymentRate: number;
};

function checkOrder({ items, discount, freight = 0 }: OrderInput): void {
  if (items.length === 0) throw new Error("Pedido sem itens.");
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Quantidade do item precisa ser um inteiro maior que zero.");
    }
    if (!(item.tableUnitPrice > 0) || !(item.unitRealCost >= 0) || !(item.unitAdvisoryCost >= 0)) {
      throw new Error("Item com preço ou custo inválido.");
    }
  }
  checkDiscount(discount);
  if (!Number.isFinite(freight)) throw new Error("Frete precisa ser um valor em reais.");
  if (freight < 0) throw new Error("Frete não pode ser negativo.");
}

export function quoteOrder(order: OrderInput, params: PricingParams): OrderQuote {
  checkOrder(order);
  const { items, discount, destination, freight = 0 } = order;
  const sum = (value: (item: OrderItem) => number) =>
    items.reduce((total, item) => total + item.quantity * value(item), 0);

  const tableTotal = sum((item) => item.tableUnitPrice);
  const netSale = tableTotal * (1 - discount);
  const ipi = netSale * params.ipi;
  const invoiceTotal = netSale + ipi;

  const { icms, difal: difalRate } = saleTaxes(params, destination);
  const taxRate = channelRate(params) + icms;
  const taxes = netSale * taxRate;
  const difal = netSale * difalRate;
  const equipmentCost = sum((item) => item.unitRealCost);
  const profitBeforeIncomeTax = netSale - taxes - difal - equipmentCost - freight;
  const incomeTax = profitBeforeIncomeTax > 0 ? profitBeforeIncomeTax * params.incomeTax : 0;
  const netProfit = profitBeforeIncomeTax - incomeTax;

  const china = sum((item) => chinaPayment(item.unitAdvisoryCost, params));
  const targetNetProfit = netSale * params.targetNetProfit;
  const downPayment = requiredDownPayment({ chinaPayment: china, netSale }, params);

  const lines = items.map((item) => {
    const unitNet = item.tableUnitPrice * (1 - discount);
    const unitWithIpi = unitNet * (1 + params.ipi);
    return {
      quantity: item.quantity,
      unitPrice: roundCents(item.tableUnitPrice),
      unitDiscount: roundCents(item.tableUnitPrice * discount),
      unitIpi: roundCents(unitNet * params.ipi),
      unitWithIpi: roundCents(unitWithIpi),
      totalWithIpi: roundCents(unitWithIpi * item.quantity),
    };
  });

  return {
    lines,
    tableTotal: roundCents(tableTotal),
    discount,
    netSale: roundCents(netSale),
    ipi: roundCents(ipi),
    invoiceTotal: roundCents(invoiceTotal),
    taxRate,
    taxes: roundCents(taxes),
    difalRate,
    difal: roundCents(difal),
    equipmentCost: roundCents(equipmentCost),
    freight: roundCents(freight),
    profitBeforeIncomeTax: roundCents(profitBeforeIncomeTax),
    incomeTax: roundCents(incomeTax),
    netProfit: roundCents(netProfit),
    netProfitRate: netProfit / netSale,
    chinaPayment: roundCents(china),
    targetNetProfit: roundCents(targetNetProfit),
    downPaymentCommission: roundCents(downPayment - china - targetNetProfit),
    requiredDownPayment: roundCents(downPayment),
    requiredDownPaymentRate: downPayment / invoiceTotal,
  };
}

export type DiscountBand = "na-meta" | "abaixo-da-meta" | "prejuizo";

function checkDiscount(discount: number): void {
  if (!(discount >= 0 && discount < 1)) throw new Error("Desconto precisa ser de 0% até menos de 100%.");
}

export function discountBand(discount: number, max: MaxDiscounts): DiscountBand {
  checkDiscount(discount);
  if (discount <= max.atTarget + BAND_SLACK) return "na-meta";
  if (discount <= max.noLoss + BAND_SLACK) return "abaixo-da-meta";
  return "prejuizo";
}

export type ApprovalReason = "desconto-acima-do-livre" | "fora-da-meta" | "entrada-abaixo-da-politica";

export type PolicyCheck = {
  needsApproval: boolean;
  reasons: ApprovalReason[];
};

/** The strictest reading: any one of the three sends the order to approval. */
export function policyCheck(
  {
    discount,
    downPayment,
    invoiceTotal,
    band,
  }: { discount: number; downPayment: number; invoiceTotal: number; band: DiscountBand },
  params: PricingParams,
): PolicyCheck {
  checkDiscount(discount);
  const reasons: ApprovalReason[] = [];
  if (discount > params.freeDiscount + RATE_EPSILON) reasons.push("desconto-acima-do-livre");
  if (band !== "na-meta") reasons.push("fora-da-meta");
  if (roundCents(downPayment) < roundCents(params.minDownPayment * invoiceTotal)) {
    reasons.push("entrada-abaixo-da-politica");
  }
  return { needsApproval: reasons.length > 0, reasons };
}

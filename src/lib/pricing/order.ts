import { assertRate, BAND_SLACK, RATE_EPSILON, roundCents } from "@/lib/pricing/money";
import { validateParams } from "@/lib/pricing/params";
import type { PricingParams } from "@/lib/pricing/params";
import { requiredDownPayment } from "@/lib/pricing/payment";
import { chinaPayment } from "@/lib/pricing/product";
import { maxDiscounts } from "@/lib/pricing/table";
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

/** What the sale needs from an item: no cost. */
export type SaleItem = {
  quantity: number;
  /** Table price of one unit, without IPI. */
  tableUnitPrice: number;
};

export type SaleInput = {
  items: SaleItem[];
  /** One discount for the whole order, as a fraction of the table price. */
  discount: number;
};

/**
 * What the whole team sees of an order: items, discount, IPI and invoice total.
 * Values in reais, rounded to cents. Nothing here depends on cost.
 */
export type SaleQuote = {
  lines: OrderLine[];
  tableTotal: number;
  discount: number;
  /** Value without IPI: table total with the discount. */
  netSale: number;
  ipi: number;
  invoiceTotal: number;
};

/**
 * The "Só o diretor vê" board: taxes, cost, profit and the down payment the
 * order needs. It never goes to the browser of anyone outside Diretoria.
 */
export type DirectorQuote = {
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

/** The order's figures: what everyone sees, plus the directors' board. */
export type OrderQuote = SaleQuote & DirectorQuote;

function checkDiscount(discount: number): void {
  if (!(discount >= 0 && discount < 1)) throw new Error("Desconto precisa ser de 0% até menos de 100%.");
}

function checkSale({ items, discount }: SaleInput): void {
  if (items.length === 0) throw new Error("Pedido sem itens.");
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Quantidade do item precisa ser um inteiro maior que zero.");
    }
    if (!(item.tableUnitPrice > 0)) throw new Error("Item com preço ou custo inválido.");
  }
  checkDiscount(discount);
}

function checkOrder(order: OrderInput): void {
  checkSale(order);
  const { items, freight = 0 } = order;
  for (const item of items) {
    if (!(item.unitRealCost >= 0) || !(item.unitAdvisoryCost >= 0)) throw new Error("Item com preço ou custo inválido.");
  }
  if (!Number.isFinite(freight)) throw new Error("Frete precisa ser um valor em reais.");
  if (freight < 0) throw new Error("Frete não pode ser negativo.");
}

/** The sale in full precision: what both the team's summary and the directors' board start from. */
function saleFigures({ items, discount }: SaleInput, ipiRate: number) {
  const tableTotal = items.reduce((total, item) => total + item.quantity * item.tableUnitPrice, 0);
  const netSale = tableTotal * (1 - discount);
  const ipi = netSale * ipiRate;
  return { tableTotal, netSale, ipi, invoiceTotal: netSale + ipi };
}

/** The sale without any cost: the account the team sees. `ipi` is the rate of the version of the order. */
export function quoteSale(sale: SaleInput, { ipi: ipiRate }: Pick<PricingParams, "ipi">): SaleQuote {
  assertRate(ipiRate, "IPI");
  checkSale(sale);
  const { items, discount } = sale;
  const { tableTotal, netSale, ipi, invoiceTotal } = saleFigures(sale, ipiRate);

  const lines = items.map((item) => {
    const unitNet = item.tableUnitPrice * (1 - discount);
    const unitWithIpi = unitNet * (1 + ipiRate);
    return {
      quantity: item.quantity,
      unitPrice: roundCents(item.tableUnitPrice),
      unitDiscount: roundCents(item.tableUnitPrice * discount),
      unitIpi: roundCents(unitNet * ipiRate),
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
  };
}

export function quoteOrder(order: OrderInput, params: PricingParams): OrderQuote {
  validateParams(params);
  checkOrder(order);
  const { items, destination, freight = 0 } = order;
  const sum = (value: (item: OrderItem) => number) =>
    items.reduce((total, item) => total + item.quantity * value(item), 0);

  const { netSale, invoiceTotal } = saleFigures(order, params.ipi);

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

  return {
    ...quoteSale(order, params),
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

export function discountBand(discount: number, max: MaxDiscounts): DiscountBand {
  checkDiscount(discount);
  if (discount <= max.atTarget + BAND_SLACK) return "na-meta";
  if (discount <= max.noLoss + BAND_SLACK) return "abaixo-da-meta";
  return "prejuizo";
}

/**
 * Largest discounts of the whole order for its destination. The freight Ludus
 * pays counts as cost, so "na meta" here says the same as the net profit of
 * `quoteOrder` reaching the target.
 */
export function orderMaxDiscounts(order: OrderInput, params: PricingParams): MaxDiscounts {
  validateParams(params);
  checkOrder(order);
  const { items, destination, freight = 0 } = order;
  const tableTotal = items.reduce((total, item) => total + item.quantity * item.tableUnitPrice, 0);
  const cost = items.reduce((total, item) => total + item.quantity * item.unitRealCost, 0) + freight;
  return maxDiscounts({ tableTotal, cost }, params, destination);
}

/** Where the order's discount falls. */
export function orderBand(order: OrderInput, params: PricingParams): DiscountBand {
  return discountBand(order.discount, orderMaxDiscounts(order, params));
}

export type ApprovalReason = "desconto-acima-do-livre" | "fora-da-meta" | "entrada-abaixo-da-politica";

/**
 * Who may decide an order waiting for approval: the commercial manager while the
 * order still gives profit; at a loss, only the directors.
 */
export function needsDirector(band: DiscountBand): boolean {
  return band === "prejuizo";
}

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

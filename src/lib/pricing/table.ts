import { assertAmount, RATE_EPSILON } from "@/lib/pricing/money";
import { validateParams } from "@/lib/pricing/params";
import type { PricingParams } from "@/lib/pricing/params";
import { realCost } from "@/lib/pricing/product";
import type { ProductCost } from "@/lib/pricing/product";
import { ORIGIN_UF, UFS } from "@/lib/pricing/states";
import type { Uf } from "@/lib/pricing/states";
import { outboundIcms, preTaxProfit, totalRate, worstCase } from "@/lib/pricing/taxes";
import type { Destination } from "@/lib/pricing/taxes";

/** Share of the sale left to pay the equipment; never zero or negative. */
function costShare(rate: number, profit: number): number {
  const share = 1 - rate - profit;
  if (!(share > RATE_EPSILON)) {
    throw new Error("Parâmetros sem preço possível: impostos, taxas e lucro somam 100% da venda ou mais.");
  }
  return share;
}

/** Lowest price that still delivers the target, in the worst destination: cost × this. */
export function discountedMultiplier(params: PricingParams): number {
  return 1 / costShare(worstCase(params).rate, preTaxProfit(params));
}

/** Table price: the target survives the seller's free discount. */
export function tableMultiplier(params: PricingParams): number {
  return discountedMultiplier(params) / (1 - params.freeDiscount);
}

export function tablePrice(realCost: number, params: PricingParams): number {
  assertAmount(realCost, "Custo real");
  return realCost * tableMultiplier(params);
}

export function withIpi(value: number, params: PricingParams): number {
  return value * (1 + params.ipi);
}

export type MaxDiscounts = {
  /** Up to here the sale still delivers the target net profit. */
  atTarget: number;
  /** Up to here the sale does not lose money. */
  noLoss: number;
};

/**
 * Largest discounts for an item or a whole order going to one destination.
 * Negative means not even the full table price gets there.
 */
export function maxDiscounts(
  { tableTotal, cost }: { tableTotal: number; cost: number },
  params: PricingParams,
  destination: Destination,
): MaxDiscounts {
  if (!(Number.isFinite(tableTotal) && tableTotal > 0)) {
    throw new Error("Total de tabela precisa ser maior que zero.");
  }
  assertAmount(cost, "Custo");
  const rate = totalRate(params, destination);
  return {
    atTarget: 1 - cost / (tableTotal * costShare(rate, preTaxProfit(params))),
    noLoss: 1 - cost / (tableTotal * costShare(rate, 0)),
  };
}

export type ProductPrices = {
  /** Full precision: it is what the table price is made from. */
  realCost: number;
  /** Table price without IPI, full precision. */
  table: number;
  tableWithIpi: number;
  /** Largest discount that keeps the target in a sale inside SP. */
  maxSp: number;
  /** The same for a taxpayer customer outside SP. */
  maxTaxpayer: number;
};

// A taxpayer pays the interstate ICMS and no DIFAL, whatever the state: any one outside SP does.
const [OUTSIDE_UF] = UFS.filter((uf) => uf !== ORIGIN_UF);

/** The calculated columns of one product. `null` when there is no table price above zero. */
export function productPrices(cost: ProductCost, params: PricingParams): ProductPrices | null {
  const real = realCost(cost, params);
  const table = tablePrice(real, params);
  if (!(table > 0)) return null;

  const item = { tableTotal: table, cost: real };
  return {
    realCost: real,
    table,
    tableWithIpi: withIpi(table, params),
    maxSp: maxDiscounts(item, params, { uf: ORIGIN_UF, taxpayer: false }).atTarget,
    maxTaxpayer: maxDiscounts(item, params, { uf: OUTSIDE_UF, taxpayer: true }).atTarget,
  };
}

/** One destination of the board of limits: inside the origin state, a taxpayer outside it (by outbound rate), or a state without registration. */
export type DestinationLimit = {
  /** `SP`, `IE 7%`, `MA`… */
  label: string;
  /** Largest discount that keeps the target, never below zero. */
  atTarget: number;
  /** Largest discount without loss, never below zero. */
  noLoss: number;
};

/**
 * The largest discount by destination, for an order without freight or fixed
 * fee. The table price is the cost times one multiplier, so the limit is the
 * same for every equipment. First the origin state, then one line for each
 * outbound rate a taxpayer outside it may have, then every other state for a
 * customer without registration.
 */
export function limitsByDestination(params: PricingParams): { limits: DestinationLimit[]; keyOf: (destination: Destination) => string } {
  validateParams(params);
  const item = { tableTotal: tableMultiplier(params), cost: 1 };
  const limit = (label: string, destination: Destination): DestinationLimit => {
    const max = maxDiscounts(item, params, destination);
    return { label, atTarget: Math.max(0, max.atTarget), noLoss: Math.max(0, max.noLoss) };
  };
  const taxpayerLabel = (uf: Uf) => `IE ${(Math.round(outboundIcms(params, uf) * 1000) / 10).toString().replace(".", ",")}%`;
  const outside = UFS.filter((uf) => uf !== ORIGIN_UF);
  const taxpayers = new Map<string, Uf>();
  for (const uf of outside) if (!taxpayers.has(taxpayerLabel(uf))) taxpayers.set(taxpayerLabel(uf), uf);

  return {
    limits: [
      limit(ORIGIN_UF, { uf: ORIGIN_UF, taxpayer: false }),
      ...[...taxpayers].sort(([, a], [, b]) => outboundIcms(params, a) - outboundIcms(params, b)).map(([label, uf]) => limit(label, { uf, taxpayer: true })),
      ...outside.map((uf) => limit(uf, { uf, taxpayer: false })),
    ],
    keyOf: ({ uf, taxpayer }) => (uf === ORIGIN_UF ? ORIGIN_UF : taxpayer ? taxpayerLabel(uf) : uf),
  };
}

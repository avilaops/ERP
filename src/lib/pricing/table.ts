import { RATE_EPSILON } from "@/lib/pricing/money";
import type { PricingParams } from "@/lib/pricing/params";
import { preTaxProfit, totalRate, worstCase } from "@/lib/pricing/taxes";
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
  if (!(tableTotal > 0)) throw new Error("Total de tabela precisa ser maior que zero.");
  const rate = totalRate(params, destination);
  return {
    atTarget: 1 - cost / (tableTotal * costShare(rate, preTaxProfit(params))),
    noLoss: 1 - cost / (tableTotal * costShare(rate, 0)),
  };
}

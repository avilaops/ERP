import type { PricingParams } from "@/lib/pricing/params";

export type ProductCost = {
  /** Cost quoted by the import advisory, in reais. */
  advisoryCost: number;
  /** Tax credits on entry, as a fraction of the advisory cost. */
  taxCredit: number;
  /** Local packaging, in reais. Not an import cost, so it takes no safety margin. */
  packaging: number;
};

/** Advisory cost without the credits, plus the import safety margin, plus packaging. */
export function realCost({ advisoryCost, taxCredit, packaging }: ProductCost, params: PricingParams): number {
  return advisoryCost * (1 - taxCredit) * (1 + params.safetyMargin) + packaging;
}

/** What is paid in China for the equipment: the credits do not reduce it. */
export function chinaPayment(advisoryCost: number, params: PricingParams): number {
  return advisoryCost * (1 + params.safetyMargin);
}

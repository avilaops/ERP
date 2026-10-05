import type { PricingParams } from "@/lib/pricing/params";
import { requiredDownPayment } from "@/lib/pricing/payment";
import { chinaPayment, realCost } from "@/lib/pricing/product";
import type { ProductCost } from "@/lib/pricing/product";
import { discountedMultiplier, tableMultiplier, tablePrice, withIpi } from "@/lib/pricing/table";
import { preTaxProfit, worstCase } from "@/lib/pricing/taxes";
import type { WorstCase } from "@/lib/pricing/taxes";

/**
 * Monthly revenue without IPI at which what is left before income tax pays
 * the fixed expenses, selling at the worst destination with the whole free
 * discount: the most conservative reading.
 */
export function breakEvenRevenue(params: PricingParams): number {
  return params.fixedMonthlyExpenses / preTaxProfit(params);
}

/** The suggestion moves in steps of 5 percentage points. */
const DOWN_PAYMENT_STEPS = 20;
/** So that an exact 65.0% does not become 70%. */
const STEP_SLACK = 1e-9;

export type SuggestedDownPayment = {
  /** Suggested policy: `exactRate` rounded up to the next 5 percentage points. */
  rate: number;
  /** Down payment the worst product needs, over its price with IPI. */
  exactRate: number;
  /** Position of the worst product in the list received. */
  worstIndex: number;
};

/**
 * Down payment that covers China, the target profit and the commission for the
 * worst product, sold with the whole free discount. `null` without products.
 */
export function suggestedDownPayment(products: ProductCost[], params: PricingParams): SuggestedDownPayment | null {
  let worst: { exactRate: number; worstIndex: number } | null = null;
  products.forEach((product, index) => {
    const netSale = tablePrice(realCost(product, params), params) * (1 - params.freeDiscount);
    if (!(netSale > 0)) return;
    const downPayment = requiredDownPayment(
      { chinaPayment: chinaPayment(product.advisoryCost, params), netSale },
      params,
    );
    const exactRate = downPayment / withIpi(netSale, params);
    if (!worst || exactRate > worst.exactRate) worst = { exactRate, worstIndex: index };
  });
  if (!worst) return null;
  const { exactRate, worstIndex } = worst as { exactRate: number; worstIndex: number };
  return {
    rate: Math.ceil(exactRate * DOWN_PAYMENT_STEPS - STEP_SLACK) / DOWN_PAYMENT_STEPS,
    exactRate,
    worstIndex,
  };
}

/** The Resultado board of the Parâmetros screen. Rates are fractions, money has full precision. */
export type ParamsResult = {
  /** Preço de tabela = custo × this. */
  tableMultiplier: number;
  /** The multiplier as a markup over the cost (3.123 is 212.3%). */
  markup: number;
  worstDestination: WorstCase;
  /** ICMS + DIFAL of the worst destination. */
  worstIcmsAndDifal: number;
  /** Impostos e taxas no pior caso. */
  worstRate: number;
  /** Lucro antes do IR necessário. */
  preTaxProfit: number;
  /** Venda com desconto = custo × this. */
  discountedMultiplier: number;
  fixedMonthlyExpenses: number;
  breakEvenRevenue: number;
  suggestedDownPayment: SuggestedDownPayment | null;
};

export function paramsResult(params: PricingParams, products: ProductCost[]): ParamsResult {
  const worst = worstCase(params);
  const multiplier = tableMultiplier(params);
  return {
    tableMultiplier: multiplier,
    markup: multiplier - 1,
    worstDestination: worst,
    worstIcmsAndDifal: worst.icms + worst.difal,
    worstRate: worst.rate,
    preTaxProfit: preTaxProfit(params),
    discountedMultiplier: discountedMultiplier(params),
    fixedMonthlyExpenses: params.fixedMonthlyExpenses,
    breakEvenRevenue: breakEvenRevenue(params),
    suggestedDownPayment: suggestedDownPayment(products, params),
  };
}

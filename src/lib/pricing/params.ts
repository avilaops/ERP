import { DEFAULT_STATE_RATES, UFS } from "@/lib/pricing/states";
import type { StateRates } from "@/lib/pricing/states";

/**
 * The commercial policy, the sale taxes and the channel costs that form the
 * table price: the fields that are one number each. Rates are fractions (0.15 = 15%).
 */
export type ScalarParams = {
  /** Lucro líquido que quero em cada venda. */
  targetNetProfit: number;
  /** Desconto livre do vendedor. */
  freeDiscount: number;
  /** Margem de segurança da importação. */
  safetyMargin: number;
  /** Entrada mínima pedida ao cliente. */
  minDownPayment: number;
  /** Validade da proposta, in days. */
  proposalValidityDays: number;
  /** ICMS dentro de SP. */
  icmsSp: number;
  /** PIS + COFINS. */
  pisCofins: number;
  /** IPI destacado na nota. */
  ipi: number;
  /** IRPJ + CSLL sobre o lucro. */
  incomeTax: number;
  /** Comissão. */
  commission: number;
  /** Anúncios / Ads. */
  ads: number;
  /** Gateway e antecipação. */
  gateway: number;
  /** ICMS interestadual (importado com FCI). */
  icmsInterstate: number;
  /**
   * Sale cost the manual does not list. The prototype charges 18.25% on an
   * interstate sale and the documented rates add up to 15.75%; with this one
   * every figure in the screenshots matches.
   */
  otherSalesRate: number;
  /** Provisão para perdas, over the value without IPI. */
  lossProvision: number;
  /** Provisão para garantia. */
  warrantyProvision: number;
  /** Provisão para inadimplência. */
  defaultProvision: number;
  /** Taxa fixa por pedido, in reais: leaves the order together with the freight. */
  fixedFeePerOrder: number;
  /** Despesas fixas por mês, in reais. */
  fixedMonthlyExpenses: number;
};

/**
 * Everything the engine calculates with. Nothing about taxes is fixed in the
 * code: the rates of each state come here too, from the database.
 */
export type PricingParams = ScalarParams & {
  /** Internal ICMS and FCP of each of the 27 states. */
  stateRates: StateRates;
};

/** Current values of the prototype (docs/manual/paginas/16-parametros.md). Only the gabarito of the tests. */
export const DEFAULT_PARAMS: PricingParams = {
  targetNetProfit: 0.15,
  freeDiscount: 0.2,
  safetyMargin: 0.05,
  minDownPayment: 0.65,
  proposalValidityDays: 7,
  icmsSp: 0.18,
  pisCofins: 0.0925,
  ipi: 0.13,
  incomeTax: 0.34,
  commission: 0.02,
  ads: 0.005,
  gateway: 0,
  icmsInterstate: 0.04,
  otherSalesRate: 0.025,
  lossProvision: 0,
  warrantyProvision: 0,
  defaultProvision: 0,
  fixedFeePerOrder: 0,
  fixedMonthlyExpenses: 0,
  stateRates: DEFAULT_STATE_RATES,
};

/** Screen label of every rate: also the order the form shows them in. */
export const RATE_LABELS: Record<
  Exclude<keyof ScalarParams, "proposalValidityDays" | "fixedMonthlyExpenses" | "fixedFeePerOrder">,
  string
> = {
  targetNetProfit: "Lucro líquido que quero em cada venda",
  freeDiscount: "Desconto livre do vendedor",
  safetyMargin: "Margem de segurança da importação",
  minDownPayment: "Entrada mínima pedida ao cliente",
  icmsSp: "ICMS dentro de SP",
  pisCofins: "PIS + COFINS",
  ipi: "IPI destacado na nota",
  incomeTax: "IRPJ + CSLL sobre o lucro",
  commission: "Comissão",
  ads: "Anúncios / Ads",
  gateway: "Gateway e antecipação",
  icmsInterstate: "ICMS interestadual",
  otherSalesRate: "Outras taxas da venda",
  lossProvision: "Provisão para perdas",
  warrantyProvision: "Provisão para garantia",
  defaultProvision: "Provisão para inadimplência",
};

export type RateKey = keyof typeof RATE_LABELS;

/**
 * Throws when a rate is outside [0, 1), the validity is not a positive whole
 * number of days, the fixed expenses are not an amount in reais, or a state has
 * no rate.
 */
export function validateParams(params: PricingParams): void {
  for (const key of Object.keys(RATE_LABELS) as RateKey[]) {
    const rate = params[key];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate >= 1) {
      throw new Error(`Parâmetro inválido: "${RATE_LABELS[key]}" precisa ser uma taxa de 0% até menos de 100%.`);
    }
  }
  if (!Number.isInteger(params.proposalValidityDays) || params.proposalValidityDays <= 0) {
    throw new Error('Parâmetro inválido: "Validade da proposta" precisa ser um número inteiro de dias, maior que zero.');
  }
  const isRate = (rate: unknown) => typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate < 1;
  for (const uf of UFS) {
    const state = params.stateRates?.[uf];
    if (!state) throw new Error(`Parâmetro inválido: falta a alíquota do estado ${uf}.`);
    if (!isRate(state.internalIcms)) {
      throw new Error(`Parâmetro inválido: "ICMS interno de ${uf}" precisa ser uma taxa de 0% até menos de 100%.`);
    }
    if (!isRate(state.fcp)) {
      throw new Error(`Parâmetro inválido: "FCP de ${uf}" precisa ser uma taxa de 0% até menos de 100%.`);
    }
  }
  const expenses = params.fixedMonthlyExpenses;
  if (typeof expenses !== "number" || !Number.isFinite(expenses) || expenses < 0) {
    throw new Error('Parâmetro inválido: "Despesas fixas por mês" precisa ser um valor em reais, zero ou mais.');
  }
  const fee = params.fixedFeePerOrder;
  if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0) {
    throw new Error('Parâmetro inválido: "Taxa fixa por pedido" precisa ser um valor em reais, zero ou mais.');
  }
}

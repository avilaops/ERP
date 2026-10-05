/**
 * The commercial policy, the sale taxes and the channel costs that form the
 * table price. Rates are fractions (0.15 = 15%).
 */
export type PricingParams = {
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
};

/** Current values of the prototype (docs/manual/paginas/16-parametros.md). */
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
};

const RATE_LABELS: Record<Exclude<keyof PricingParams, "proposalValidityDays">, string> = {
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
};

/** Throws when a rate is outside [0, 1) or the validity is not a positive whole number of days. */
export function validateParams(params: PricingParams): void {
  for (const key of Object.keys(RATE_LABELS) as (keyof typeof RATE_LABELS)[]) {
    const rate = params[key];
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate >= 1) {
      throw new Error(`Parâmetro inválido: "${RATE_LABELS[key]}" precisa ser uma taxa de 0% até menos de 100%.`);
    }
  }
  if (!Number.isInteger(params.proposalValidityDays) || params.proposalValidityDays <= 0) {
    throw new Error('Parâmetro inválido: "Validade da proposta" precisa ser um número inteiro de dias, maior que zero.');
  }
}

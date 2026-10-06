import type { PricingParams } from "@/lib/pricing/params";
import { ORIGIN_UF, UFS } from "@/lib/pricing/states";
import type { Uf } from "@/lib/pricing/states";

export type Destination = {
  uf: Uf;
  /** Customer is an ICMS taxpayer (has an active state registration). */
  taxpayer: boolean;
};

export type SaleTaxes = {
  icms: number;
  /**
   * Only when it stays with Ludus: outside SP, non-taxpayer customer. It is what
   * the state's internal rate has above the interstate one, plus the state's FCP.
   */
  difal: number;
};

export function saleTaxes(params: PricingParams, destination: Destination): SaleTaxes {
  if (!UFS.includes(destination.uf)) throw new Error(`UF de destino inválida: "${destination.uf}".`);
  if (destination.uf === ORIGIN_UF) return { icms: params.icmsSp, difal: 0 };
  const icms = params.icmsInterstate;
  if (destination.taxpayer) return { icms, difal: 0 };
  const state = params.stateRates[destination.uf];
  return { icms, difal: Math.max(0, state.internalIcms - icms) + state.fcp };
}

/** What every sale pays over the value without IPI, whatever the destination. */
export function channelRate(params: PricingParams): number {
  const provisions = params.lossProvision + params.warrantyProvision + params.defaultProvision;
  return params.pisCofins + params.commission + params.ads + params.gateway + params.otherSalesRate + provisions;
}

/** Channel + ICMS + DIFAL of one destination. */
export function totalRate(params: PricingParams, destination: Destination): number {
  const { icms, difal } = saleTaxes(params, destination);
  return channelRate(params) + icms + difal;
}

/** Profit before income tax that leaves the target net profit after it. */
export function preTaxProfit(params: PricingParams): number {
  return params.targetNetProfit / (1 - params.incomeTax);
}

export type WorstCase = Destination & SaleTaxes & {
  /** Channel + ICMS + DIFAL. */
  rate: number;
};

/** The most expensive destination: the table is priced for it. */
export function worstCase(params: PricingParams): WorstCase {
  let worst: WorstCase | null = null;
  for (const uf of UFS) {
    for (const taxpayer of [false, true]) {
      const taxes = saleTaxes(params, { uf, taxpayer });
      const rate = channelRate(params) + taxes.icms + taxes.difal;
      if (!worst || rate > worst.rate) worst = { uf, taxpayer, ...taxes, rate };
    }
  }
  return worst as WorstCase;
}

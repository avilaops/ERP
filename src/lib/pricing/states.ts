export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
  "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export type Uf = (typeof UFS)[number];

/** State the goods leave from. */
export const ORIGIN_UF: Uf = "SP";

/** What the sale to one state costs in taxes at the destination. Rates are fractions. */
export type StateRate = {
  /** Internal ICMS rate of the state: the DIFAL is what it has above the interstate rate. */
  internalIcms: number;
  /** Fundo de Combate à Pobreza of the state, paid together with the DIFAL. */
  fcp: number;
};

export type StateRates = Record<Uf, StateRate>;

/**
 * The initial table, and the one the engine's tests are checked against. It is
 * NOT what the system calculates with: the rates live in the database, where the
 * directors change them in Parâmetros, and reach the engine inside the
 * parameters. The prototype only shows MA (23%, the highest) and SP (18%); the
 * others are provisional, to be confirmed with Ludus' accountant. No FCP yet.
 */
export const DEFAULT_STATE_RATES: StateRates = {
  AC: { internalIcms: 0.19, fcp: 0 },
  AL: { internalIcms: 0.19, fcp: 0 },
  AM: { internalIcms: 0.2, fcp: 0 },
  AP: { internalIcms: 0.18, fcp: 0 },
  BA: { internalIcms: 0.205, fcp: 0 },
  CE: { internalIcms: 0.2, fcp: 0 },
  DF: { internalIcms: 0.2, fcp: 0 },
  ES: { internalIcms: 0.17, fcp: 0 },
  GO: { internalIcms: 0.19, fcp: 0 },
  MA: { internalIcms: 0.23, fcp: 0 },
  MG: { internalIcms: 0.18, fcp: 0 },
  MS: { internalIcms: 0.17, fcp: 0 },
  MT: { internalIcms: 0.17, fcp: 0 },
  PA: { internalIcms: 0.19, fcp: 0 },
  PB: { internalIcms: 0.2, fcp: 0 },
  PE: { internalIcms: 0.205, fcp: 0 },
  PI: { internalIcms: 0.225, fcp: 0 },
  PR: { internalIcms: 0.195, fcp: 0 },
  RJ: { internalIcms: 0.22, fcp: 0 },
  RN: { internalIcms: 0.2, fcp: 0 },
  RO: { internalIcms: 0.195, fcp: 0 },
  RR: { internalIcms: 0.2, fcp: 0 },
  RS: { internalIcms: 0.17, fcp: 0 },
  SC: { internalIcms: 0.17, fcp: 0 },
  SE: { internalIcms: 0.19, fcp: 0 },
  SP: { internalIcms: 0.18, fcp: 0 },
  TO: { internalIcms: 0.2, fcp: 0 },
};

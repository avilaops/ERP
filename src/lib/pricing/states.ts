export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
  "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export type Uf = (typeof UFS)[number];

/** State the goods leave from. */
export const ORIGIN_UF: Uf = "SP";

/**
 * Internal ICMS rate of each state, used for the DIFAL. The prototype only
 * shows MA (23%, the highest) and SP (18%); the others are to be confirmed
 * with Ludus' accountant in the fiscal phase of the roadmap.
 */
export const INTERNAL_ICMS: Record<Uf, number> = {
  AC: 0.19,
  AL: 0.19,
  AM: 0.2,
  AP: 0.18,
  BA: 0.205,
  CE: 0.2,
  DF: 0.2,
  ES: 0.17,
  GO: 0.19,
  MA: 0.23,
  MG: 0.18,
  MS: 0.17,
  MT: 0.17,
  PA: 0.19,
  PB: 0.2,
  PE: 0.205,
  PI: 0.225,
  PR: 0.195,
  RJ: 0.22,
  RN: 0.2,
  RO: 0.195,
  RR: 0.2,
  RS: 0.17,
  SC: 0.17,
  SE: 0.19,
  SP: 0.18,
  TO: 0.2,
};

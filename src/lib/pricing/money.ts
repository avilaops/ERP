/**
 * Money is a plain number in reais. Every calculation keeps full precision and
 * only what leaves the engine is rounded, with this function.
 */

/** Rounds to cents, half away from zero (1.005 becomes 1.01, as on paper). */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("Valor em reais inválido.");
  // toPrecision removes the binary noise (1.005 * 100 = 100.49999999999999).
  const cents = Math.round(Number((Math.abs(value) * 100).toPrecision(15)));
  return (Math.sign(value) * cents) / 100 || 0;
}

/** Slack for comparing rates that come out of a division. */
export const RATE_EPSILON = 1e-9;

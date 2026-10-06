import { assertAmount } from "@/lib/pricing/money";
import type { PricingParams } from "@/lib/pricing/params";
import { formatDate, parseDate } from "@/lib/pricing/payment";

/** What was received from the customer, without the IPI. */
export function commissionBase(received: number, params: Pick<PricingParams, "ipi">): number {
  assertAmount(received, "Valor recebido");
  return received / (1 + params.ipi);
}

/** Commission on an amount actually received: it is born when the receipt is settled. */
export function commissionOn(received: number, params: Pick<PricingParams, "ipi" | "commission">): number {
  return commissionBase(received, params) * params.commission;
}

/** The month a receipt counts in, as its first day: `2026-10-28` → `2026-10-01`. */
export function commissionCompetence(receivedOn: string): string {
  const received = new Date(parseDate(receivedOn));
  return formatDate(Date.UTC(received.getUTCFullYear(), received.getUTCMonth(), 1));
}

/** Everything received in a month is paid on the 5th of the next one. */
export function commissionPaymentDate(receivedOn: string): string {
  const received = new Date(parseDate(receivedOn));
  return formatDate(Date.UTC(received.getUTCFullYear(), received.getUTCMonth() + 1, 5));
}

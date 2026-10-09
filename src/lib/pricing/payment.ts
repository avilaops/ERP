import { assertAmount, roundCents } from "@/lib/pricing/money";
import type { PricingParams } from "@/lib/pricing/params";

/**
 * Down payment that covers China, the target net profit and the seller's
 * commission on the down payment itself. The commission is on the value
 * without IPI, hence the divisor.
 */
export function requiredDownPayment(
  { chinaPayment, netSale }: { chinaPayment: number; netSale: number },
  params: PricingParams,
): number {
  assertAmount(chinaPayment, "Pagamento na China");
  assertAmount(netSale, "Venda sem IPI");
  return (chinaPayment + netSale * params.targetNetProfit) / (1 - params.commission / (1 + params.ipi));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` to milliseconds in UTC, so the server time zone never matters. */
export function parseDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const ms = Date.UTC(year, month - 1, day);
    const parsed = new Date(ms);
    if (parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) {
      return ms;
    }
  }
  throw new Error(`Data inválida: "${date}". Use AAAA-MM-DD.`);
}

export function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Calendar days added to an `AAAA-MM-DD` date. */
export function addDays(date: string, days: number): string {
  if (!Number.isInteger(days)) throw new Error("Quantidade de dias precisa ser um número inteiro.");
  return formatDate(parseDate(date) + days * DAY_MS);
}

/**
 * Days from Monday to Friday added to an `AAAA-MM-DD` date. Counting from a
 * weekend is counting from the Friday before it: the first working day is the
 * Monday. Holidays are not taken out: the result is an estimate.
 */
export function addBusinessDays(date: string, days: number): string {
  if (!Number.isInteger(days) || days < 0) throw new Error("Quantidade de dias úteis precisa ser um número inteiro, zero ou mais.");
  let ms = parseDate(date);
  if (days === 0) return formatDate(ms);
  const weekday = () => new Date(ms).getUTCDay();
  while (weekday() === 0 || weekday() === 6) ms -= DAY_MS;
  // Whole weeks at once, then the days left one by one.
  ms += Math.floor(days / 5) * 7 * DAY_MS;
  for (let left = days % 5; left > 0; ) {
    ms += DAY_MS;
    if (weekday() !== 0 && weekday() !== 6) left -= 1;
  }
  return formatDate(ms);
}

export type Installment = {
  number: number;
  amount: number;
  dueDate: string;
};

/** Splits the balance in cents; what does not divide goes on the last installment. */
export function installments({
  balance,
  count,
  firstInDays,
  intervalDays,
  from,
}: {
  balance: number;
  count: number;
  firstInDays: number;
  intervalDays: number;
  from: string;
}): Installment[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("Número de parcelas precisa ser um inteiro maior que zero.");
  }
  if (!Number.isInteger(firstInDays) || firstInDays < 0 || !Number.isInteger(intervalDays) || intervalDays < 0) {
    throw new Error("Prazos das parcelas precisam ser dias inteiros, sem valor negativo.");
  }
  if (!Number.isFinite(balance)) throw new Error("Saldo a parcelar precisa ser um valor em reais.");
  if (balance < 0) throw new Error("Saldo a parcelar não pode ser negativo.");

  const totalCents = Math.round(roundCents(balance) * 100);
  const eachCents = Math.floor(totalCents / count);
  const lastCents = totalCents - eachCents * (count - 1);

  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    amount: (index === count - 1 ? lastCents : eachCents) / 100,
    dueDate: addDays(from, firstInDays + index * intervalDays),
  }));
}

/** A down payment given as a share of the invoice total, in cents. */
export function downPaymentFromRate(rate: number, invoiceTotal: number): number {
  if (!(rate >= 0 && rate <= 1)) throw new Error("Entrada em percentual precisa ser de 0% a 100%.");
  assertAmount(invoiceTotal, "Total da nota");
  return roundCents(rate * invoiceTotal);
}

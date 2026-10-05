/** Without the characters that are mistaken for one another when read aloud: I, O, 0, 1. */
export const ORDER_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** `260930-BBMN`. The screen shows it with `#` in front. */
export const ORDER_NUMBER = /^\d{6}-[A-Z0-9]{4}$/;

/**
 * A new order number: `AAMMDD-` and four characters. The date is the day in São
 * Paulo (`AAAA-MM-DD`) and `pick(max)` draws a whole number from 0 to `max - 1`;
 * both come as arguments, so nothing here reads the clock or the dice.
 */
export function orderNumber(date: string, pick: (max: number) => number): string {
  const match = /^\d{2}(\d{2})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Data inválida: "${date}". Use AAAA-MM-DD.`);
  const suffix = Array.from({ length: 4 }, () => ORDER_NUMBER_ALPHABET[pick(ORDER_NUMBER_ALPHABET.length)]).join("");
  if (!/^[A-Z0-9]{4}$/.test(suffix)) throw new Error("Sorteio do número do pedido fora do alfabeto.");
  return `${match[1]}${match[2]}${match[3]}-${suffix}`;
}

/**
 * A value in reais written out, as contracts carry it after the figure:
 * `21334.57` → `vinte e um mil trezentos e trinta e quatro reais e cinquenta e sete centavos`.
 */
const UNITS = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** 1 to 999. */
function group(value: number): string {
  if (value === 100) return "cem";
  const parts: string[] = [];
  if (value >= 100) parts.push(HUNDREDS[Math.floor(value / 100)]);
  const rest = value % 100;
  if (rest >= 20) parts.push(rest % 10 === 0 ? TENS[Math.floor(rest / 10)] : `${TENS[Math.floor(rest / 10)]} e ${UNITS[rest % 10]}`);
  else if (rest > 0) parts.push(UNITS[rest]);
  return parts.join(" e ");
}

/** A whole number from 0 to 999.999.999.999, in words. */
export function numberInWords(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0 || value > 999_999_999_999) throw new Error(`Número fora do que se escreve por extenso: ${value}`);
  if (value === 0) return "zero";
  const scales: [size: number, one: string, many: string][] = [[1_000_000_000, "bilhão", "bilhões"], [1_000_000, "milhão", "milhões"], [1_000, "mil", "mil"], [1, "", ""]];
  const groups: { amount: number; text: string }[] = [];
  let left = value;
  for (const [size, one, many] of scales) {
    const amount = Math.floor(left / size);
    left %= size;
    if (amount === 0) continue;
    // "mil", never "um mil".
    const words = size === 1_000 && amount === 1 ? "mil" : `${group(amount)}${size === 1 ? "" : ` ${amount === 1 ? one : many}`}`;
    groups.push({ amount, text: words });
  }
  // The last group is joined by "e" when it is below a hundred or a round hundred: "mil e cinco", "dois mil e quinhentos", "mil duzentos e dez".
  return groups.reduce((whole, part, index) => {
    if (index === 0) return part.text;
    const last = index === groups.length - 1;
    return `${whole}${last && (part.amount < 100 || part.amount % 100 === 0) ? " e " : " "}${part.text}`;
  }, "");
}

/** An amount of money in words, with reais and centavos. */
export function moneyInWords(value: number): string {
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`Valor fora do que se escreve por extenso: ${value}`);
  const reais = Math.floor(cents / 100);
  const rest = cents % 100;
  // "um milhão de reais": the round million takes "de".
  const round = reais >= 1_000_000 && reais % 1_000_000 === 0;
  const whole = reais === 0 ? "" : `${numberInWords(reais)} ${reais === 1 ? "real" : round ? "de reais" : "reais"}`;
  const fraction = rest === 0 ? "" : `${numberInWords(rest)} ${rest === 1 ? "centavo" : "centavos"}`;
  if (whole === "" && fraction === "") return "zero real";
  return [whole, fraction].filter(Boolean).join(" e ");
}

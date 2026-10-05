import type { Uf } from "@/lib/pricing/states";

/** First and last five-digit prefix of each range of CEPs, and its state. */
const RANGES: [number, number, Uf][] = [
  [1000, 19999, "SP"],
  [20000, 28999, "RJ"],
  [29000, 29999, "ES"],
  [30000, 39999, "MG"],
  [40000, 48999, "BA"],
  [49000, 49999, "SE"],
  [50000, 56999, "PE"],
  [57000, 57999, "AL"],
  [58000, 58999, "PB"],
  [59000, 59999, "RN"],
  [60000, 63999, "CE"],
  [64000, 64999, "PI"],
  [65000, 65999, "MA"],
  [66000, 68899, "PA"],
  [68900, 68999, "AP"],
  [69000, 69299, "AM"],
  [69300, 69399, "RR"],
  [69400, 69899, "AM"],
  [69900, 69999, "AC"],
  [70000, 72799, "DF"],
  [72800, 72999, "GO"],
  [73000, 73699, "DF"],
  [73700, 76799, "GO"],
  [76800, 76999, "RO"],
  [77000, 77999, "TO"],
  [78000, 78899, "MT"],
  [79000, 79999, "MS"],
  [80000, 87999, "PR"],
  [88000, 89999, "SC"],
  [90000, 99999, "RS"],
];

/** `"99999-999"` → `"99999999"`. `null` unless it has exactly eight digits, with or without the hyphen. */
export function normalizeCep(text: string): string | null {
  const clean = text.trim();
  return /^\d{5}-?\d{3}$/.test(clean) ? clean.replace("-", "") : null;
}

/**
 * The state of a CEP, by its range, without the network. Like the prototype, it
 * only finds the state: street, district and city are typed. `null` when the CEP
 * is malformed or outside every range.
 */
export function ufFromCep(cep: string): Uf | null {
  const digits = normalizeCep(cep);
  if (digits === null) return null;
  const prefix = Number(digits.slice(0, 5));
  return RANGES.find(([first, last]) => prefix >= first && prefix <= last)?.[2] ?? null;
}

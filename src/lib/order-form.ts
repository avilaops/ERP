import type { OrderTerms } from "@/lib/db/orders";
import { parseDays, parseMoney, parsePercent } from "@/lib/format";
import type { DiscountBand } from "@/lib/pricing/order";
import { UFS } from "@/lib/pricing/states";
import type { Uf } from "@/lib/pricing/states";

/** What an action of the order answers to its form. */
export type ActionState = { error: string | null };

export const IDLE_ACTION: ActionState = { error: null };

export type TermsField = "discount" | "deliveryUf" | "taxpayer" | "productionDays" | "freight" | "notes";

export type ParsedTerms = { ok: true; terms: OrderTerms } | { ok: false; errors: string[] };

/**
 * Reads "Entrega e condições" and the discount. Blank freight is zero (the
 * customer pays or collects), blank production time and blank state are "not
 * informed yet". `read` returns the raw text of a field (`null` when absent).
 */
export function parseOrderTerms(read: (key: TermsField) => string | null): ParsedTerms {
  const errors: string[] = [];
  const text = (key: TermsField) => (read(key) ?? "").trim();

  const discount = text("discount") === "" ? 0 : parsePercent(text("discount").replace(/\s*%$/, ""));
  if (discount === null) errors.push('"Desconto": informe um percentual de 0 até menos de 100 (ex.: 12,5).');

  const typedUf = text("deliveryUf").toUpperCase();
  const deliveryUf = (UFS as readonly string[]).includes(typedUf) ? (typedUf as Uf) : null;
  if (typedUf !== "" && deliveryUf === null) errors.push('"Estado de entrega": escolha um estado da lista.');

  const productionDays = text("productionDays") === "" ? null : parseDays(text("productionDays"));
  if (text("productionDays") !== "" && productionDays === null) {
    errors.push('"Prazo de fabricação": informe um número inteiro de dias, maior que zero.');
  }

  const freight = text("freight") === "" ? 0 : parseMoney(text("freight"));
  if (freight === null) errors.push('"Frete por nossa conta": informe um valor em reais, zero ou mais (ex.: 1.234,56).');

  if (errors.length > 0 || discount === null || freight === null) return { ok: false, errors };
  return {
    ok: true,
    terms: { discount, deliveryUf, taxpayer: text("taxpayer") === "sim", productionDays, freight, notes: text("notes") || null },
  };
}

/** `"3"` → `3`. `null` unless it is a whole number greater than zero. */
export const parseQuantity = (text: string | null) => parseDays(text ?? "");

export const STATUS_LABELS = {
  em_negociacao: "Em negociação",
  aguardando_aprovacao: "Aguardando aprovação",
  fechado: "Fechado",
  perdido: "Perdido",
  cancelado: "Cancelado",
} as const;

/** The name of each band and the sentence of the manual. No limit and no profit here: those are the directors'. */
export const BAND_TEXT: Record<DiscountBand, { label: string; text: string }> = {
  "na-meta": { label: "Na meta", text: "O lucro líquido do pedido fica igual ou acima da meta." },
  "abaixo-da-meta": { label: "Abaixo da meta", text: "O pedido dá lucro, mas abaixo da meta. Precisa de aprovação." },
  prejuizo: { label: "Prejuízo", text: "O desconto passa do ponto sem lucro." },
};

/** The full name of each state, for the list of "Estado de entrega". */
export const UF_NAMES: Record<Uf, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso",
  PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina",
  SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};

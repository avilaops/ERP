import type { OrderPayment, OrderTerms } from "@/lib/db/orders";
import { parseDays, parseMoney, parsePercent } from "@/lib/format";
import type { ApprovalReason, DiscountBand } from "@/lib/pricing/order";
import { UFS } from "@/lib/pricing/states";
import type { Uf } from "@/lib/pricing/states";

/** What an action of the order answers to its form. */
export type ActionState = { error: string | null; /** What went through and is worth saying: "mensagem enviada para…". */ notice?: string | null };

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

export type PaymentField =
  | "downPayment"
  | "downPaymentMethod"
  | "downPaymentDate"
  | "balanceMethod"
  | "installmentCount"
  | "firstInstallmentDays"
  | "installmentIntervalDays"
  | "paymentNotes";

export type ParsedPayment = { ok: true; payment: OrderPayment } | { ok: false; errors: string[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WHOLE = /^\d{1,4}$/;

/**
 * Reads "Forma de pagamento". Blank down payment is zero; blank date is "on
 * confirmation of the order"; blank installments are "not agreed yet". The
 * forms of payment are the ones of the company (`methods`), never a fixed list.
 */
export function parseOrderPayment(read: (key: PaymentField) => string | null, methods: readonly string[]): ParsedPayment {
  const errors: string[] = [];
  const text = (key: PaymentField) => (read(key) ?? "").trim();

  const downPayment = text("downPayment") === "" ? 0 : parseMoney(text("downPayment"));
  if (downPayment === null) errors.push('"Entrada": informe um valor em reais, zero ou mais (ex.: 25.000,00).');

  const method = (key: "downPaymentMethod" | "balanceMethod", label: string) => {
    const value = text(key);
    if (value === "") return null;
    if (!methods.includes(value)) errors.push(`"${label}": escolha uma forma da lista.`);
    return value;
  };
  const downPaymentMethod = method("downPaymentMethod", "Forma da entrada");
  const balanceMethod = method("balanceMethod", "Forma do saldo");

  const downPaymentDate = text("downPaymentDate") === "" ? null : text("downPaymentDate");
  if (downPaymentDate !== null && (!ISO_DATE.test(downPaymentDate) || Number.isNaN(Date.parse(`${downPaymentDate}T00:00:00Z`)))) {
    errors.push('"Data da entrada": informe uma data válida.');
  }

  const whole = (key: PaymentField, label: string, minimum: number) => {
    const value = text(key);
    if (value === "") return null;
    if (!WHOLE.test(value) || Number(value) < minimum) {
      errors.push(`"${label}": informe um número inteiro${minimum > 0 ? " maior que zero" : ", zero ou mais"}.`);
      return null;
    }
    return Number(value);
  };
  const installmentCount = whole("installmentCount", "Parcelas do saldo", 1);
  const firstInstallmentDays = whole("firstInstallmentDays", "1ª parcela em (dias)", 0);
  const installmentIntervalDays = whole("installmentIntervalDays", "Intervalo entre parcelas (dias)", 0);

  if (errors.length > 0 || downPayment === null) return { ok: false, errors };
  return {
    ok: true,
    payment: {
      downPayment,
      downPaymentMethod,
      downPaymentDate,
      balanceMethod,
      installmentCount,
      firstInstallmentDays,
      installmentIntervalDays,
      paymentNotes: text("paymentNotes") || null,
    },
  };
}

/** Why an order waits for approval, in the words of the screen. No limit and no profit here. */
export const REASON_TEXT: Record<ApprovalReason, string> = {
  "desconto-acima-do-livre": "o desconto passa do que a equipe pode dar sem aprovação",
  "fora-da-meta": "o lucro do pedido fica abaixo da meta",
  "frete-por-nossa-conta": "o frete fica por conta da empresa",
  "entrada-abaixo-da-politica": "a entrada fica abaixo da política da empresa",
};

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

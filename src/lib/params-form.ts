import { formatMoney, formatPercent, parseDays, parseMoney, parsePercent } from "@/lib/format";
import type { PricingParams } from "@/lib/pricing/params";

export type ParamKey = keyof PricingParams;
type FieldKind = "rate" | "days" | "money";

export type ParamField = {
  key: ParamKey;
  label: string;
  kind: FieldKind;
  /** Help text under the field, from the prototype. */
  help?: string;
};

/** The form, in the order and with the words of the prototype. */
export const PARAM_SECTIONS: { title: string; fields: ParamField[] }[] = [
  {
    title: "Política comercial",
    fields: [
      {
        key: "targetNetProfit",
        label: "Lucro líquido que quero em cada venda",
        kind: "rate",
        help: "Sobre o valor já com desconto, depois de impostos, DIFAL, taxas, equipamento e IRPJ/CSLL. Ninguém além de você vê este número.",
      },
      {
        key: "freeDiscount",
        label: "Desconto livre do vendedor",
        kind: "rate",
        help: "Até aqui o vendedor fecha sozinho. A tabela é calculada para, mesmo com este desconto, manter a meta no pior estado.",
      },
      {
        key: "safetyMargin",
        label: "Margem de segurança da importação",
        kind: "rate",
        help: "Colchão para dólar, taxas e frete da China. Soma no custo de todos os equipamentos.",
      },
      {
        key: "minDownPayment",
        label: "Entrada mínima pedida ao cliente",
        kind: "rate",
        help: "Mostrada a toda a equipe. Sugestão ao lado: cobre o pagamento na China + comissão no pior produto.",
      },
      {
        key: "proposalValidityDays",
        label: "Validade da proposta",
        kind: "days",
        help: "Aparece na proposta copiada para o cliente.",
      },
    ],
  },
  {
    title: "Impostos da venda (Lucro Real)",
    fields: [
      { key: "icmsSp", label: "ICMS dentro de SP", kind: "rate" },
      { key: "pisCofins", label: "PIS + COFINS", kind: "rate", help: "1,65% + 7,60% no não cumulativo." },
      {
        key: "ipi",
        label: "IPI destacado na nota",
        kind: "rate",
        help: "Importador equiparado a industrial. Confirme a alíquota do NCM.",
      },
      {
        key: "incomeTax",
        label: "IRPJ + CSLL sobre o lucro",
        kind: "rate",
        help: "Incide só sobre o que sobra de lucro.",
      },
    ],
  },
  {
    title: "Canal: venda direta / representante",
    fields: [
      { key: "commission", label: "Comissão", kind: "rate" },
      { key: "ads", label: "Anúncios / Ads", kind: "rate" },
      { key: "gateway", label: "Gateway e antecipação", kind: "rate" },
      { key: "icmsInterstate", label: "ICMS interestadual (importado com FCI)", kind: "rate" },
      { key: "otherSalesRate", label: "Outras taxas da venda", kind: "rate" },
    ],
  },
  {
    title: "Despesas fixas",
    fields: [{ key: "fixedMonthlyExpenses", label: "Despesas fixas por mês", kind: "money" }],
  },
];

export const PARAM_FIELDS: ParamField[] = PARAM_SECTIONS.flatMap((section) => section.fields);

export type ParamsFormValues = Record<ParamKey, string>;

const FORMATTERS: Record<FieldKind, (value: number) => string> = {
  rate: formatPercent,
  days: String,
  money: formatMoney,
};

const PARSERS: Record<FieldKind, (text: string) => number | null> = {
  rate: parsePercent,
  days: parseDays,
  money: parseMoney,
};

const EXPECTED: Record<FieldKind, string> = {
  rate: "informe um percentual de 0 até menos de 100 (ex.: 9,25)",
  days: "informe um número inteiro de dias, maior que zero",
  money: "informe um valor em reais, zero ou mais (ex.: 1.234,56)",
};

/** What each field shows for these parameters. */
export function paramsToForm(params: PricingParams): ParamsFormValues {
  return Object.fromEntries(
    PARAM_FIELDS.map((field) => [field.key, FORMATTERS[field.kind](params[field.key])]),
  ) as ParamsFormValues;
}

export type ParsedParamsForm =
  | { ok: true; params: PricingParams }
  | { ok: false; errors: string[]; invalid: ParamKey[] };

/**
 * Reads what was typed. Every problem is reported at once, each with the label
 * of its field. `read` returns the raw text of a field (`null` when absent).
 */
export function parseParamsForm(read: (key: ParamKey) => string | null): ParsedParamsForm {
  const errors: string[] = [];
  const invalid: ParamKey[] = [];
  const values: Partial<PricingParams> = {};
  for (const field of PARAM_FIELDS) {
    const value = PARSERS[field.kind](read(field.key) ?? "");
    if (value === null) {
      errors.push(`"${field.label}": ${EXPECTED[field.kind]}.`);
      invalid.push(field.key);
    } else {
      values[field.key] = value;
    }
  }
  return errors.length > 0 ? { ok: false, errors, invalid } : { ok: true, params: values as PricingParams };
}

/** The raw text of every field, to show the form again as it was typed. */
export function rawFormValues(read: (key: ParamKey) => string | null): ParamsFormValues {
  return Object.fromEntries(PARAM_FIELDS.map((field) => [field.key, read(field.key) ?? ""])) as ParamsFormValues;
}

/** What the save action answers to the form. */
export type ParamsFormState = {
  status: "idle" | "saved" | "error";
  errors: string[];
  invalid: ParamKey[];
  /** Text to show in the fields: what was typed, or what was saved. `null` before the first save. */
  values: ParamsFormValues | null;
};

export const IDLE_FORM_STATE: ParamsFormState = { status: "idle", errors: [], invalid: [], values: null };

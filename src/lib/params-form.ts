import { formatMoney, formatPercent, parseDays, parseMoney, parsePercent } from "@/lib/format";
import type { PricingParams, ScalarParams } from "@/lib/pricing/params";
import { UFS } from "@/lib/pricing/states";
import type { StateRates, Uf } from "@/lib/pricing/states";

/** A field that is one number of the parameters. */
export type ParamKey = keyof ScalarParams;

/** A cell of the table of rates by state: `icms-MA` or `fcp-MA`. */
export type StateRateKey = `icms-${Uf}` | `fcp-${Uf}`;

/** Any field of the form. */
export type FormKey = ParamKey | StateRateKey;

export const STATE_RATE_COLUMNS = [
  { prefix: "icms", label: "ICMS interno", field: "internalIcms" },
  { prefix: "fcp", label: "FCP", field: "fcp" },
] as const;

const stateKey = (prefix: "icms" | "fcp", uf: Uf) => `${prefix}-${uf}` as StateRateKey;
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
      {
        key: "fixedFeePerOrder",
        label: "Taxa fixa por pedido",
        kind: "money",
        help: "Em reais, uma vez por pedido. Sai do lucro do pedido junto com o frete por nossa conta.",
      },
    ],
  },
  {
    title: "Provisões",
    fields: [
      { key: "lossProvision", label: "Perdas", kind: "rate", help: "Sobre o valor sem IPI. Entra no preço de tabela como os impostos." },
      { key: "warrantyProvision", label: "Garantia", kind: "rate" },
      { key: "defaultProvision", label: "Inadimplência", kind: "rate" },
    ],
  },
  {
    title: "Despesas fixas",
    fields: [
      {
        key: "fixedMonthlyExpenses",
        label: "Despesas fixas por mês",
        kind: "money",
        help: "Com despesas cadastradas em Parâmetros → Despesas fixas, este valor passa a ser a soma delas.",
      },
    ],
  },
];

export const PARAM_FIELDS: ParamField[] = PARAM_SECTIONS.flatMap((section) => section.fields);

export type ParamsFormValues = Record<FormKey, string>;

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

/** What each field shows for these parameters, the table of rates by state included. */
export function paramsToForm(params: PricingParams): ParamsFormValues {
  const values: Partial<ParamsFormValues> = {};
  for (const field of PARAM_FIELDS) values[field.key] = FORMATTERS[field.kind](params[field.key]);
  for (const uf of UFS) {
    for (const { prefix, field } of STATE_RATE_COLUMNS) values[stateKey(prefix, uf)] = formatPercent(params.stateRates[uf][field]);
  }
  return values as ParamsFormValues;
}

export type ParsedParamsForm =
  | { ok: true; params: PricingParams }
  | { ok: false; errors: string[]; invalid: FormKey[] };

/**
 * Reads what was typed. Every problem is reported at once, each with the label
 * of its field. `read` returns the raw text of a field (`null` when absent). In
 * the table of states a blank FCP is zero; a blank ICMS is an error.
 */
export function parseParamsForm(read: (key: FormKey) => string | null): ParsedParamsForm {
  const errors: string[] = [];
  const invalid: FormKey[] = [];
  const scalars: Partial<ScalarParams> = {};
  for (const field of PARAM_FIELDS) {
    const value = PARSERS[field.kind](read(field.key) ?? "");
    if (value === null) {
      errors.push(`"${field.label}": ${EXPECTED[field.kind]}.`);
      invalid.push(field.key);
    } else {
      scalars[field.key] = value;
    }
  }

  const stateRates: Partial<StateRates> = {};
  for (const uf of UFS) {
    const rate = { internalIcms: 0, fcp: 0 };
    for (const { prefix, label, field } of STATE_RATE_COLUMNS) {
      const key = stateKey(prefix, uf);
      const text = (read(key) ?? "").trim();
      const value = text === "" && field === "fcp" ? 0 : parsePercent(text);
      if (value === null) {
        errors.push(`"${label} de ${uf}": ${EXPECTED.rate}.`);
        invalid.push(key);
      } else {
        rate[field] = value;
      }
    }
    stateRates[uf] = rate;
  }

  if (errors.length > 0) return { ok: false, errors, invalid };
  return { ok: true, params: { ...(scalars as ScalarParams), stateRates: stateRates as StateRates } };
}

/** The raw text of every field, to show the form again as it was typed. */
export function rawFormValues(read: (key: FormKey) => string | null): ParamsFormValues {
  const keys: FormKey[] = [
    ...PARAM_FIELDS.map((field) => field.key),
    ...UFS.flatMap((uf) => STATE_RATE_COLUMNS.map(({ prefix }) => stateKey(prefix, uf))),
  ];
  return Object.fromEntries(keys.map((key) => [key, read(key) ?? ""])) as ParamsFormValues;
}

/** What the save action answers to the form. */
export type ParamsFormState = {
  status: "idle" | "saved" | "error";
  errors: string[];
  invalid: FormKey[];
  /** Text to show in the fields: what was typed, or what was saved. `null` before the first save. */
  values: ParamsFormValues | null;
};

export const IDLE_FORM_STATE: ParamsFormState = { status: "idle", errors: [], invalid: [], values: null };

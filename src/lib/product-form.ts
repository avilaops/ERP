import type { Product, ProductInput } from "@/lib/db/products";
import { formatMoney, formatPercent, parseMoney, parsePercent } from "@/lib/format";

type FieldKind = "name" | "text" | "usd" | "cost" | "rate" | "money";

const FIELDS = {
  name: { label: "Nome", kind: "name" },
  code: { label: "Código Ludus", kind: "text" },
  supplierName: { label: "Fornecedor", kind: "text" },
  supplierModel: { label: "Modelo do fornecedor", kind: "text" },
  supplierPriceUsd: { label: "Preço do fornecedor US$", kind: "usd" },
  advisoryCost: { label: "Custo assessoria R$", kind: "cost" },
  taxCredit: { label: "Crédito imp. %", kind: "rate" },
  packaging: { label: "Embalagem R$", kind: "money" },
} as const satisfies Record<string, { label: string; kind: FieldKind }>;

export type ProductFieldKey = keyof typeof FIELDS;

/** The form of "+ Equipamento", in the order of the screen. Only the name is required. */
export const NEW_PRODUCT_FIELDS = [
  "name",
  "code",
  "supplierName",
  "supplierModel",
  "supplierPriceUsd",
  "advisoryCost",
  "taxCredit",
  "packaging",
] as const satisfies readonly ProductFieldKey[];

/** What is edited in the row of the list. The supplier reference is not. */
export const ROW_FIELDS = ["name", "code", "advisoryCost", "taxCredit", "packaging"] as const satisfies readonly ProductFieldKey[];

export type NewProductKey = (typeof NEW_PRODUCT_FIELDS)[number];
export type RowKey = (typeof ROW_FIELDS)[number];

export const fieldLabel = (key: ProductFieldKey): string => FIELDS[key].label;

const INVALID: Record<Exclude<FieldKind, "text">, string> = {
  name: "informe o nome do equipamento",
  usd: "informe um valor em dólar, zero ou mais (ex.: 605 ou 1.234,56)",
  cost: "informe um valor em reais (ex.: 8.146,64) ou deixe em branco",
  rate: "informe um percentual de 0 até menos de 100 (ex.: 28,11565)",
  money: "informe um valor em reais, zero ou mais (ex.: 1.234,56)",
};

const ZERO_COST = "Custo da assessoria: deixe em branco se ainda não há custo.";

type Read = { value: string | number | null } | { error: string };

function readField(kind: FieldKind, label: string, text: string): Read {
  const invalid = () => ({ error: `"${label}": ${INVALID[kind as Exclude<FieldKind, "text">]}.` });
  switch (kind) {
    case "name":
      return text === "" ? invalid() : { value: text };
    case "text":
      return { value: text === "" ? null : text };
    case "usd": {
      if (text === "") return { value: null };
      const value = parseMoney(text);
      return value === null ? invalid() : { value };
    }
    case "cost": {
      // Blank is a product without cost yet. Zero would give a table price of zero.
      if (text === "") return { value: null };
      const value = parseMoney(text);
      if (value === null) return invalid();
      return value === 0 ? { error: ZERO_COST } : { value };
    }
    case "rate": {
      const value = text === "" ? 0 : parsePercent(text);
      return value === null ? invalid() : { value };
    }
    case "money": {
      const value = text === "" ? 0 : parseMoney(text);
      return value === null ? invalid() : { value };
    }
  }
}

export type ParsedProductForm<Key extends ProductFieldKey> =
  | { ok: true; input: Pick<Required<ProductInput>, Key> }
  | { ok: false; errors: string[]; invalid: Key[] };

/**
 * Reads what was typed in the given fields. Every problem is reported at once,
 * each with the label of its field. `read` returns the raw text of a field
 * (`null` when absent).
 */
export function parseProductForm<Key extends ProductFieldKey>(
  fields: readonly Key[],
  read: (key: Key) => string | null,
): ParsedProductForm<Key> {
  const errors: string[] = [];
  const invalid: Key[] = [];
  const input: Partial<Record<Key, string | number | null>> = {};
  for (const key of fields) {
    const result = readField(FIELDS[key].kind, FIELDS[key].label, (read(key) ?? "").trim());
    if ("error" in result) {
      errors.push(result.error);
      invalid.push(key);
    } else {
      input[key] = result.value;
    }
  }
  if (errors.length > 0) return { ok: false, errors, invalid };
  return { ok: true, input: input as Pick<Required<ProductInput>, Key> };
}

export type ProductFormValues<Key extends ProductFieldKey> = Record<Key, string>;

/** The raw text of every field, to show the form again as it was typed. */
export function rawProductValues<Key extends ProductFieldKey>(
  fields: readonly Key[],
  read: (key: Key) => string | null,
): ProductFormValues<Key> {
  return Object.fromEntries(fields.map((key) => [key, read(key) ?? ""])) as ProductFormValues<Key>;
}

/**
 * What the row shows for a product. The credit goes in full precision: saving
 * the row untouched must not change it. A cost of zero shows blank, as "without cost".
 */
export function productToRow(product: Product): ProductFormValues<RowKey> {
  const cost = product.advisoryCost;
  return {
    name: product.name,
    code: product.code ?? "",
    advisoryCost: cost === null || cost === 0 ? "" : formatMoney(cost),
    taxCredit: formatPercent(product.taxCredit),
    packaging: formatMoney(product.packaging),
  };
}

export const EMPTY_NEW_PRODUCT = rawProductValues(NEW_PRODUCT_FIELDS, () => null);

/** What an action answers to its form. */
export type ProductFormState<Key extends ProductFieldKey> = {
  status: "idle" | "saved" | "error";
  errors: string[];
  invalid: Key[];
  /** What was typed, to show again after an error. `null` otherwise. */
  values: ProductFormValues<Key> | null;
};

export type NewProductState = ProductFormState<NewProductKey>;
export type RowState = ProductFormState<RowKey>;

export const IDLE_NEW_PRODUCT: NewProductState = { status: "idle", errors: [], invalid: [], values: null };
export const IDLE_ROW: RowState = { status: "idle", errors: [], invalid: [], values: null };

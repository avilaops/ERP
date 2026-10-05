import { normalizeCep, ufFromCep } from "@/lib/cep";
import {
  formatCep,
  formatDocument,
  formatPhone,
  isValidDocument,
  normalizeDocument,
  normalizeRegistration,
} from "@/lib/customer";
import type { CustomerInput, CustomerKind } from "@/lib/customer";
import { UFS } from "@/lib/pricing/states";
import type { Uf } from "@/lib/pricing/states";

export type CustomerFieldKey = Exclude<keyof CustomerInput, "kind">;

type Field = { key: CustomerFieldKey; label: string; help?: string; wide?: boolean };

const ADDRESS: Field[] = [
  { key: "cep", label: "CEP" },
  { key: "street", label: "Endereço", wide: true },
  { key: "streetNumber", label: "Número" },
  { key: "complement", label: "Complemento", wide: true },
  { key: "district", label: "Bairro" },
  { key: "city", label: "Cidade" },
  { key: "uf", label: "UF" },
];

/** The record of each kind, in the order and with the words of the prototype. The address is the same for both. */
export const CUSTOMER_FIELDS: Record<CustomerKind, { main: Field[]; address: Field[] }> = {
  PJ: {
    main: [
      { key: "document", label: "CNPJ" },
      { key: "stateRegistration", label: "Inscrição estadual", help: "Número ou ISENTO" },
      { key: "name", label: "Razão social", wide: true },
      { key: "tradeName", label: "Nome fantasia" },
      { key: "contactName", label: "Nome do responsável" },
      { key: "phone", label: "Celular" },
      { key: "email", label: "E-mail" },
    ],
    address: ADDRESS,
  },
  PF: {
    main: [
      { key: "name", label: "Nome completo", wide: true },
      { key: "document", label: "CPF" },
      { key: "rg", label: "RG" },
      { key: "phone", label: "Celular" },
      { key: "email", label: "E-mail" },
    ],
    address: ADDRESS,
  },
};

const fieldsOf = (kind: CustomerKind) => [...CUSTOMER_FIELDS[kind].main, ...CUSTOMER_FIELDS[kind].address];

export type CustomerFormValues = Partial<Record<CustomerFieldKey, string>>;

export type ParsedCustomerForm =
  | { ok: true; input: CustomerInput }
  | { ok: false; errors: string[]; invalid: CustomerFieldKey[] };

const blank = (text: string) => (text === "" ? null : text);

/**
 * Reads the record of a customer of the given kind. Every problem is reported at
 * once, each with the label of its field. Only the document and the name are
 * required; a blank UF with a valid CEP takes the state of the CEP. `read`
 * returns the raw text of a field (`null` when absent).
 */
export function parseCustomerForm(kind: CustomerKind, read: (key: CustomerFieldKey) => string | null): ParsedCustomerForm {
  const errors: string[] = [];
  const invalid: CustomerFieldKey[] = [];
  const labels = new Map(fieldsOf(kind).map((field) => [field.key, field.label]));
  // A field that is not on the record of this kind is never read: it stays blank.
  const text = (key: CustomerFieldKey) => (labels.has(key) ? (read(key) ?? "").trim() : "");
  const refuse = (key: CustomerFieldKey, problem: string) => {
    errors.push(`"${labels.get(key)}": ${problem}.`);
    invalid.push(key);
  };

  const document = normalizeDocument(text("document"));
  if (!isValidDocument(kind, document)) refuse("document", "número inválido, confira os dígitos");

  const name = text("name");
  if (name === "") refuse("name", kind === "PJ" ? "informe a razão social" : "informe o nome completo");

  const stateRegistration = normalizeRegistration(text("stateRegistration"));
  if (stateRegistration !== null && stateRegistration !== "ISENTO" && !/^\d{2,14}$/.test(stateRegistration)) {
    refuse("stateRegistration", "informe o número (2 a 14 dígitos) ou ISENTO");
  }

  const phone = blank(text("phone").replace(/\D/g, ""));
  if (phone !== null && !/^\d{10,11}$/.test(phone)) refuse("phone", "informe o DDD e o número (10 ou 11 dígitos)");

  const email = blank(text("email"));
  if (email !== null && !/^[^\s@]+@[^\s@]+$/.test(email)) refuse("email", "informe um e-mail com @");

  const cep = text("cep") === "" ? null : normalizeCep(text("cep"));
  if (text("cep") !== "" && cep === null) refuse("cep", "informe os 8 dígitos");

  const typedUf = text("uf").toUpperCase();
  let uf: Uf | null = null;
  if (typedUf === "") uf = cep === null ? null : ufFromCep(cep);
  else if ((UFS as readonly string[]).includes(typedUf)) uf = typedUf as Uf;
  else refuse("uf", "escolha um estado da lista");

  if (errors.length > 0) return { ok: false, errors, invalid };
  return {
    ok: true,
    input: {
      kind,
      document,
      name,
      tradeName: blank(text("tradeName")),
      contactName: blank(text("contactName")),
      stateRegistration,
      rg: blank(text("rg")),
      phone,
      email,
      cep,
      street: blank(text("street")),
      streetNumber: blank(text("streetNumber")),
      complement: blank(text("complement")),
      district: blank(text("district")),
      city: blank(text("city")),
      uf,
    },
  };
}

/** The raw text of every field of the kind, to show the form again as it was typed. */
export function rawCustomerValues(kind: CustomerKind, read: (key: CustomerFieldKey) => string | null): CustomerFormValues {
  return Object.fromEntries(fieldsOf(kind).map(({ key }) => [key, read(key) ?? ""]));
}

/** What the record shows for a saved customer: document, phone and CEP with their punctuation. */
export function customerToForm(customer: CustomerInput): CustomerFormValues {
  const values: CustomerFormValues = {};
  for (const { key } of fieldsOf(customer.kind)) values[key] = customer[key] ?? "";
  values.document = formatDocument(customer.document);
  if (customer.phone) values.phone = formatPhone(customer.phone);
  if (customer.cep) values.cep = formatCep(customer.cep);
  return values;
}

/** What the save action answers to the record. */
export type CustomerFormState = {
  status: "idle" | "saved" | "error";
  errors: string[];
  invalid: CustomerFieldKey[];
  /** What was typed, to show again after an error. `null` otherwise. */
  values: CustomerFormValues | null;
};

export const IDLE_CUSTOMER: CustomerFormState = { status: "idle", errors: [], invalid: [], values: null };

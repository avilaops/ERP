import type { Uf } from "@/lib/pricing/states";
import { matchesText } from "@/lib/products-view";

export type CustomerKind = "PJ" | "PF";

/** What is typed for a customer. Blank is `null`. Only kind, document and name are required to save. */
export type CustomerInput = {
  kind: CustomerKind;
  /** Upper-case letters and digits only: CNPJ (14) or CPF (11). */
  document: string;
  /** Razão social (PJ) or full name (PF). */
  name: string;
  tradeName: string | null;
  contactName: string | null;
  /** Digits only, or `ISENTO`. PJ only. */
  stateRegistration: string | null;
  rg: string | null;
  /** Digits only, with the area code. */
  phone: string | null;
  email: string | null;
  /** Eight digits. */
  cep: string | null;
  street: string | null;
  streetNumber: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  uf: Uf | null;
};

/** Removes the punctuation and upper-cases: `"48.240.052/0001-61"` → `"48240052000161"`. */
export function normalizeDocument(text: string): string {
  return text.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

/** Modulo 11 over the characters, each worth its ASCII code minus 48: a digit is worth itself. */
function cnpjDigit(characters: string): number {
  let weight = 2;
  let sum = 0;
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    sum += (characters.charCodeAt(index) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/**
 * A CNPJ without punctuation: twelve letters or digits and two check digits.
 * The alphanumeric CNPJ uses the same calculation, so the all-digits one is just
 * the particular case.
 */
export function isValidCnpj(document: string): boolean {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(document)) return false;
  if (/^0+$/.test(document)) return false;
  const first = cnpjDigit(document.slice(0, 12));
  const second = cnpjDigit(document.slice(0, 12) + first);
  return document.endsWith(`${first}${second}`);
}

/** A CPF without punctuation: eleven digits, two of them check digits, not all the same. */
export function isValidCpf(document: string): boolean {
  if (!/^\d{11}$/.test(document) || /^(\d)\1{10}$/.test(document)) return false;
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(document[index]) * (length + 1 - index);
    return ((sum * 10) % 11) % 10;
  };
  return digit(9) === Number(document[9]) && digit(10) === Number(document[10]);
}

export const isValidDocument = (kind: CustomerKind, document: string) =>
  kind === "PJ" ? isValidCnpj(document) : isValidCpf(document);

/** `48.240.052/0001-61` or `529.982.247-25`. Anything else comes back as it is. */
export function formatDocument(document: string): string {
  if (document.length === 14) return document.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
  if (document.length === 11) return document.replace(/^(.{3})(.{3})(.{3})(.{2})$/, "$1.$2.$3-$4");
  return document;
}

/** `(99) 99999-9999` or `(11) 3333-4444`. */
export function formatPhone(phone: string): string {
  return phone.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
}

/** `99999-999`. */
export function formatCep(cep: string): string {
  return cep.replace(/^(\d{5})(\d{3})$/, "$1-$2");
}

/** `"isento"` in any case becomes `ISENTO`; anything else keeps only its digits; blank is `null`. */
export function normalizeRegistration(text: string): string | null {
  const clean = text.trim();
  if (clean === "") return null;
  if (clean.toUpperCase() === "ISENTO") return "ISENTO";
  return clean.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

/**
 * ICMS taxpayer: only a company with a state registration in numbers. A person,
 * ISENTO and no registration are not, and the DIFAL of a sale outside SP stays with Ludus.
 */
export function taxpayerFromRegistration(kind: CustomerKind, stateRegistration: string | null): boolean {
  return kind === "PJ" && stateRegistration !== null && /^\d+$/.test(stateRegistration);
}

const ADDRESS: [keyof CustomerInput, string][] = [
  ["cep", "CEP"],
  ["street", "Endereço"],
  ["streetNumber", "Número"],
  ["district", "Bairro"],
  ["city", "Cidade"],
  ["uf", "UF"],
];

/** The fields marked with * on the screen, by kind: what an order needs to be closed. */
const REQUIRED: Record<CustomerKind, [keyof CustomerInput, string][]> = {
  PJ: [
    ["document", "CNPJ"],
    ["stateRegistration", "Inscrição estadual"],
    ["name", "Razão social"],
    ["contactName", "Nome do responsável"],
    ["phone", "Celular"],
    ["email", "E-mail"],
    ...ADDRESS,
  ],
  PF: [["name", "Nome completo"], ["document", "CPF"], ["phone", "Celular"], ["email", "E-mail"], ...ADDRESS],
};

export const isRequired = (kind: CustomerKind, field: keyof CustomerInput) =>
  REQUIRED[kind].some(([required]) => required === field);

/** Labels of the required fields still blank. Empty means "Cadastro completo". */
export function missingFields(customer: CustomerInput): string[] {
  return REQUIRED[customer.kind].flatMap(([field, label]) => {
    const value = customer[field];
    return value === null || value.trim() === "" ? [label] : [];
  });
}

export const isComplete = (customer: CustomerInput) => missingFields(customer).length === 0;

/** `Cadastro completo`, or how many required fields are missing. */
export function completenessText(customer: CustomerInput): string {
  const missing = missingFields(customer).length;
  if (missing === 0) return "Cadastro completo";
  return missing === 1 ? "Falta 1 campo" : `Faltam ${missing} campos`;
}

/** Looks for the text in name and trade name, or for the document, with or without punctuation. */
export function matchesCustomer(customer: Pick<CustomerInput, "name" | "tradeName" | "document">, search: string): boolean {
  if (matchesText([customer.name, customer.tradeName], search)) return true;
  const document = normalizeDocument(search);
  return document !== "" && customer.document.includes(document);
}

/** `3 clientes`. */
export const customersCounter = (count: number) => (count === 1 ? "1 cliente" : `${count} clientes`);

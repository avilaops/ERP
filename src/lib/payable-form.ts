import type { PayableInput, PaymentInput } from "@/lib/db/payables";
import type { BankDetails, SupplierInput, SupplierKind } from "@/lib/db/suppliers";
import { BANK_FIELDS, SUPPLIER_KINDS } from "@/lib/db/suppliers";
import { parseMoney } from "@/lib/format";

type Read = (key: string) => string | null;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/**
 * Reads the form of a bill. Category and form of payment must be among the
 * ones of the company; the supplier, among the registered ones. Blank supplier
 * and blank form are "none".
 */
export function parsePayableForm(
  read: Read,
  known: { categories: readonly string[]; methods: readonly string[]; supplierIds: readonly number[] },
): Parsed<PayableInput> {
  const errors: string[] = [];
  const text = (key: string) => (read(key) ?? "").trim();

  const description = text("description");
  if (description === "") errors.push('"Descrição": diga o que é a conta.');
  const category = text("category");
  if (!known.categories.includes(category)) errors.push('"Categoria": escolha uma da lista.');
  const amount = text("amount") === "" ? null : parseMoney(text("amount"));
  if (amount === null || amount <= 0) errors.push('"Valor": informe um valor em reais maior que zero (ex.: 1.234,56).');
  const dueDate = text("dueDate");
  if (!ISO_DATE.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) errors.push('"Vencimento": informe uma data válida.');
  const method = text("method");
  if (method !== "" && !known.methods.includes(method)) errors.push('"Forma": escolha uma da lista.');
  const supplier = text("supplierId");
  const supplierId = supplier === "" ? null : Number(supplier);
  if (supplierId !== null && !known.supplierIds.includes(supplierId)) errors.push('"Fornecedor": escolha um da lista.');

  if (errors.length > 0 || amount === null) return { ok: false, errors };
  return { ok: true, value: { description, supplierId, category, amount, dueDate, method: method || null } };
}

/** Reads "Pagar": the day, the amount that actually left and the form. */
export function parsePaymentForm(read: Read, methods: readonly string[]): Parsed<PaymentInput> {
  const errors: string[] = [];
  const text = (key: string) => (read(key) ?? "").trim();
  const paidOn = text("paidOn");
  if (!ISO_DATE.test(paidOn) || Number.isNaN(Date.parse(`${paidOn}T00:00:00Z`))) errors.push('"Pago em": informe uma data válida.');
  const paidAmount = text("paidAmount") === "" ? null : parseMoney(text("paidAmount"));
  if (paidAmount === null || paidAmount <= 0) errors.push('"Valor pago": informe um valor em reais maior que zero.');
  const method = text("method");
  if (method !== "" && !methods.includes(method)) errors.push('"Forma": escolha uma da lista.');
  if (errors.length > 0 || paidAmount === null) return { ok: false, errors };
  return { ok: true, value: { paidOn, paidAmount, method: method || null } };
}

/** Reads the supplier form as typed. Document, name and country are checked by the database layer, with its messages. */
export function readSupplierForm(read: Read): SupplierInput {
  const text = (key: string) => (read(key) ?? "").trim();
  const kind = (SUPPLIER_KINDS as readonly string[]).includes(text("kind")) ? (text("kind") as SupplierKind) : "PJ";
  const bank: BankDetails = {};
  for (const [key] of BANK_FIELDS) if (text(key) !== "") bank[key] = text(key);
  return {
    kind,
    document: text("document") || null,
    name: text("name"),
    tradeName: text("tradeName") || null,
    contactName: text("contactName") || null,
    phone: text("phone") || null,
    email: text("email") || null,
    country: text("country") || null,
    bank,
    notes: text("notes") || null,
    // On the form of a new supplier there is no box: absent means active.
    active: read("hasActive") === null ? true : text("active") !== "",
  };
}

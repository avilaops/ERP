import { isValidCnpj, isValidCpf, normalizeDocument } from "@/lib/customer";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class SupplierError extends Error {}

/** Company, person, or someone abroad (no CNPJ or CPF: a country and, when there is one, a tax id). */
export type SupplierKind = "PJ" | "PF" | "EX";
export const SUPPLIER_KINDS: readonly SupplierKind[] = ["PJ", "PF", "EX"];
export const SUPPLIER_KIND_LABELS: Record<SupplierKind, string> = { PJ: "Empresa (CNPJ)", PF: "Pessoa física (CPF)", EX: "Exterior" };

/** What a payment needs. Every field is free text, as the bank or the supplier wrote it. */
export const BANK_FIELDS = [
  ["bank", "Banco"],
  ["agency", "Agência"],
  ["account", "Conta"],
  ["pix", "Chave PIX"],
  ["swift", "SWIFT / IBAN"],
] as const;
export type BankField = (typeof BANK_FIELDS)[number][0];
export type BankDetails = Partial<Record<BankField, string>>;

export type SupplierInput = {
  kind: SupplierKind;
  document: string | null;
  name: string;
  tradeName: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  bank: BankDetails;
  notes: string | null;
  active: boolean;
};

export type Supplier = SupplierInput & { id: number; updatedAt: Date };

const UNIQUE_VIOLATION = "23505";
const COLUMNS = "id, kind, document, name, trade_name, contact_name, phone, email, country, bank_details, notes, active, updated_at";
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const blank = (value: string | null) => (value?.trim() ? value.trim() : null);

function supplier(row: Record<string, unknown>): Supplier {
  const details = (row.bank_details ?? {}) as Record<string, unknown>;
  const bank: BankDetails = {};
  for (const [key] of BANK_FIELDS) if (typeof details[key] === "string" && details[key] !== "") bank[key] = details[key];
  return {
    id: Number(row.id),
    kind: row.kind as SupplierKind,
    document: text(row.document),
    name: String(row.name),
    tradeName: text(row.trade_name),
    contactName: text(row.contact_name),
    phone: text(row.phone),
    email: text(row.email),
    country: text(row.country),
    bank,
    notes: text(row.notes),
    active: row.active === true,
    updatedAt: row.updated_at as Date,
  };
}

/** Checks and tidies what will be written. A company or a person needs a valid document; abroad, the country. */
function prepare(input: SupplierInput, who: string): unknown[] {
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando o fornecedor.");
  if (!SUPPLIER_KINDS.includes(input.kind)) throw new SupplierError("Escolha o tipo do fornecedor.");
  if (input.name.trim() === "") throw new SupplierError("Informe o nome ou a razão social.");

  let document = blank(input.document);
  let country = blank(input.country);
  if (input.kind === "EX") {
    if (country === null) throw new SupplierError("Fornecedor do exterior: informe o país.");
  } else {
    document = normalizeDocument(document ?? "");
    const valid = input.kind === "PJ" ? isValidCnpj(document) : isValidCpf(document);
    if (!valid) throw new SupplierError(input.kind === "PJ" ? "CNPJ inválido. Confira os números." : "CPF inválido. Confira os números.");
    country = null;
  }
  const bank: BankDetails = {};
  for (const [key] of BANK_FIELDS) {
    const value = input.bank[key]?.trim();
    if (value) bank[key] = value;
  }
  return [
    input.kind, document, input.name.trim(), blank(input.tradeName), blank(input.contactName), blank(input.phone),
    blank(input.email), country, JSON.stringify(bank), blank(input.notes), input.active, who,
  ];
}

const DUPLICATE = "Já existe fornecedor com este documento. Altere o que está na lista.";

/** Everyone registered, active first, by name. */
export async function listSuppliers(conn: Queryable): Promise<Supplier[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM suppliers ORDER BY active DESC, lower(COALESCE(trade_name, name)), id`);
  return rows.map(supplier);
}

export async function getSupplier(id: number, conn: Queryable): Promise<Supplier | null> {
  if (!Number.isSafeInteger(id)) return null;
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM suppliers WHERE id = $1`, [id]);
  return rows.length === 0 ? null : supplier(rows[0]);
}

export async function createSupplier(input: SupplierInput, who: string, conn: Queryable): Promise<Supplier> {
  const values = prepare(input, who);
  try {
    const { rows } = await conn.query(
      `INSERT INTO suppliers (kind, document, name, trade_name, contact_name, phone, email, country, bank_details, notes, active, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
       RETURNING ${COLUMNS}`,
      values,
    );
    return supplier(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new SupplierError(DUPLICATE);
    throw error;
  }
}

/** Changes the record. Nothing is deleted: a supplier no longer used is turned off and leaves the lists. */
export async function updateSupplier(id: number, input: SupplierInput, who: string, conn: Queryable): Promise<Supplier> {
  const values = prepare(input, who);
  try {
    const { rows } = await conn.query(
      `UPDATE suppliers
          SET kind = $1, document = $2, name = $3, trade_name = $4, contact_name = $5, phone = $6, email = $7, country = $8,
              bank_details = $9::jsonb, notes = $10, active = $11, updated_at = now(), updated_by = $12
        WHERE id = $13
        RETURNING ${COLUMNS}`,
      [...values, id],
    );
    if (rows.length === 0) throw new SupplierError("Fornecedor não encontrado.");
    return supplier(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new SupplierError(DUPLICATE);
    throw error;
  }
}

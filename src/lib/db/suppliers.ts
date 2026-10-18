import { isValidCnpj, isValidCpf, normalizeDocument } from "@/lib/customer";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { normalizedSearch, searchableText } from "@/lib/db/search";
import { listResult } from "@/lib/list-query";
import { compactDocumentSearch } from "@/lib/list-query";
import type { ListQuery, ListResult } from "@/lib/list-query";

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
export type SupplierListSort = "nome" | "cadastro";

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

export async function listSupplierCountries(conn: Queryable): Promise<string[]> {
  const { rows } = await conn.query("SELECT DISTINCT country FROM suppliers WHERE country IS NOT NULL ORDER BY country");
  return rows.map((row) => String(row.country));
}


/** A supplier page, searched and cut by PostgreSQL. */
export async function querySuppliers(query: ListQuery<SupplierListSort>, conn: Queryable): Promise<ListResult<Supplier>> {
  const values: unknown[] = [normalizedSearch(query.search), compactDocumentSearch(query.search)];
  const where = [
    `($1 = '' OR strpos(${searchableText("name")}, $1) > 0 OR strpos(${searchableText("trade_name")}, $1) > 0
      OR strpos(${searchableText("contact_name")}, $1) > 0 OR strpos(${searchableText("country")}, $1) > 0
      OR ($2 <> '' AND strpos(regexp_replace(upper(COALESCE(document, '')), '[^0-9A-Z]', '', 'g'), $2) > 0))`,
  ];
  const addArray = (column: string, selected: string[] | undefined) => {
    if (!selected?.length) return;
    values.push(selected);
    where.push(`${column} = ANY($${values.length}::text[])`);
  };
  addArray("kind", query.filters.tipo);
  addArray("country", query.filters.pais);
  const status = query.filters.situacao?.[0];
  if (status === "ativo") where.push("active");
  if (status === "inativo") where.push("NOT active");
  const restriction = `WHERE ${where.join(" AND ")}`;
  const counted = await conn.query(`SELECT count(*) AS total FROM suppliers ${restriction}`, values);
  const total = Number(counted.rows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(pages, query.page);
  const dataValues = [...values, query.pageSize, (page - 1) * query.pageSize];
  const order = query.sort === "cadastro" ? "created_at" : "lower(COALESCE(trade_name, name))";
  const direction = query.direction.toUpperCase();
  const { rows } = await conn.query(
    `SELECT ${COLUMNS} FROM suppliers ${restriction}
      ORDER BY ${order} ${direction}, id ${direction}
      LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues,
  );
  return listResult(rows.map(supplier), total, page, query.pageSize);
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

const FOREIGN_KEY_VIOLATION = "23503";

/** Removes a supplier never used. One with bills has history: it is turned off instead. */
export async function deleteSupplier(id: number, conn: Queryable): Promise<{ name: string }> {
  try {
    const { rows } = await conn.query("DELETE FROM suppliers WHERE id = $1 RETURNING name", [id]);
    if (rows.length === 0) throw new SupplierError("Fornecedor não encontrado.");
    return { name: String(rows[0].name) };
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      throw new SupplierError("Este fornecedor tem contas lançadas e não pode ser removido. Desmarque “Em uso” para ele sair das listas.");
    }
    throw error;
  }
}

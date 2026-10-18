import { isValidDocument } from "@/lib/customer";
import type { CustomerInput, CustomerKind } from "@/lib/customer";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import type { Uf } from "@/lib/pricing/states";
import { normalizedAddress } from "@/lib/address";
import { listResult } from "@/lib/list-query";
import type { ListQuery, ListResult } from "@/lib/list-query";

export type { CustomerInput } from "@/lib/customer";

export type Customer = CustomerInput & { id: number };
export type CustomerListSort = "nome" | "cadastro" | "ultima_compra";
export type CustomerListItem = Customer & {
  closedOrders: number;
  totalBought: number;
  lastPurchase: Date | null;
};

/** A refusal the user can act on. The message goes to the screen as it is. */
export class CustomerError extends Error {}

const COLUMNS =
  "id, kind, document, name, trade_name, contact_name, state_registration, rg, phone, email, cep, street, street_number, complement, district, city, uf";

const UNIQUE_VIOLATION = "23505";

const textOrNull = (value: unknown) => (value === null ? null : String(value));

function toCustomer(row: Record<string, unknown>): Customer {
  return {
    id: Number(row.id),
    kind: row.kind as CustomerKind,
    document: String(row.document),
    name: String(row.name),
    tradeName: textOrNull(row.trade_name),
    contactName: textOrNull(row.contact_name),
    stateRegistration: textOrNull(row.state_registration),
    rg: textOrNull(row.rg),
    phone: textOrNull(row.phone),
    email: textOrNull(row.email),
    cep: textOrNull(row.cep),
    street: textOrNull(row.street),
    streetNumber: textOrNull(row.street_number),
    complement: textOrNull(row.complement),
    district: textOrNull(row.district),
    city: textOrNull(row.city),
    uf: row.uf as Uf | null,
  };
}

/** Blank text is "not informed": stored as NULL. */
const blankToNull = (value: string | null) => (value?.trim() ? value.trim() : null);

/** What does not depend on the kind, in the order of the statements below. */
const sharedValues = (input: CustomerInput) => [
  blankToNull(input.phone),
  blankToNull(input.email),
  blankToNull(input.cep),
  blankToNull(input.street),
  blankToNull(input.streetNumber),
  blankToNull(input.complement),
  blankToNull(input.district),
  blankToNull(input.city),
  input.uf,
];

/** The fields that only one kind has are blank on the other, whatever came in. */
const kindValues = (input: CustomerInput) =>
  input.kind === "PJ"
    ? [blankToNull(input.tradeName), blankToNull(input.contactName), blankToNull(input.stateRegistration), null]
    : [null, null, null, blankToNull(input.rg)];

function assertInput(input: CustomerInput, updatedBy: string): string {
  const name = input.name.trim();
  if (name === "") throw new CustomerError("Cliente sem nome.");
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está gravando o cliente.");
  return name;
}

const duplicate = (kind: CustomerKind) => new CustomerError(`Já existe cliente com este ${kind === "PJ" ? "CNPJ" : "CPF"}.`);

/** One record per CNPJ or CPF. Takes what `parseCustomerForm` returns. */
export async function createCustomer(input: CustomerInput, updatedBy: string, conn: Queryable): Promise<Customer> {
  input = normalizedAddress(input);
  const name = assertInput(input, updatedBy);
  if (!isValidDocument(input.kind, input.document)) {
    throw new CustomerError(`${input.kind === "PJ" ? "CNPJ" : "CPF"} inválido.`);
  }

  try {
    const { rows } = await conn.query(
      `INSERT INTO customers
         (kind, document, name, trade_name, contact_name, state_registration, rg,
          phone, email, cep, street, street_number, complement, district, city, uf, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING ${COLUMNS}`,
      [input.kind, input.document, name, ...kindValues(input), ...sharedValues(input), updatedBy],
    );
    return toCustomer(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw duplicate(input.kind);
    throw error;
  }
}

/**
 * Writes the record again. The kind and the document do not change: they are
 * what identifies the customer, and the ones in `input` are ignored.
 */
export async function updateCustomer(
  id: number,
  input: CustomerInput,
  updatedBy: string,
  conn: Queryable,
): Promise<Customer> {
  input = normalizedAddress(input);
  const name = assertInput(input, updatedBy);
  const current = await getCustomer(id, conn);
  if (!current) throw new CustomerError("Cliente não encontrado.");

  const { rows } = await conn.query(
    `UPDATE customers
        SET name = $2, trade_name = $3, contact_name = $4, state_registration = $5, rg = $6,
            phone = $7, email = $8, cep = $9, street = $10, street_number = $11, complement = $12,
            district = $13, city = $14, uf = $15, updated_at = now(), updated_by = $16
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id, name, ...kindValues({ ...input, kind: current.kind }), ...sharedValues(input), updatedBy],
  );
  if (rows.length === 0) throw new CustomerError("Cliente não encontrado.");
  return toCustomer(rows[0]);
}

export async function getCustomer(id: number, conn: Queryable): Promise<Customer | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM customers WHERE id = $1`, [id]);
  return rows[0] ? toCustomer(rows[0]) : null;
}

/** By CNPJ or CPF without punctuation, as it is stored. */
export async function findCustomerByDocument(document: string, conn: Queryable): Promise<Customer | null> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM customers WHERE document = $1`, [document]);
  return rows[0] ? toCustomer(rows[0]) : null;
}

/** Every customer, by name. The record is shared by the whole team. */
export async function listCustomers(conn: Queryable): Promise<Customer[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM customers ORDER BY name, id`);
  return rows.map(toCustomer);
}

const SEARCH_FROM = "áàâãäéèêëíìîïóòôõöúùûüç";
const SEARCH_TO = "aaaaaeeeeiiiiooooouuuuc";
const QUALIFIED_COLUMNS = COLUMNS.split(", ").map((column) => `c.${column}`).join(", ");
const CUSTOMER_FROM = `FROM customers c
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS closed_orders, COALESCE(sum(k.invoice_total), 0) AS total_bought, max(k.closed_at) AS last_purchase
      FROM orders o
      JOIN order_closings k ON k.order_id = o.id AND k.reopened_at IS NULL
     WHERE o.customer_id = c.id AND o.status = 'fechado'
  ) b ON true`;
const searchable = (column: string) => `translate(lower(COALESCE(${column}, '')), '${SEARCH_FROM}', '${SEARCH_TO}')`;
const searchText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

/** A customer page. Filters and count are applied in PostgreSQL before any row reaches Next.js. */
export async function queryCustomers(query: ListQuery<CustomerListSort>, conn: Queryable): Promise<ListResult<CustomerListItem>> {
  const values: unknown[] = [searchText(query.search)];
  const where = [
    `($1 = '' OR ${searchable("c.name")} LIKE '%' || $1 || '%' OR ${searchable("c.trade_name")} LIKE '%' || $1 || '%'
      OR regexp_replace(c.document, '[^0-9A-Z]', '', 'g') LIKE '%' || upper(regexp_replace($1, '[^0-9A-Z]', '', 'g')) || '%')`,
  ];
  const addArray = (column: string, selected: string[] | undefined) => {
    if (!selected?.length) return;
    values.push(selected);
    where.push(`${column} = ANY($${values.length}::text[])`);
  };
  addArray("c.kind", query.filters.tipo);
  addArray("c.uf", query.filters.uf);
  const purchase = query.filters.compra?.[0];
  if (purchase === "com") where.push("COALESCE(b.closed_orders, 0) > 0");
  if (purchase === "sem") where.push("COALESCE(b.closed_orders, 0) = 0");

  const restriction = `WHERE ${where.join(" AND ")}`;
  const counted = await conn.query(`SELECT count(*) AS total ${CUSTOMER_FROM} ${restriction}`, values);
  const total = Number(counted.rows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(pages, query.page);
  const orderColumn = query.sort === "cadastro" ? "c.created_at" : query.sort === "ultima_compra" ? "b.last_purchase" : "lower(c.name)";
  const nulls = query.sort === "ultima_compra" ? " NULLS LAST" : "";
  const dataValues = [...values, query.pageSize, (page - 1) * query.pageSize];
  const { rows } = await conn.query(
    `SELECT ${QUALIFIED_COLUMNS},
            COALESCE(b.closed_orders, 0) AS closed_orders, COALESCE(b.total_bought, 0) AS total_bought, b.last_purchase
       ${CUSTOMER_FROM} ${restriction}
      ORDER BY ${orderColumn} ${query.direction.toUpperCase()}${nulls}, c.id ${query.direction.toUpperCase()}
      LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
    dataValues,
  );
  const items = rows.map((row) => ({
    ...toCustomer(row),
    closedOrders: Number(row.closed_orders),
    totalBought: Number(row.total_bought),
    lastPurchase: (row.last_purchase as Date | null) ?? null,
  }));
  return listResult(items, total, page, query.pageSize);
}

/** Removes a customer with no order. One that has orders has history and stays. */
export async function deleteCustomer(id: number, conn: Queryable): Promise<{ name: string }> {
  try {
    const { rows } = await conn.query("DELETE FROM customers WHERE id = $1 RETURNING name", [id]);
    if (rows.length === 0) throw new CustomerError("Cliente não encontrado.");
    return { name: String(rows[0].name) };
  } catch (error) {
    if (pgErrorCode(error) === "23503") throw new CustomerError("Este cliente tem pedidos e não pode ser removido.");
    throw error;
  }
}

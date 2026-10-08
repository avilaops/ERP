import { isValidCnpj, isValidCpf, normalizeDocument } from "@/lib/customer";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { UFS } from "@/lib/pricing/states";

/** A refusal the user can act on. */
export class CarrierError extends Error {}

export type CarrierInput = {
  /** CNPJ or CPF, as typed: punctuation is dropped. */
  document: string;
  name: string;
  /** Digits, `ISENTO` or blank. */
  stateRegistration: string | null;
  address: string | null;
  city: string | null;
  uf: string | null;
};
export type Carrier = { id: number; kind: "PJ" | "PF"; document: string; name: string; stateRegistration: string | null; address: string | null; city: string | null; uf: string | null };

const COLUMNS = "id, kind, document, name, state_registration, address, city, uf";
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const blank = (value: string | null) => (value?.trim() ? value.trim() : null);

const toCarrier = (row: Record<string, unknown>): Carrier => ({
  id: Number(row.id), kind: row.kind as Carrier["kind"], document: String(row.document), name: String(row.name),
  stateRegistration: text(row.state_registration), address: text(row.address), city: text(row.city), uf: text(row.uf),
});

/** Every carrier of the company, by name. */
export async function listCarriers(conn: Queryable): Promise<Carrier[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM carriers ORDER BY name, id`);
  return rows.map(toCarrier);
}

/** What the invoice checks about a carrier (rules X04-20, X05-10 and X07-10 of the layout), before the database is touched. */
function checked(input: CarrierInput, updatedBy: string) {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está gravando a transportadora.");
  const document = normalizeDocument(input.document);
  const kind = document.length === 11 ? "PF" : "PJ";
  if (!(kind === "PF" ? isValidCpf(document) : isValidCnpj(document))) throw new CarrierError("CNPJ ou CPF da transportadora inválido. Confira os números.");
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) throw new CarrierError("Nome ou razão social: de 2 a 60 letras.");
  const typed = blank(input.stateRegistration)?.toUpperCase() ?? null;
  const registration = typed === null ? null : typed === "ISENTO" ? "ISENTO" : typed.replace(/\D/g, "");
  if (registration !== null && registration !== "ISENTO" && (registration.length < 2 || registration.length > 14)) throw new CarrierError("Inscrição estadual: só os números, ou ISENTO.");
  const uf = blank(input.uf)?.toUpperCase() ?? null;
  if (uf !== null && !(UFS as readonly string[]).includes(uf)) throw new CarrierError("UF: escolha um estado da lista.");
  if (registration !== null && uf === null) throw new CarrierError("Com inscrição estadual, informe a UF da transportadora: a nota exige.");
  const address = blank(input.address);
  const city = blank(input.city);
  if ((address?.length ?? 0) > 60 || (city?.length ?? 0) > 60) throw new CarrierError("Endereço e município: até 60 letras cada.");
  return [kind, document, name, registration, address, city, uf, updatedBy] as const;
}

export async function createCarrier(input: CarrierInput, updatedBy: string, conn: Queryable): Promise<Carrier> {
  const values = checked(input, updatedBy);
  try {
    const { rows } = await conn.query(
      `INSERT INTO carriers (kind, document, name, state_registration, address, city, uf, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
      [...values],
    );
    return toCarrier(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new CarrierError("Já existe transportadora com este CNPJ ou CPF.");
    throw error;
  }
}

export async function updateCarrier(id: number, input: CarrierInput, updatedBy: string, conn: Queryable): Promise<Carrier> {
  const values = checked(input, updatedBy);
  try {
    const { rows } = await conn.query(
      `UPDATE carriers SET kind = $2, document = $3, name = $4, state_registration = $5, address = $6, city = $7, uf = $8,
              updated_at = now(), updated_by = $9
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, ...values],
    );
    if (!rows[0]) throw new CarrierError("Transportadora não encontrada. Recarregue a página.");
    return toCarrier(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new CarrierError("Já existe transportadora com este CNPJ ou CPF.");
    throw error;
  }
}

/** Removes a carrier no order uses. One used by an order stays: the order goes on saying who carried. */
export async function deleteCarrier(id: number, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query("DELETE FROM carriers WHERE id = $1 RETURNING id", [id]);
    if (!rows[0]) throw new CarrierError("Transportadora não encontrada. Recarregue a página.");
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw new CarrierError("Esta transportadora está em pedido: tire-a dos pedidos antes de remover.");
    throw error;
  }
}

/** The transport of the invoice of one order: who carries and what goes. Everything optional. */
export type OrderTransport = { carrier: Carrier | null; volumes: number | null; volumeKind: string | null; netWeight: number | null; grossWeight: number | null };

export async function loadOrderTransport(orderId: number, conn: Queryable): Promise<OrderTransport> {
  const { rows } = await conn.query(
    `SELECT o.nfe_volumes, o.nfe_volume_kind, o.nfe_net_weight, o.nfe_gross_weight,
            c.id, c.kind, c.document, c.name, c.state_registration, c.address, c.city, c.uf
       FROM orders o LEFT JOIN carriers c ON c.id = o.nfe_carrier_id WHERE o.id = $1`,
    [orderId],
  );
  const row = rows[0];
  if (!row) return { carrier: null, volumes: null, volumeKind: null, netWeight: null, grossWeight: null };
  return {
    carrier: row.id === null ? null : toCarrier(row),
    volumes: row.nfe_volumes === null ? null : Number(row.nfe_volumes),
    volumeKind: text(row.nfe_volume_kind),
    netWeight: row.nfe_net_weight === null ? null : Number(row.nfe_net_weight),
    grossWeight: row.nfe_gross_weight === null ? null : Number(row.nfe_gross_weight),
  };
}

export type OrderTransportInput = { carrierId: number | null; volumes: number | null; volumeKind: string | null; netWeight: number | null; grossWeight: number | null };

/**
 * Writes the transport of the invoice of an order. It is not a commercial term:
 * the order is not reopened and its revision does not change. With an
 * authorised invoice in production there is nothing left to change.
 */
export async function saveOrderTransport(orderId: number, input: OrderTransportInput, conn: Queryable): Promise<void> {
  const positive = (value: number | null, label: string, max: number) => {
    if (value !== null && (!Number.isFinite(value) || value <= 0 || value > max)) throw new CarrierError(`${label}: informe um valor maior que zero.`);
    return value;
  };
  if (input.volumes !== null && !Number.isInteger(input.volumes)) throw new CarrierError("Quantidade de volumes: número inteiro.");
  const kind = blank(input.volumeKind);
  if ((kind?.length ?? 0) > 60) throw new CarrierError("Espécie dos volumes: até 60 letras.");
  const gross = positive(input.grossWeight, "Peso bruto", 99_999_999);
  const net = positive(input.netWeight, "Peso líquido", 99_999_999);
  if (gross !== null && net !== null && net > gross) throw new CarrierError("O peso líquido não pode passar do peso bruto.");
  try {
    const { rows } = await conn.query(
      `UPDATE orders SET nfe_carrier_id = $2, nfe_volumes = $3, nfe_volume_kind = $4, nfe_net_weight = $5, nfe_gross_weight = $6
        WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM fiscal_invoices i WHERE i.order_id = orders.id AND i.status = 'autorizada' AND i.environment = 'producao')
        RETURNING id`,
      [orderId, input.carrierId, positive(input.volumes, "Quantidade de volumes", 999_999), kind, net, gross],
    );
    if (!rows[0]) throw new CarrierError("O pedido já tem nota autorizada: o transporte não muda mais.");
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw new CarrierError("Transportadora não encontrada. Recarregue a página.");
    throw error;
  }
}

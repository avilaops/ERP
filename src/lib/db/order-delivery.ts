import { isValidCnpj, isValidCpf, normalizeDocument } from "@/lib/customer";
import type { Queryable } from "@/lib/db/pool";
import { findCity } from "@/lib/fiscal/cities";
import { UFS } from "@/lib/pricing/states";

/**
 * Where the goods of an order go when it is not the address of the customer's
 * register (group `entrega` of the invoice). `null`: the register's address.
 */
export type OrderDelivery = {
  /** Who receives, when it is not the customer. Blank: the customer. */
  name: string | null;
  /** CNPJ or CPF of who receives, digits only. Blank: the customer's. */
  document: string | null;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  uf: string;
  phone: string | null;
};

/** A refusal the user can act on. The message goes to the screen as it is. */
export class DeliveryError extends Error {}

const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const blank = (value: string | null) => (value?.trim() ? value.trim() : null);
const digits = (value: string | null) => (value ?? "").replace(/\D/g, "");

export async function loadOrderDelivery(orderId: number, conn: Queryable): Promise<OrderDelivery | null> {
  const { rows } = await conn.query(
    `SELECT nfe_delivery_name, nfe_delivery_document, nfe_delivery_cep, nfe_delivery_street, nfe_delivery_number,
            nfe_delivery_complement, nfe_delivery_district, nfe_delivery_city, nfe_delivery_uf, nfe_delivery_phone
       FROM orders WHERE id = $1`,
    [orderId],
  );
  const row = rows[0];
  if (!row || row.nfe_delivery_street === null) return null;
  return {
    name: text(row.nfe_delivery_name),
    document: text(row.nfe_delivery_document),
    cep: String(row.nfe_delivery_cep),
    street: String(row.nfe_delivery_street),
    number: String(row.nfe_delivery_number),
    complement: text(row.nfe_delivery_complement),
    district: String(row.nfe_delivery_district),
    city: String(row.nfe_delivery_city),
    uf: String(row.nfe_delivery_uf),
    phone: text(row.nfe_delivery_phone),
  };
}

/** What was typed, as text. Everything blank takes the order back to the register's address. */
export type OrderDeliveryInput = { [Field in keyof OrderDelivery]: string | null };

/**
 * Writes the place of delivery of the invoice of an order, or clears it. Like
 * the transport, it is not a commercial term: the order is not reopened. With
 * an authorised invoice in production there is nothing left to change.
 */
export async function saveOrderDelivery(orderId: number, input: OrderDeliveryInput, conn: Queryable): Promise<void> {
  const typed = Object.values(input).some((value) => blank(value) !== null);
  let values: (string | null)[] = Array.from({ length: 10 }, () => null);
  if (typed) {
    const problems: string[] = [];
    const sized = (value: string | null, label: string, min: number) => {
      const clean = blank(value);
      if (clean === null || clean.length < min || clean.length > 60) problems.push(`${label}: de ${min} a 60 letras.`);
      return clean;
    };
    const street = sized(input.street, "Rua", 2);
    const number = sized(input.number, "Número", 1);
    const district = sized(input.district, "Bairro", 2);
    const city = sized(input.city, "Cidade", 2);
    const complement = blank(input.complement);
    if ((complement?.length ?? 0) > 60) problems.push("Complemento: até 60 letras.");
    const name = blank(input.name);
    if (name !== null && (name.length < 2 || name.length > 60)) problems.push("Quem recebe: de 2 a 60 letras.");
    const uf = (blank(input.uf) ?? "").toUpperCase();
    if (!(UFS as readonly string[]).includes(uf)) problems.push("Estado: escolha na lista.");
    const cep = digits(input.cep);
    if (cep.length !== 8) problems.push("CEP: oito dígitos.");
    // Rules G07-20 and G07-30 of the layout: the city has to exist in the IBGE table, in that state.
    if (city !== null && (UFS as readonly string[]).includes(uf) && !findCity(city, uf)) problems.push(`Cidade: "${city}" não está na tabela do IBGE para ${uf}. Confira o nome.`);
    const document = blank(input.document) === null ? null : normalizeDocument(input.document ?? "");
    // Rules G02-10 and G02a-10: the document of who receives, when given, has to be a valid one.
    if (document !== null && !(document.length === 11 ? isValidCpf(document) : isValidCnpj(document))) problems.push("CNPJ ou CPF de quem recebe: confira os números.");
    const phone = blank(input.phone) === null ? null : digits(input.phone);
    if (phone !== null && (phone.length < 6 || phone.length > 14)) problems.push("Telefone: de 6 a 14 dígitos, com DDD.");
    if (problems.length > 0) throw new DeliveryError(problems.join(" "));
    values = [name, document, cep, street, number, complement, district, city, uf, phone];
  }
  const { rows } = await conn.query(
    `UPDATE orders
        SET nfe_delivery_name = $2, nfe_delivery_document = $3, nfe_delivery_cep = $4, nfe_delivery_street = $5, nfe_delivery_number = $6,
            nfe_delivery_complement = $7, nfe_delivery_district = $8, nfe_delivery_city = $9, nfe_delivery_uf = $10, nfe_delivery_phone = $11
      WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM fiscal_invoices i WHERE i.order_id = orders.id AND i.status = 'autorizada' AND i.environment = 'producao')
      RETURNING id`,
    [orderId, ...values],
  );
  if (!rows[0]) throw new DeliveryError("O pedido já tem nota autorizada: o local de entrega não muda mais.");
}

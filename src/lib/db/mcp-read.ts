import type { Queryable } from "@/lib/db/pool";

/**
 * What the assistants read of orders and money: lean lists, with sale values
 * only. Nothing here selects a cost, a margin, a supplier price or a discount
 * limit; a test keeps it so. `sellerEmail` null is the whole team.
 */
const iso = (value: unknown) => (value instanceof Date ? value.toISOString().slice(0, 10) : value === null ? null : String(value));

export async function ordersForAssistant(filter: { sellerEmail: string | null; status: string | null; search: string }, conn: Queryable) {
  const { rows } = await conn.query(
    `SELECT o.number, o.status, COALESCE(c.trade_name, c.name) AS customer, o.seller_name, o.created_at, k.closed_at, k.invoice_total,
            (SELECT COALESCE(sum(i.quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS pieces
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id LEFT JOIN order_closings k ON k.order_id = o.id AND k.reopened_at IS NULL
      WHERE ($1::text IS NULL OR o.seller_email = $1) AND ($2::text IS NULL OR o.status = $2)
        AND ($3 = '' OR o.number ILIKE '%' || $3 || '%' OR c.name ILIKE '%' || $3 || '%' OR COALESCE(c.trade_name, '') ILIKE '%' || $3 || '%')
      ORDER BY o.created_at DESC LIMIT 50`,
    [filter.sellerEmail, filter.status, filter.search.replace(/[%_\\]/g, "").slice(0, 80)],
  );
  return rows.map((row) => ({ pedido: String(row.number), situacao: String(row.status), cliente: row.customer === null ? null : String(row.customer), vendedor: String(row.seller_name), criado_em: iso(row.created_at), fechado_em: iso(row.closed_at), valor_da_nota: row.invoice_total === null ? null : Number(row.invoice_total), pecas: Number(row.pieces) }));
}

export async function pendingApprovalsForAssistant(conn: Queryable) {
  const { rows } = await conn.query(
    `SELECT o.number, COALESCE(c.trade_name, c.name) AS customer, o.seller_name, a.requested_at, a.requested_by
       FROM order_approvals a JOIN orders o ON o.id = a.order_id LEFT JOIN customers c ON c.id = o.customer_id WHERE a.status = 'pendente' ORDER BY a.requested_at LIMIT 50`,
  );
  return rows.map((row) => ({ pedido: String(row.number), cliente: row.customer === null ? null : String(row.customer), vendedor: String(row.seller_name), pedido_em: iso(row.requested_at), pedido_por: String(row.requested_by) }));
}

export async function openReceivablesForAssistant(conn: Queryable) {
  const { rows } = await conn.query(
    `SELECT o.number, COALESCE(c.trade_name, c.name) AS customer, r.kind, r.number AS installment, r.due_date::text AS due, r.amount, r.method, (r.due_date < current_date) AS late
       FROM receivables r JOIN orders o ON o.id = r.order_id LEFT JOIN customers c ON c.id = o.customer_id WHERE r.status = 'aberta' ORDER BY r.due_date, r.id LIMIT 100`,
  );
  return rows.map((row) => ({ pedido: String(row.number), cliente: row.customer === null ? null : String(row.customer), tipo: String(row.kind), parcela: Number(row.installment), vence_em: String(row.due), valor: Number(row.amount), forma: row.method === null ? null : String(row.method), atrasada: row.late === true }));
}

export async function openPayablesForAssistant(conn: Queryable) {
  const { rows } = await conn.query(
    `SELECT p.description, s.name AS supplier, p.category, p.due_date::text AS due, p.amount, (p.due_date < current_date) AS late
       FROM payables p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.status = 'aberta' ORDER BY p.due_date, p.id LIMIT 100`,
  );
  return rows.map((row) => ({ descricao: String(row.description), fornecedor: row.supplier === null ? null : String(row.supplier), categoria: row.category === null ? null : String(row.category), vence_em: String(row.due), valor: Number(row.amount), atrasada: row.late === true }));
}

export async function customersForAssistant(search: string, conn: Queryable) {
  const { rows } = await conn.query(
    `SELECT c.id, c.name, c.trade_name, c.city, c.uf, c.phone, c.email, c.contact_name FROM customers c
      WHERE $1 = '' OR c.name ILIKE '%' || $1 || '%' OR COALESCE(c.trade_name, '') ILIKE '%' || $1 || '%' OR c.document LIKE $1 || '%' OR COALESCE(c.city, '') ILIKE '%' || $1 || '%'
      ORDER BY lower(c.name) LIMIT 25`,
    [search.replace(/[%_\\]/g, "").slice(0, 80)],
  );
  return rows.map((row) => ({ id: Number(row.id), nome: String(row.name), fantasia: row.trade_name === null ? null : String(row.trade_name), cidade: row.city === null ? null : String(row.city), uf: row.uf === null ? null : String(row.uf), telefone: row.phone === null ? null : String(row.phone), email: row.email === null ? null : String(row.email), contato: row.contact_name === null ? null : String(row.contact_name) }));
}

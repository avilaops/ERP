import type { Queryable } from "@/lib/db/pool";
import { listAllPaymentMethods } from "@/lib/db/payment-methods";
import { listPayableCategories } from "@/lib/db/payable-categories";

export async function payableChoicesForMcp(conn: Queryable, lock = false) {
  if (lock) {
    await conn.query("SELECT id FROM payable_categories WHERE active FOR SHARE");
    await conn.query("SELECT id FROM payment_methods WHERE active FOR SHARE");
    await conn.query("SELECT id FROM suppliers WHERE active FOR SHARE");
  }
  const { rows } = await conn.query("SELECT id, COALESCE(trade_name, name) AS name FROM suppliers WHERE active ORDER BY id");
  return { categories: await listPayableCategories(conn), methods: (await listAllPaymentMethods(conn)).filter((m) => m.active && !m.onDelivery).map((m) => m.label), suppliers: rows.map((r) => ({ id: Number(r.id), nome: String(r.name) })) };
}

/** Public catalogue projection: never selects supplier prices, credits or equipment costs. */
export async function catalogueForMcp(search: string, page: number, conn: Queryable) {
  const { rows } = await conn.query(
    `SELECT p.id, p.code, p.name, p.plate_loaded, l.name AS line, v.version, i.table_price, i.table_price_with_ipi,
            COALESCE((SELECT sum(m.quantity) FROM stock_moves m WHERE m.product_id = p.id), 0) AS physical,
            COALESCE((SELECT sum(d.quantity) FROM order_items d JOIN orders o ON o.id = d.order_id WHERE d.product_id = p.id AND o.status = 'fechado'
              AND NOT EXISTS (SELECT 1 FROM stock_moves m WHERE m.order_id = o.id GROUP BY m.order_id HAVING sum(m.quantity) < 0)), 0) AS committed,
            COALESCE((SELECT sum(d.quantity) FROM purchase_items d JOIN purchases b ON b.id = d.purchase_id WHERE d.product_id = p.id AND b.status IN ('pedido','em_transito')), 0) AS incoming
       FROM products p JOIN product_lines l ON l.id = p.line_id
       JOIN LATERAL (SELECT version FROM price_table_versions WHERE line_id = p.line_id ORDER BY version DESC LIMIT 1) v ON true
       JOIN price_table_items i ON i.version = v.version AND i.product_id = p.id
      WHERE p.active AND ($1 = '' OR p.name ILIKE '%' || $1 || '%' OR p.code ILIKE '%' || $1 || '%')
      ORDER BY p.id LIMIT 51 OFFSET $2`, [search.replace(/[%_\\]/g, ""), (page - 1) * 50],
  );
  return { pagina: page, tem_mais: rows.length > 50, criterio_prazo: "Prazo de fabricação definido pelo vendedor no pedido; o catálogo não tem prazo por produto.", produtos: rows.slice(0, 50).map((r) => ({ id: Number(r.id), codigo: r.code, nome: r.name, aceita_anilheiro: r.plate_loaded === true, linha: r.line, tabela: Number(r.version), preco_sem_ipi: Number(r.table_price), preco_com_ipi: Number(r.table_price_with_ipi), estoque_fisico: Number(r.physical), comprometido: Number(r.committed), disponivel: Number(r.physical) - Number(r.committed), a_chegar: Number(r.incoming) })) };
}

export async function productionForMcp(orderId: number, conn: Queryable) {
  const { rows } = await conn.query(
    `SELECT w.number, p.code, p.name, w.quantity, s.name AS stage, s.kind, w.due_on::text AS due, w.finished_at
       FROM production_orders w JOIN products p ON p.id = w.product_id JOIN production_stages s ON s.id = w.stage_id
      WHERE w.order_id = $1 ORDER BY w.id`, [orderId],
  );
  return rows.map((r) => ({ ordem: r.number, codigo: r.code, produto: r.name, quantidade: Number(r.quantity), etapa: r.stage, pronta: r.kind === "pronta", previsao_fim_fabricacao: r.due, concluida_em: r.finished_at }));
}

export async function shipmentForMcp(orderId: number, conn: Queryable) {
  const { rows } = await conn.query("SELECT COALESCE(sum(quantity), 0) < 0 AS shipped, max(created_at) AS last_move FROM stock_moves WHERE order_id = $1", [orderId]);
  return { expedido: rows[0].shipped === true, ultima_movimentacao_estoque: rows[0].last_move };
}

export async function deliveriesForMcp(from: string, to: string, page: number, conn: Queryable) {
  const { rows } = await conn.query(
    `WITH queue AS (
       SELECT o.number, COALESCE(c.trade_name, c.name) AS customer, o.delivery_uf,
              (SELECT max(p.due_on) FROM production_orders p WHERE p.order_id = o.id) AS production_due,
              (SELECT count(*) FROM production_orders p JOIN production_stages s ON s.id = p.stage_id WHERE p.order_id = o.id AND s.kind <> 'pronta') AS unfinished,
              (SELECT count(*) FROM production_orders p WHERE p.order_id = o.id) AS production_count,
              COALESCE((SELECT sum(m.quantity) FROM stock_moves m WHERE m.order_id = o.id), 0) < 0 AS shipped,
              (SELECT max(m.created_at) FROM stock_moves m WHERE m.order_id = o.id) AS last_move
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.status = 'fechado'
     ) SELECT number, customer, delivery_uf, production_due::text, unfinished, production_count, shipped, last_move,
              production_due < $1::date AS overdue_before_period
         FROM queue WHERE (NOT shipped AND (production_due <= $2::date OR production_due IS NULL))
           OR (shipped AND (last_move AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date)
         ORDER BY shipped, production_due NULLS LAST, number LIMIT 51 OFFSET $3`, [from, to, (page - 1) * 50],
  );
  return { pagina: page, tem_mais: rows.length > 50, agenda_transporte_disponivel: false, criterio: "O ERP registra expedição e prazo da produção; não tem data agendada de transporte. Prazo de fabricação não é data de entrega. Inclui pendentes até o fim do período, sem data e atrasados anteriores ao início.", pedidos: rows.slice(0, 50).map((r) => ({ pedido: r.number, cliente: r.customer, uf: r.delivery_uf, previsao_fim_fabricacao: r.production_due, fabricacao_cadastrada: Number(r.production_count) > 0, fabricacao_concluida: Number(r.production_count) > 0 && Number(r.unfinished) === 0, prazo_anterior_ao_periodo: r.overdue_before_period === true, expedido: r.shipped === true, ultima_movimentacao_estoque: r.last_move })) };
}

export async function receivableForMcp(id: number, conn: Queryable) {
  const { rows } = await conn.query(
    `SELECT r.id, o.number, COALESCE(c.trade_name, c.name) AS customer, r.kind, r.number AS installment, r.due_date::text AS due, r.method,
            r.amount - COALESCE((SELECT sum(p.amount) FROM receipts p WHERE p.receivable_id = r.id AND NOT EXISTS (SELECT 1 FROM refund_requests q WHERE q.receipt_id = p.id AND q.status = 'confirmada')), 0) AS open
       FROM receivables r JOIN orders o ON o.id = r.order_id LEFT JOIN customers c ON c.id = o.customer_id
      WHERE r.id = $1 AND r.status = 'aberta' AND o.status = 'fechado'`, [id],
  );
  return rows[0] ?? null;
}

export async function payableStateForMcp(id: number, conn: Queryable, lock = false) {
  if (lock) await conn.query("SELECT id FROM payables WHERE id = $1 FOR UPDATE", [id]);
  const { rows } = await conn.query("SELECT id, description, amount, category, due_date::text AS due, status, updated_at::text AS revision FROM payables WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/** Group by stable customer/seller identities; names are labels and never grouping keys. */
export async function arrearsForMcp(today: string, conn: Queryable) {
  const { rows } = await conn.query(
    `SELECT c.id AS customer_id, c.name AS customer, o.seller_email, max(o.seller_name) AS seller_name,
            sum(r.amount - COALESCE((SELECT sum(p.amount) FROM receipts p WHERE p.receivable_id = r.id AND NOT EXISTS (SELECT 1 FROM refund_requests q WHERE q.receipt_id = p.id AND q.status = 'confirmada')), 0)) AS open,
            count(*) AS installments, min(r.due_date)::text AS oldest
       FROM receivables r JOIN orders o ON o.id = r.order_id LEFT JOIN customers c ON c.id = o.customer_id
      WHERE r.status = 'aberta' AND o.status = 'fechado' AND r.due_date < $1::date
      GROUP BY c.id, c.name, o.seller_email ORDER BY open DESC, c.id, o.seller_email`, [today],
  );
  return rows.map((r) => ({ cliente_id: r.customer_id === null ? null : Number(r.customer_id), cliente: r.customer, vendedor_email: r.seller_email, vendedor: r.seller_name, saldo_atrasado: Number(r.open), parcelas: Number(r.installments), primeiro_vencimento: r.oldest }));
}

export async function salesForMcp(from: string, to: string, group: string, conn: Queryable) {
  // Only one row per order in base; product revenue uses rounded sale lines from the frozen table.
  const { rows } = await conn.query(
    `WITH base AS (
       SELECT o.id, o.number, o.seller_email, o.seller_name, o.delivery_uf,
              to_char(o.closed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month,
              (SELECT k.invoice_total FROM order_closings k WHERE k.order_id = o.id AND k.reopened_at IS NULL ORDER BY k.id DESC LIMIT 1) AS total,
              o.discount, v.ipi FROM orders o JOIN price_table_versions v ON v.version = o.price_table_version
        WHERE o.status = 'fechado' AND (o.closed_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date
     ), lines AS (
       SELECT b.id, CASE $3 WHEN 'vendedor' THEN b.seller_email WHEN 'regiao' THEN COALESCE(b.delivery_uf, 'sem_uf') WHEN 'produto' THEN i.product_id::text ELSE b.month END AS key,
              CASE $3 WHEN 'vendedor' THEN b.seller_name WHEN 'regiao' THEN COALESCE(b.delivery_uf, 'Sem UF') WHEN 'produto' THEN p.name ELSE b.month END AS label,
              CASE WHEN $3 = 'produto' THEN i.quantity END AS pieces,
              CASE WHEN $3 = 'produto' THEN round(p.table_price * (1 - b.discount) * (1 + b.ipi) * i.quantity, 2) ELSE b.total END AS value
         FROM base b LEFT JOIN order_items i ON $3 = 'produto' AND i.order_id = b.id
         LEFT JOIN price_table_items p ON p.product_id = i.product_id AND p.version = i.price_table_version
     ) SELECT key, max(label) AS label, count(DISTINCT id) AS orders, COALESCE(sum(value),0) AS total, sum(pieces) AS pieces,
              count(*) FILTER (WHERE value IS NULL) AS missing
         FROM lines GROUP BY key ORDER BY total DESC, key`, [from, to, group],
  );
  return rows.map((r) => ({ chave: r.key, grupo: r.label, pedidos: Number(r.orders), valor_com_ipi: Number(r.total), pecas: r.pieces === null ? null : Number(r.pieces), registros_sem_fechamento: Number(r.missing) }));
}

export async function conversionForMcp(from: string, to: string, conn: Queryable) {
  const { rows } = await conn.query(
    `SELECT s.kind, count(*) AS n, COALESCE(o.lost_reason, 'Sem motivo informado') AS reason
       FROM opportunities o JOIN pipeline_stages s ON s.id = o.stage_id
      WHERE (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date
      GROUP BY s.kind, COALESCE(o.lost_reason, 'Sem motivo informado') ORDER BY s.kind, reason`, [from, to],
  );
  const sum = (kind: string) => rows.filter((r) => r.kind === kind).reduce((n, r) => n + Number(r.n), 0);
  const won = sum("ganha"), lost = sum("perdida");
  return { criadas: sum("aberta") + won + lost, abertas: sum("aberta"), ganhas: won, perdidas: lost, taxa_fechamento: won + lost ? won / (won + lost) : null, motivos_perda: rows.filter((r) => r.kind === "perdida").map((r) => ({ motivo: r.reason, quantidade: Number(r.n) })) };
}

/** No heuristic deletes: suspicious means an explicit reason for human review. */
export async function suspiciousForMcp(page: number, conn: Queryable) {
  const { rows } = await conn.query(
    `SELECT o.number, o.status, c.name AS customer, o.seller_name,
            ARRAY_REMOVE(ARRAY[
              CASE WHEN o.status = 'em_negociacao' THEN 'Em negociação: revisar se é rascunho' END,
              CASE WHEN o.customer_id IS NULL THEN 'Sem cliente' END,
              CASE WHEN NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id) THEN 'Sem itens' END,
              CASE WHEN concat_ws(' ',o.notes,c.name,c.trade_name) ~* '(^|[^[:alnum:]])(teste|demo|demonstração|exemplo)([^[:alnum:]]|$)' THEN 'Texto menciona teste/demo/exemplo: conferir' END
            ], NULL) AS reasons
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.status = 'em_negociacao' OR o.customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)
         OR concat_ws(' ',o.notes,c.name,c.trade_name) ~* '(^|[^[:alnum:]])(teste|demo|demonstração|exemplo)([^[:alnum:]]|$)'
      ORDER BY o.id DESC LIMIT 51 OFFSET $1`, [(page - 1) * 50],
  );
  return { pagina: page, tem_mais: rows.length > 50, criterio: "Sinais para revisão humana, sem concluir que houve fraude e sem alterar pedidos.", pedidos: rows.slice(0, 50).map((r) => ({ pedido: r.number, situacao: r.status, cliente: r.customer, vendedor: r.seller_name, motivos: r.reasons })) };
}

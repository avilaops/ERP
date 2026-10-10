import type { Queryable } from "@/lib/db/pool";

export const TIMELINE_KINDS = { pedido: "Pedido", contrato: "Contrato", nota: "Nota fiscal", recebimento: "Recebimento", oportunidade: "Funil", atividade: "Atividade", email: "E-mail", reuniao: "Reunião" } as const;
export type TimelineKind = keyof typeof TIMELINE_KINDS;

export type TimelineEntry = {
  at: Date;
  kind: TimelineKind;
  title: string;
  detail: string | null;
  /** A sale value, when the entry has one. Never a cost. */
  amount: number | null;
  /** Where the entry leads: the number of an order, or the id of an opportunity. */
  orderNumber: string | null;
  opportunityId: number | null;
};

/** Whose sales the reader reaches (`null` is all) and whether they see what was received. */
export type TimelineScope = { sellerEmail: string | null; receipts: boolean };

/**
 * What happened with one customer, the newest first: orders, contracts,
 * invoices, what was received, and from the funnel the opportunities, what was
 * done on them, the e-mails and the meetings. The register of a customer is of
 * the whole team, but the sales are of each seller: a seller reads here only
 * their own orders and opportunities. Receipts are for who has that screen.
 */
export async function customerTimeline(customerId: number, scope: TimelineScope, conn: Queryable): Promise<TimelineEntry[]> {
  const { rows } = await conn.query(
    `WITH sales AS (SELECT o.id, o.number, o.seller_name, o.status, o.created_at, o.updated_at FROM orders o WHERE o.customer_id = $1 AND ($2::text IS NULL OR o.seller_email = $2)),
          leads AS (SELECT p.id, p.title, p.source, p.owner_name, p.created_at, p.closed_at, p.lost_reason, s.kind AS stage_kind
                      FROM opportunities p JOIN pipeline_stages s ON s.id = p.stage_id WHERE p.customer_id = $1 AND ($2::text IS NULL OR p.owner_email = $2))
     SELECT e.at, e.kind, e.title, e.detail, e.amount, e.order_number, e.opportunity_id FROM (
       SELECT created_at AS at, 'pedido' AS kind, 'Pedido #' || number || ' criado' AS title, 'por ' || seller_name AS detail, NULL::numeric AS amount, number AS order_number, NULL::integer AS opportunity_id FROM sales
       UNION ALL SELECT c.closed_at, 'pedido', 'Pedido #' || s.number || ' fechado', 'por ' || c.closed_by, c.invoice_total, s.number, NULL FROM order_closings c JOIN sales s ON s.id = c.order_id
       UNION ALL SELECT c.reopened_at, 'pedido', 'Pedido #' || s.number || ' reaberto', 'por ' || c.reopened_by, NULL, s.number, NULL FROM order_closings c JOIN sales s ON s.id = c.order_id WHERE c.reopened_at IS NOT NULL
       UNION ALL SELECT updated_at, 'pedido', 'Pedido #' || number || CASE status WHEN 'perdido' THEN ' perdido' ELSE ' cancelado' END, NULL, NULL, number, NULL FROM sales WHERE status IN ('perdido', 'cancelado')
       UNION ALL SELECT k.created_at, 'contrato', 'Contrato do pedido #' || s.number || ' enviado', 'para ' || k.recipient_email, NULL, s.number, NULL FROM order_contracts k JOIN sales s ON s.id = k.order_id
       UNION ALL SELECT k.signed_at, 'contrato', 'Contrato do pedido #' || s.number || ' assinado', 'por ' || k.signer_name, NULL, s.number, NULL FROM order_contracts k JOIN sales s ON s.id = k.order_id WHERE k.signed_at IS NOT NULL
       UNION ALL SELECT k.refused_at, 'contrato', 'Contrato do pedido #' || s.number || ' recusado', k.refusal_reason, NULL, s.number, NULL FROM order_contracts k JOIN sales s ON s.id = k.order_id WHERE k.refused_at IS NOT NULL
       UNION ALL SELECT f.issued_at, 'nota', 'Nota fiscal nº ' || f.number || ' ' || f.status, 'pedido #' || s.number, NULL, s.number, NULL FROM fiscal_invoices f JOIN sales s ON s.id = f.order_id WHERE f.status <> 'assinada'
       UNION ALL SELECT m.sent_at, 'email', CASE m.kind WHEN 'cancelamento' THEN 'Cancelamento da nota' ELSE 'Nota fiscal' END || ' nº ' || f.number || ' por e-mail', 'para ' || m.recipient || CASE m.status WHEN 'falhou' THEN ' (não saiu)' ELSE '' END, NULL, s.number, NULL
                   FROM fiscal_invoice_mails m JOIN fiscal_invoices f ON f.id = m.invoice_id JOIN sales s ON s.id = f.order_id
       UNION ALL SELECT t.recorded_at, 'recebimento', 'Recebimento do pedido #' || s.number, t.method, t.amount, s.number, NULL FROM receipts t JOIN receivables r ON r.id = t.receivable_id JOIN sales s ON s.id = r.order_id WHERE $3
       UNION ALL SELECT created_at, 'oportunidade', 'Oportunidade criada: ' || title, COALESCE('origem: ' || source || ' · ', '') || 'de ' || owner_name, NULL, NULL, id FROM leads
       UNION ALL SELECT closed_at, 'oportunidade', 'Oportunidade ' || CASE stage_kind WHEN 'ganha' THEN 'ganha: ' ELSE 'perdida: ' END || title, lost_reason, NULL, NULL, id FROM leads WHERE closed_at IS NOT NULL AND stage_kind <> 'aberta'
       UNION ALL SELECT COALESCE(a.done_at, a.created_at), 'atividade', a.title, l.title, NULL, NULL, l.id FROM opportunity_activities a JOIN leads l ON l.id = a.opportunity_id WHERE a.done_at IS NOT NULL OR a.kind = 'nota'
       UNION ALL SELECT g.sent_at, 'email', 'E-mail: ' || g.subject, 'para ' || g.recipient || CASE g.status WHEN 'falhou' THEN ' (não saiu)' ELSE '' END, NULL, NULL, l.id FROM opportunity_messages g JOIN leads l ON l.id = g.opportunity_id
       UNION ALL SELECT t.starts_at, 'reuniao', 'Reunião: ' || t.title, CASE t.status WHEN 'cancelada' THEN 'cancelada' ELSE t.minutes || ' minutos' END, NULL, NULL, l.id FROM opportunity_meetings t JOIN leads l ON l.id = t.opportunity_id
     ) e ORDER BY e.at DESC, e.title LIMIT 500`,
    [customerId, scope.sellerEmail, scope.receipts],
  );
  return rows.map((row) => ({
    at: row.at as Date, kind: row.kind as TimelineKind, title: String(row.title), detail: row.detail === null ? null : String(row.detail), amount: row.amount === null ? null : Number(row.amount),
    orderNumber: row.order_number === null ? null : String(row.order_number), opportunityId: row.opportunity_id === null ? null : Number(row.opportunity_id),
  }));
}

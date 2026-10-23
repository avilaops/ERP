import type { Queryable } from "@/lib/db/pool";

/** Read-only diagnosis for director review. Never changes a sale or finance record. */
export type OrderFinanceDiagnosis = {
  number: string;
  status: string;
  counts: Record<string, number>;
  allowed: boolean;
  reasons: string[];
};

export async function diagnoseOrderFinance(number: string, conn: Queryable): Promise<OrderFinanceDiagnosis | null> {
  const { rows } = await conn.query(`
    SELECT o.number, o.status,
      (SELECT count(*)::int FROM receivables r WHERE r.order_id=o.id) receivables,
      (SELECT count(*)::int FROM receipts p JOIN receivables r ON r.id=p.receivable_id WHERE r.order_id=o.id) receipts,
      (SELECT count(*)::int FROM commissions c JOIN receipts p ON p.id=c.receipt_id JOIN receivables r ON r.id=p.receivable_id WHERE r.order_id=o.id) commissions,
      (SELECT count(*)::int FROM refund_requests q WHERE q.order_id=o.id) refund_requests,
      (SELECT count(*)::int FROM refunds f WHERE f.order_id=o.id) refunds,
      (SELECT count(*)::int FROM payables b WHERE b.order_id=o.id) payables,
      (SELECT count(*)::int FROM fiscal_invoices i WHERE i.order_id=o.id) invoices,
      (SELECT count(*)::int FROM fiscal_jobs j WHERE j.order_id=o.id) fiscal_jobs,
      (SELECT count(*)::int FROM order_contracts k WHERE k.order_id=o.id AND k.status='assinado') signed_contracts,
      (SELECT count(*)::int FROM production_orders w WHERE w.order_id=o.id) production_orders
    FROM orders o WHERE o.number=$1
  `, [number]);
  const row = rows[0];
  if (!row) return null;
  const keys = ["receivables","receipts","commissions","refund_requests","refunds","payables","invoices","fiscal_jobs","signed_contracts","production_orders"] as const;
  const counts = Object.fromEntries(keys.map((key) => [key, Number(row[key])])) as Record<string, number>;
  const reasons: string[] = [];
  if (counts.receipts || counts.refund_requests || counts.refunds || counts.commissions) reasons.push("Há movimentos financeiros: conferir baixas, estornos e comissões; não apagar lançamentos reais.");
  if (counts.payables) reasons.push("Há contas a pagar vinculadas: conferir liquidação antes de qualquer cancelamento.");
  if (counts.invoices || counts.fiscal_jobs) reasons.push("Há documento ou processamento fiscal: preservar histórico e verificar eventos na SEFAZ.");
  if (counts.signed_contracts) reasons.push("Há contrato assinado: preservar documento e evidência.");
  if (counts.production_orders) reasons.push("Há produção vinculada: conferir materiais, estoque e apontamentos.");
  if (String(row.status) === "fechado") reasons.push("Pedido fechado: a exclusão direta está bloqueada pela política atual.");
  return { number: String(row.number), status: String(row.status), counts, allowed: reasons.length === 0 && String(row.status) === "em_negociacao", reasons };
}

import { createHash } from "node:crypto";
import { getOrder, loadOrderStanding, orderSignature, OrderError } from "@/lib/db/orders";
import type { OrderScope } from "@/lib/db/orders";
import { loadPublishedTable } from "@/lib/db/price-table";
import { loadClosingProposal } from "@/lib/db/proposal-details";
import type { Queryable } from "@/lib/db/pool";
import { closingProblems, saleOf } from "@/lib/order-quote";

export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** A preview also depends on the customer, commercial terms and company policy. */
export async function commercialContext(number: string, scope: OrderScope, conn: Queryable, lock = false) {
  if (lock) await conn.query("SELECT id FROM orders WHERE number=$1 AND ($2::text IS NULL OR seller_email=$2) FOR UPDATE", [number, scope.sellerEmail]);
  if (lock) await conn.query("SELECT id FROM company_settings FOR SHARE");
  const company = await conn.query("SELECT updated_at::text AS revision, proposal_details_revision::text AS proposal_revision FROM company_settings");
  if (lock) await conn.query("SELECT id FROM customers WHERE id=(SELECT customer_id FROM orders WHERE number=$1 AND ($2::text IS NULL OR seller_email=$2)) FOR SHARE", [number, scope.sellerEmail]);
  const order = await getOrder(number, scope, conn);
  if (!order) throw new OrderError("Pedido não encontrado.");
  const customer = order.customer ? await conn.query("SELECT updated_at::text AS revision FROM customers WHERE id=$1", [order.customer.id]) : null;
  const proposal = await loadClosingProposal(order.id, conn);
  return { order, proposal, fingerprint: digest({ revision: order.revision, customer: customer?.rows[0], customerData: order.customer, company: company.rows[0], proposal }) };
}

/** Unlike closing, a request ALWAYS waits; it never confirms a sale automatically. */
export async function requestApprovalForMcp(number: string, scope: OrderScope, actor: string, conn: Queryable) {
  const { order, proposal } = await commercialContext(number, scope, conn);
  if (order.status !== "em_negociacao" || !order.items.length) throw new OrderError("Só orçamento em negociação e com itens pode ir para aprovação.");
  const table = await loadPublishedTable(order.priceTableVersion, conn);
  if (!table) throw new OrderError("Tabela do pedido não encontrada.");
  const missing = [...closingProblems(order, saleOf(order, table)), ...proposal.missing];
  if (missing.length) throw new OrderError(missing.join(" "));
  const standing = await loadOrderStanding(order, conn);
  const reasons = standing.policy?.reasons.length ? standing.policy.reasons : ["solicitacao-manual"];
  const { rows } = await conn.query(`WITH target AS (
      UPDATE orders SET status='aguardando_aprovacao', updated_at=now(), updated_by=$3
       WHERE id=$1 AND status='em_negociacao' AND updated_at::text=$2
         AND proposal_details_revision=$6::bigint
         AND EXISTS (SELECT 1 FROM company_settings WHERE proposal_details_revision=$7::bigint)
       RETURNING id
    ) INSERT INTO order_approvals (order_id, requested_by, revision_hash, reasons)
      SELECT id,$3,$4,$5::text[] FROM target RETURNING id`,
  [order.id, order.revision, actor, orderSignature(order), reasons, proposal.orderRevision, proposal.companyRevision]);
  if (!rows.length) throw new OrderError("O pedido mudou. Peça nova prévia.");
  return { pedido: number, situacao: "aguardando_aprovacao", motivos: reasons };
}

/** Caller holds the parent order row until cancellation commits. No history is deleted. */
export async function cancellationProblems(orderId: number, conn: Queryable) {
  const { rows } = await conn.query(`SELECT ARRAY_REMOVE(ARRAY[
    CASE WHEN EXISTS (SELECT 1 FROM receipts p JOIN receivables r ON r.id=p.receivable_id WHERE r.order_id=$1) THEN 'Há recebimento registrado, mesmo que estornado.' END,
    CASE WHEN EXISTS (SELECT 1 FROM refund_requests WHERE order_id=$1) THEN 'Há solicitação de estorno.' END,
    CASE WHEN EXISTS (SELECT 1 FROM fiscal_invoices WHERE order_id=$1) THEN 'Há tentativa de nota fiscal.' END,
    CASE WHEN EXISTS (SELECT 1 FROM order_contracts WHERE order_id=$1 AND status IN ('enviado','assinado')) THEN 'Há contrato ativo ou assinado.' END,
    CASE WHEN EXISTS (SELECT 1 FROM production_orders WHERE order_id=$1) THEN 'Há produção vinculada.' END,
    CASE WHEN EXISTS (SELECT 1 FROM stock_moves WHERE order_id=$1) THEN 'Há movimentação de estoque.' END,
    CASE WHEN EXISTS (SELECT 1 FROM payables WHERE order_id=$1) THEN 'Há conta a pagar vinculada.' END
  ],NULL) AS problems`, [orderId]);
  return rows[0].problems as string[];
}

export async function cancelForMcp(number: string, scope: OrderScope, reason: string, actor: { email: string; role: "DIRETORIA" | "GERENTE_COMERCIAL" }, conn: Queryable) {
  reason = reason.trim();
  if (!actor.email.trim() || reason.length < 5 || reason.length > 300) throw new OrderError("Informe autor e motivo de cancelamento de 5 a 300 caracteres.");
  const { order } = await commercialContext(number, scope, conn, true);
  if (!["em_negociacao", "aguardando_aprovacao", "fechado"].includes(order.status)) throw new OrderError("Este pedido já está cancelado ou perdido.");
  const problems = await cancellationProblems(order.id, conn);
  if (problems.length) throw new OrderError(`Cancelamento bloqueado. ${problems.join(" ")}`);
  await conn.query("UPDATE orders SET status='cancelado', closed_at=NULL, cancel_reason=$2, updated_at=now(), updated_by=$3, nfe_rules_revision=nfe_rules_revision+1 WHERE id=$1", [order.id, reason, actor.email]);
  await conn.query("UPDATE receivables SET status='cancelada',updated_at=now(),updated_by=$2 WHERE order_id=$1 AND status='aberta'", [order.id, actor.email]);
  await conn.query("UPDATE order_approvals SET status='reprovado',decided_at=now(),decided_by=$2,decided_role=$3,comment=$4 WHERE order_id=$1 AND status='pendente'", [order.id, actor.email, actor.role, `Pedido cancelado: ${reason}`]);
  return { cancelado: true, pedido: number, motivo: reason, registrado_por: actor.email };
}

/** Exact pending tasks only. The oldest stays pending; completed records never join. */
export async function duplicateTasksForMcp(ownerEmail: string | null, conn: Queryable, lock = false) {
  if (lock) {
    await conn.query("SELECT id FROM orders WHERE id IN (SELECT order_id FROM opportunity_activities WHERE kind='tarefa' AND done_at IS NULL) AND ($1::text IS NULL OR seller_email=$1) ORDER BY id FOR SHARE", [ownerEmail]);
    await conn.query("SELECT id FROM opportunities WHERE id IN (SELECT opportunity_id FROM opportunity_activities WHERE kind='tarefa' AND done_at IS NULL) AND ($1::text IS NULL OR owner_email=$1) ORDER BY id FOR SHARE", [ownerEmail]);
    await conn.query(`SELECT a.id FROM opportunity_activities a LEFT JOIN opportunities o ON o.id=a.opportunity_id LEFT JOIN orders d ON d.id=a.order_id
      WHERE a.kind='tarefa' AND a.done_at IS NULL AND ($1::text IS NULL OR COALESCE(o.owner_email,d.seller_email,a.owner_email)=$1)
      ORDER BY a.id FOR UPDATE OF a`, [ownerEmail]);
  }
  const { rows } = await conn.query(`SELECT a.id, a.opportunity_id, a.order_id, a.title, a.due_on::text AS due,
      a.owner_email, a.auto_key, a.created_at::text AS created,
      COALESCE(o.owner_email,d.seller_email,a.owner_email) AS owner
    FROM opportunity_activities a LEFT JOIN opportunities o ON o.id=a.opportunity_id LEFT JOIN orders d ON d.id=a.order_id
    WHERE a.kind='tarefa' AND a.done_at IS NULL
      AND ($1::text IS NULL OR COALESCE(o.owner_email,d.seller_email,a.owner_email)=$1)
    ORDER BY a.id`, [ownerEmail]);
  const seen = new Map<string, number>();
  const duplicates = [];
  for (const r of rows) {
    const key = JSON.stringify([r.opportunity_id,r.order_id,r.title,r.due,r.owner_email]);
    const original = seen.get(key);
    if (original === undefined) seen.set(key, Number(r.id));
    else duplicates.push({ id: Number(r.id), manter: original, oportunidade_id: r.opportunity_id, pedido_id: r.order_id, texto: r.title, para: r.due, responsavel: r.owner, automatica: r.auto_key !== null, criada_em: r.created });
  }
  if (duplicates.length > 100) throw new OrderError("Há mais de 100 duplicadas. Revise por responsável antes de consolidar.");
  return duplicates;
}

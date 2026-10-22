import { loadCommissionDay } from "@/lib/db/company";
import { settleConsumption } from "@/lib/db/materials";
import { OrderError } from "@/lib/db/orders";
import type { OrderScope } from "@/lib/db/orders";
import { withQueryableConnection } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { commissionCompetence, commissionPaymentDate } from "@/lib/pricing/commission";
import { parseDate } from "@/lib/pricing/payment";

const ORDER_NUMBER = /^[0-9]{6}-[A-Z0-9]{4}$/;

/** What the closed-order cancellation changed. History stays; nothing is deleted. */
export type ClosedOrderCancellation = {
  orderNumber: string;
  receivablesCancelled: number;
  refundsConfirmed: number;
  commissionsReversed: number;
  payablesCancelled: number;
  payablesKept: number;
  productionCancelled: number;
  fiscalCancellationQueued: boolean;
  stockReversed: number;
  contractsWithdrawn: number;
};

type ReceiptRow = {
  id: number;
  receivable_id: number;
  amount: string;
  amount_without_ipi: string;
  commission_id: number | null;
  rate: string | null;
  commission_amount: string | null;
  base_amount: string | null;
  paid_at: Date | null;
  cancelled_at: Date | null;
};

/**
 * Cancels one closed order and its financial, fiscal and production consequences
 * in a single transaction. A failure after the first write rolls every step back.
 * Receipts, invoices and signed contracts stay on record. An authorised invoice
 * is queued for cancellation and is not marked cancelled here: that only happens
 * when the tax authority answers. No document is sent from this function.
 */
export async function cancelClosedOrder(
  number: string,
  scope: OrderScope,
  reason: string,
  actor: { email: string; role: "DIRETORIA" },
  today: string,
  conn: Queryable,
): Promise<ClosedOrderCancellation> {
  const cleanReason = reason.trim();
  if (!ORDER_NUMBER.test(number)) throw new OrderError("Número de pedido fora do formato AAMMDD-XXXX.");
  if (actor.role !== "DIRETORIA" || actor.email.trim() === "") throw new OrderError("Somente a Diretoria cancela um pedido fechado por esta operação.");
  if (cleanReason.length < 15 || cleanReason.length > 300) throw new OrderError("Informe o motivo do cancelamento com 15 a 300 caracteres.");
  parseDate(today);

  return withQueryableConnection(conn, async (held) => {
    await held.query("BEGIN");
    try {
      const locked = await held.query(
        `SELECT id, seller_email FROM orders
          WHERE number = $1 AND status = 'fechado' AND ($2::text IS NULL OR seller_email = $2)
          FOR UPDATE`,
        [number, scope.sellerEmail],
      );
      const order = locked.rows[0];
      if (!order) throw new OrderError("Pedido não encontrado ou não está fechado.");
      const orderId = Number(order.id);
      const sellerEmail = String(order.seller_email);

      const fiscal = await held.query(
        "SELECT status FROM fiscal_jobs WHERE order_id = $1 AND status IN ('pendente', 'processando') FOR UPDATE",
        [orderId],
      );
      if (fiscal.rows.some((row) => row.status === "processando")) {
        throw new OrderError("Há uma operação fiscal em processamento. Aguarde a conclusão antes de cancelar o pedido.");
      }

      await held.query("SELECT id FROM receivables WHERE order_id = $1 FOR UPDATE", [orderId]);
      await held.query("SELECT id FROM payables WHERE order_id = $1 FOR UPDATE", [orderId]);
      await held.query("SELECT id FROM production_orders WHERE order_id = $1 AND cancelled_at IS NULL FOR UPDATE", [orderId]);

      await held.query(
        `SELECT m.id FROM commissions m
           JOIN receipts p ON p.id = m.receipt_id
           JOIN receivables r ON r.id = p.receivable_id
          WHERE r.order_id = $1
          FOR UPDATE OF m`,
        [orderId],
      );
      const paymentDay = await loadCommissionDay(held);
      const competence = commissionCompetence(today);
      const paymentDue = commissionPaymentDate(today, paymentDay);
      const reversedReceipts = await reverseReceipts(held, orderId, sellerEmail, cleanReason, actor.email, competence, paymentDue);
      const manualReversed = await reverseManualCommissions(held, orderId, actor.email, cleanReason, competence, paymentDue);
      const receivablesCancelled = await cancelReceivables(held, orderId, cleanReason, actor.email);
      const payables = await cancelOpenPayables(held, orderId, actor.email);

      await held.query(
        `UPDATE fiscal_jobs
            SET status = 'revisao_manual', lease_until = NULL,
                last_error = 'Pedido cancelado antes da transmissão fiscal.', updated_at = now()
          WHERE order_id = $1 AND status = 'pendente'`,
        [orderId],
      );
      const queued = await held.query(
        `INSERT INTO fiscal_jobs (kind, order_id, requested_by, event_text, invoice_id)
         SELECT 'cancelamento_nfe', i.order_id, $2, $3, i.id
           FROM fiscal_invoices i
          WHERE i.order_id = $1 AND i.status = 'autorizada'
          ORDER BY (i.environment = 'producao') DESC, i.id DESC
          LIMIT 1
         RETURNING id`,
        [orderId, actor.email, cleanReason],
      );

      const production = await held.query(
        "SELECT id, finished_at IS NOT NULL AS finished FROM production_orders WHERE order_id = $1 AND cancelled_at IS NULL ORDER BY id",
        [orderId],
      );
      for (const row of production.rows) {
        if (row.finished === true) await settleConsumption(Number(row.id), actor.email, held, { gone: true });
      }
      const cancelledProduction = await held.query(
        `-- cancelar-producao
         UPDATE production_orders
            SET cancelled_at = now(), cancelled_by = $2, updated_at = now(), updated_by = $2
          WHERE order_id = $1 AND cancelled_at IS NULL
         RETURNING id`,
        [orderId, actor.email],
      );
      if (cancelledProduction.rows.length > 0) {
        await held.query(
          `INSERT INTO production_moves (production_order_id, stage_name, moved_by)
           SELECT id, 'Cancelada', $2 FROM production_orders WHERE id = ANY($1::int[])`,
          [cancelledProduction.rows.map((row) => Number(row.id)), actor.email],
        );
      }

      const stock = await held.query(
        `WITH balance AS (
           SELECT m.product_id, m.order_id, sum(m.quantity) AS out
             FROM stock_moves m WHERE m.order_id = $1
            GROUP BY m.product_id, m.order_id HAVING sum(m.quantity) <> 0
         )
         INSERT INTO stock_moves (product_id, kind, quantity, order_id, note, created_by)
         SELECT product_id, 'estorno', -out, order_id, 'Saída desfeita no cancelamento do pedido', $2 FROM balance
         RETURNING id`,
        [orderId, actor.email],
      );

      const withdrawn = await held.query(
        `WITH unsigned AS (
           UPDATE order_contracts
              SET status = 'cancelado', cancelled_at = now(), cancelled_by = $2, code_hash = NULL
            WHERE order_id = $1 AND status = 'enviado'
           RETURNING id
         )
         INSERT INTO order_contract_events (contract_id, kind, detail, actor)
         SELECT id, 'cancelado', 'pedido cancelado', $2 FROM unsigned
         RETURNING contract_id`,
        [orderId, actor.email],
      );
      await held.query(
        `INSERT INTO order_contract_events (contract_id, kind, detail, actor)
         SELECT id, 'cancelado', 'pedido comercial cancelado; contrato assinado preservado', $2
           FROM order_contracts WHERE order_id = $1 AND status = 'assinado'`,
        [orderId, actor.email],
      );

      await held.query(
        `UPDATE order_approvals
            SET status = 'reprovado', decided_at = now(), decided_by = $2, decided_role = 'DIRETORIA', comment = $3
          WHERE order_id = $1 AND status = 'pendente'`,
        [orderId, actor.email, `Pedido cancelado: ${cleanReason}`],
      );
      const closed = await held.query(
        `UPDATE orders
            SET status = 'cancelado', closed_at = NULL, cancel_reason = $2, updated_at = now(), updated_by = $3,
                nfe_rules_revision = nfe_rules_revision + 1
          WHERE id = $1 AND status = 'fechado'
         RETURNING id`,
        [orderId, cleanReason, actor.email],
      );
      if (closed.rows.length !== 1) throw new OrderError("O pedido mudou durante o cancelamento. Nada foi alterado.");

      const result: ClosedOrderCancellation = {
        orderNumber: number,
        receivablesCancelled,
        refundsConfirmed: reversedReceipts.refunds,
        commissionsReversed: reversedReceipts.commissions + manualReversed,
        payablesCancelled: payables.cancelled,
        payablesKept: payables.kept,
        productionCancelled: cancelledProduction.rows.length,
        fiscalCancellationQueued: queued.rows.length === 1,
        stockReversed: stock.rows.length,
        contractsWithdrawn: withdrawn.rows.length,
      };
      await held.query(
        `INSERT INTO order_cancellations (order_id, reason, summary, cancelled_by) VALUES ($1, $2, $3::jsonb, $4)`,
        [orderId, cleanReason, JSON.stringify(result), actor.email],
      );
      await held.query("COMMIT");
      return result;
    } catch (error) {
      await held.query("ROLLBACK");
      throw error;
    }
  });
}

type RefundCount = { refunds: number; commissions: number };

async function reverseReceipts(
  held: Queryable,
  orderId: number,
  sellerEmail: string,
  reason: string,
  who: string,
  competence: string,
  paymentDue: string,
): Promise<RefundCount> {
  const { rows } = await held.query<ReceiptRow>(
    `SELECT p.id, p.receivable_id, p.amount::text, p.amount_without_ipi::text,
            m.id AS commission_id, m.rate::text, m.amount::text AS commission_amount, m.base_amount::text,
            m.paid_at, m.cancelled_at
       FROM receipts p
       JOIN receivables r ON r.id = p.receivable_id
       LEFT JOIN commissions m ON m.receipt_id = p.id
      WHERE r.order_id = $1
      ORDER BY p.id
      FOR UPDATE OF p`,
    [orderId],
  );
  let refunds = 0;
  let commissions = 0;
  for (const receipt of rows) {
    const requestId = await confirmRefundRequest(held, orderId, receipt, reason, who);
    const existingRefund = await held.query("SELECT id FROM refunds WHERE refund_request_id = $1", [requestId]);
    if (existingRefund.rows.length === 0) {
      const written = await held.query(
        `INSERT INTO refunds (refund_request_id, order_id, receivable_id, refunded_at, amount, amount_without_ipi, reason, requested_by, confirmed_by)
         VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $7) RETURNING id`,
        [requestId, orderId, receipt.receivable_id, -Number(receipt.amount), -Number(receipt.amount_without_ipi), reason, who],
      );
      refunds += 1;
      if (receipt.commission_id !== null && receipt.paid_at !== null && receipt.cancelled_at === null) {
        await held.query(
          `INSERT INTO commissions (seller_email, refund_id, competence, base_amount, rate, amount, payment_due)
           VALUES ($1, $2, $3::date, $4, $5, $6, $7::date)`,
          [sellerEmail, written.rows[0].id, competence, -Number(receipt.base_amount), Number(receipt.rate), -Number(receipt.commission_amount), paymentDue],
        );
        commissions += 1;
      }
    }
    if (receipt.commission_id !== null && receipt.paid_at === null && receipt.cancelled_at === null) {
      await held.query(
        "UPDATE commissions SET cancelled_at = now(), cancelled_by = $2 WHERE id = $1 AND paid_at IS NULL AND cancelled_at IS NULL",
        [receipt.commission_id, who],
      );
      commissions += 1;
    }
  }
  return { refunds, commissions };
}

async function confirmRefundRequest(held: Queryable, orderId: number, receipt: ReceiptRow, reason: string, who: string): Promise<number> {
  const current = await held.query(
    "SELECT id, status FROM refund_requests WHERE receipt_id = $1 AND status <> 'recusada' ORDER BY id DESC LIMIT 1",
    [receipt.id],
  );
  const found = current.rows[0];
  if (!found) {
    const inserted = await held.query(
      `INSERT INTO refund_requests (order_id, receivable_id, receipt_id, amount, reason, requested_by, status, decided_at, decided_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'confirmada', now(), $6) RETURNING id`,
      [orderId, receipt.receivable_id, receipt.id, Number(receipt.amount), reason, who],
    );
    return Number(inserted.rows[0].id);
  }
  if (found.status === "pendente") {
    await held.query(
      "UPDATE refund_requests SET status = 'confirmada', decided_at = now(), decided_by = $2 WHERE id = $1 AND status = 'pendente'",
      [found.id, who],
    );
  }
  return Number(found.id);
}

async function reverseManualCommissions(
  held: Queryable,
  orderId: number,
  who: string,
  reason: string,
  competence: string,
  paymentDue: string,
): Promise<number> {
  const { rows } = await held.query(
    `SELECT m.id, m.seller_email, m.amount, m.base_amount, m.rate, m.paid_at
       FROM commissions m
       JOIN commission_adjustments a ON a.id = m.adjustment_id
      WHERE a.order_id = $1 AND m.cancelled_at IS NULL
      ORDER BY m.id
      FOR UPDATE OF m`,
    [orderId],
  );
  let reversed = 0;
  for (const row of rows) {
    if (row.paid_at === null) {
      await held.query(
        "UPDATE commissions SET cancelled_at = now(), cancelled_by = $2 WHERE id = $1 AND paid_at IS NULL AND cancelled_at IS NULL",
        [row.id, who],
      );
      reversed += 1;
      continue;
    }
    const adjustment = await held.query(
      `INSERT INTO commission_adjustments (seller_email, order_id, action, amount, reason, changed_by)
       VALUES ($1, $2, 'cancelar', $3, $4, $5) RETURNING id`,
      [row.seller_email, orderId, -Number(row.amount), reason, who],
    );
    await held.query(
      `INSERT INTO commissions (seller_email, adjustment_id, competence, base_amount, rate, amount, payment_due)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7::date)`,
      [row.seller_email, adjustment.rows[0].id, competence, -Number(row.base_amount), Number(row.rate), -Number(row.amount), paymentDue],
    );
    reversed += 1;
  }
  return reversed;
}

async function cancelReceivables(held: Queryable, orderId: number, reason: string, who: string): Promise<number> {
  const { rows } = await held.query(
    `WITH before AS (
       SELECT id, status, amount, due_date, method FROM receivables
        WHERE order_id = $1 AND status IN ('aberta', 'recebida')
        FOR UPDATE
     ), changed AS (
       UPDATE receivables r
          SET status = 'cancelada', updated_at = now(), updated_by = $3
         FROM before WHERE r.id = before.id
       RETURNING r.id
     )
     INSERT INTO receivable_adjustments (receivable_id, action, previous_state, new_state, reason, changed_by)
     SELECT before.id, 'cancelar',
            jsonb_build_object('status', before.status, 'amount', before.amount, 'dueDate', before.due_date, 'method', before.method),
            jsonb_build_object('status', 'cancelada'), $2, $3
       FROM before JOIN changed ON changed.id = before.id
     RETURNING receivable_id`,
    [orderId, reason, who],
  );
  return rows.length;
}

async function cancelOpenPayables(held: Queryable, orderId: number, who: string): Promise<{ cancelled: number; kept: number }> {
  const open = await held.query(
    `UPDATE payables SET status = 'cancelada', updated_at = now(), updated_by = $2
      WHERE order_id = $1 AND status = 'aberta'
     RETURNING id`,
    [orderId, who],
  );
  const kept = await held.query("SELECT count(*)::int AS total FROM payables WHERE order_id = $1 AND status = 'paga'", [orderId]);
  return { cancelled: open.rows.length, kept: Number(kept.rows[0].total) };
}

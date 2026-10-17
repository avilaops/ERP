import { IssueError, issueOrderNfe } from "@/lib/db/issue-nfe";
import { previewOrderNfe } from "@/lib/db/order-nfe";
import { getOrder } from "@/lib/db/orders";
import type { Queryable } from "@/lib/db/pool";
import type { Send } from "@/lib/fiscal/channel";
import type { LayoutCheck } from "@/lib/fiscal/precheck";
import { vaultKey } from "@/lib/fiscal/certificate";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60_000;

export type FiscalJob = {
  id: number;
  orderId: number;
  orderNumber: string;
  requestedBy: string;
  attempts: number;
};

/** A request is durable before it returns to the screen. Repeated clicks join its active job. */
export async function enqueueNfeIssue(orderNumber: string, who: string, conn: Queryable): Promise<{ id: number; joined: boolean }> {
  const order = await getOrder(orderNumber, { sellerEmail: null }, conn);
  if (!order) throw new IssueError("Pedido não encontrado.");
  const preview = await previewOrderNfe(orderNumber, new Date(), conn);
  if (!preview) throw new IssueError("Pedido não encontrado ou ainda não fechado: só pedido fechado tem nota.");
  if (preview.problems.length > 0) throw new IssueError(`A nota ainda não pode ser emitida. Falta: ${preview.problems.join(" ")}`);
  const { rows } = await conn.query(
    `INSERT INTO fiscal_jobs (kind, order_id, requested_by)
     VALUES ('emitir_nfe', $1, $2)
     ON CONFLICT (kind, order_id) WHERE status IN ('pendente', 'processando')
     DO UPDATE SET updated_at = now()
     RETURNING id, (xmax <> 0) AS joined`,
    [order.id, who],
  );
  return { id: Number(rows[0].id), joined: rows[0].joined === true };
}

/** Claims one due job without holding a transaction open while SEFAZ is called. */
export async function claimFiscalJob(now: Date, conn: Queryable): Promise<FiscalJob | null> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const { rows } = await conn.query(
    `WITH candidate AS (
       SELECT id FROM fiscal_jobs
        WHERE (status = 'pendente' AND run_after <= $1)
           OR (status = 'processando' AND lease_until <= $1)
        ORDER BY run_after, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE fiscal_jobs j
        SET status = 'processando', attempts = attempts + 1, lease_until = $2, updated_at = $1
       FROM candidate c
      WHERE j.id = c.id
      RETURNING j.id, j.order_id, j.requested_by, j.attempts,
                (SELECT number FROM orders WHERE id = j.order_id) AS order_number`,
    [now, leaseUntil],
  );
  const row = rows[0];
  return row ? { id: Number(row.id), orderId: Number(row.order_id), orderNumber: String(row.order_number), requestedBy: String(row.requested_by), attempts: Number(row.attempts) } : null;
}

export async function completeFiscalJob(id: number, now: Date, conn: Queryable): Promise<void> {
  await conn.query(
    "UPDATE fiscal_jobs SET status = 'concluido', completed_at = $2, lease_until = NULL, last_error = NULL, updated_at = $2 WHERE id = $1 AND status = 'processando'",
    [id, now],
  );
}

async function awaitingAnswer(orderId: number, conn: Queryable): Promise<boolean> {
  const { rows } = await conn.query("SELECT 1 FROM fiscal_invoices WHERE order_id = $1 AND status = 'assinada' LIMIT 1", [orderId]);
  return rows.length > 0;
}

async function failFiscalJob(job: FiscalJob, error: unknown, now: Date, conn: Queryable): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 2000) : "Falha inesperada ao processar a nota.";
  const retry = job.attempts < MAX_ATTEMPTS && (await awaitingAnswer(job.orderId, conn));
  if (!retry) {
    await conn.query(
      "UPDATE fiscal_jobs SET status = 'revisao_manual', lease_until = NULL, last_error = $2, updated_at = $3 WHERE id = $1 AND status = 'processando'",
      [job.id, message, now],
    );
    return;
  }
  const delayMinutes = Math.min(30, 2 ** (job.attempts - 1));
  await conn.query(
    "UPDATE fiscal_jobs SET status = 'pendente', run_after = $2, lease_until = NULL, last_error = $3, updated_at = $4 WHERE id = $1 AND status = 'processando'",
    [job.id, new Date(now.getTime() + delayMinutes * 60_000), message, now],
  );
}

export type FiscalJobDependencies = { vault: Buffer; send: Send; check: LayoutCheck | null };

/** Processes one invoice request. The lease is already durable before any network operation begins. */
export async function runOneFiscalJob(now: Date, dependencies: FiscalJobDependencies, conn: Queryable): Promise<"none" | "completed" | "retry" | "manual_review"> {
  const job = await claimFiscalJob(now, conn);
  if (!job) return "none";
  try {
    await issueOrderNfe(job.orderNumber, job.requestedBy, now, dependencies.vault, dependencies.send, conn, dependencies.check);
    await completeFiscalJob(job.id, now, conn);
    return "completed";
  } catch (error) {
    await failFiscalJob(job, error, now, conn);
    return (await awaitingAnswer(job.orderId, conn)) && job.attempts < MAX_ATTEMPTS ? "retry" : "manual_review";
  }
}

/** Dependencies used by the production background routine, kept here to make the worker testable. */
export function fiscalJobDependencies(env: Record<string, string | undefined>, send: Send, check: LayoutCheck | null): FiscalJobDependencies {
  return { vault: vaultKey(env.ERP_CERT_KEY), send, check };
}

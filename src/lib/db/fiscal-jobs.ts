import { IssueError, issueOrderNfe, registerOrderNfeEvent } from "@/lib/db/issue-nfe";
import { loadMailInfo } from "@/lib/db/mail";
import { loadFiscalSettings } from "@/lib/db/fiscal";
import { listOrderInvoices } from "@/lib/db/invoices";
import { previewOrderNfe } from "@/lib/db/order-nfe";
import { getOrder } from "@/lib/db/orders";
import type { Queryable } from "@/lib/db/pool";
import { sendInvoiceMail } from "@/lib/db/send-nfe-mail";
import type { Send } from "@/lib/fiscal/channel";
import type { LayoutCheck } from "@/lib/fiscal/precheck";
import { vaultKey } from "@/lib/fiscal/certificate";
import { eventText } from "@/lib/fiscal/events";
import { sendMail } from "@/lib/mail/smtp";
import type { MailSender } from "@/lib/db/send-nfe-mail";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 2 * 60_000;

export type FiscalJob = {
  id: number;
  orderId: number;
  orderNumber: string;
  requestedBy: string;
  attempts: number;
  kind: "emitir_nfe" | "correcao_nfe" | "cancelamento_nfe";
  eventText: string | null;
  invoiceId: number | null;
};

export type FiscalJobSummary = {
  id: number;
  kind: "emitir_nfe" | "correcao_nfe" | "cancelamento_nfe";
  status: "pendente" | "processando" | "concluido" | "revisao_manual";
  attempts: number;
  lastError: string | null;
  runAfter: Date;
};

/** The order page only needs the work still relevant to the person, never XML or certificate data. */
export async function listOrderFiscalJobs(orderId: number, conn: Queryable): Promise<FiscalJobSummary[]> {
  const { rows } = await conn.query(
    "SELECT id, kind, status, attempts, last_error, run_after FROM fiscal_jobs WHERE order_id = $1 ORDER BY id DESC LIMIT 5",
    [orderId],
  );
  return rows.map((row) => ({ id: Number(row.id), kind: row.kind as FiscalJobSummary["kind"], status: row.status as FiscalJobSummary["status"], attempts: Number(row.attempts), lastError: row.last_error === null ? null : String(row.last_error), runAfter: row.run_after as Date }));
}

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
     ON CONFLICT (order_id) WHERE status IN ('pendente', 'processando')
     DO UPDATE SET updated_at = now()
     RETURNING id, kind, (xmax <> 0) AS joined`,
    [order.id, who],
  );
  if (rows[0].kind !== "emitir_nfe") throw new IssueError("Há um evento fiscal pendente neste pedido. Aguarde a conclusão ou revise a pendência antes de emitir.");
  return { id: Number(rows[0].id), joined: rows[0].joined === true };
}

/** CC-e and cancellation are stored before the screen returns; repeated clicks join the same active event. */
export async function enqueueNfeEvent(orderNumber: string, kind: "correcao" | "cancelamento", text: string, who: string, conn: Queryable): Promise<{ id: number; joined: boolean }> {
  const order = await getOrder(orderNumber, { sellerEmail: null }, conn);
  if (!order) throw new IssueError("Pedido não encontrado.");
  let detail: string;
  try {
    detail = eventText(kind, text);
  } catch (error) {
    throw new IssueError(error instanceof Error ? error.message : "O texto do evento não é válido.");
  }
  const settings = await loadFiscalSettings(conn);
  const invoice = (await listOrderInvoices(order.id, conn)).find((item) => item.status === "autorizada" && item.environment === settings.environment);
  if (!invoice) throw new IssueError("Este pedido não tem nota autorizada neste ambiente.");
  const jobKind = kind === "correcao" ? "correcao_nfe" : "cancelamento_nfe";
  const { rows } = await conn.query(
    `INSERT INTO fiscal_jobs (kind, order_id, requested_by, event_text, invoice_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (order_id) WHERE status IN ('pendente', 'processando')
     DO UPDATE SET updated_at = now()
     RETURNING id, kind, event_text, invoice_id, (xmax <> 0) AS joined`,
    [jobKind, order.id, who, detail, invoice.id],
  );
  if (rows[0].kind !== jobKind) throw new IssueError("Já há outra operação fiscal pendente neste pedido. Aguarde a conclusão ou revise a pendência antes de enviar este evento.");
  if (String(rows[0].event_text) !== detail || Number(rows[0].invoice_id) !== invoice.id) {
    throw new IssueError("Já há este tipo de evento pendente com outro texto ou para outra nota. Aguarde a conclusão ou revise a pendência antes de confirmar novamente.");
  }
  return { id: Number(rows[0].id), joined: rows[0].joined === true };
}

/** Claims one due job without holding a transaction open while SEFAZ is called. */
export async function claimFiscalJob(now: Date, conn: Queryable): Promise<FiscalJob | null> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  await conn.query(
    `UPDATE fiscal_jobs
        SET status = 'revisao_manual', lease_until = NULL,
            last_error = COALESCE(last_error, 'Processamento interrompido após cinco tentativas; confira o documento antes de qualquer nova operação.'), updated_at = $1
      WHERE status = 'processando' AND lease_until <= $1 AND attempts >= $2`,
    [now, MAX_ATTEMPTS],
  );
  const { rows } = await conn.query(
    `WITH candidate AS (
       SELECT id FROM fiscal_jobs
        WHERE attempts < $3 AND ((status = 'pendente' AND run_after <= $1)
           OR (status = 'processando' AND lease_until <= $1))
        ORDER BY run_after, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE fiscal_jobs j
        SET status = 'processando', attempts = attempts + 1, lease_until = $2, updated_at = $1
       FROM candidate c
      WHERE j.id = c.id
      RETURNING j.id, j.order_id, j.requested_by, j.attempts, j.kind, j.event_text, j.invoice_id,
                (SELECT number FROM orders WHERE id = j.order_id) AS order_number`,
    [now, leaseUntil, MAX_ATTEMPTS],
  );
  const row = rows[0];
  return row ? { id: Number(row.id), orderId: Number(row.order_id), orderNumber: String(row.order_number), requestedBy: String(row.requested_by), attempts: Number(row.attempts), kind: row.kind as FiscalJob["kind"], eventText: row.event_text === null ? null : String(row.event_text), invoiceId: row.invoice_id === null ? null : Number(row.invoice_id) } : null;
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

function isTransientEventError(error: unknown): boolean {
  return error instanceof IssueError && /não respondeu|não foi possível falar|resposta da SEFAZ não é a esperada|consulta da nota falhou|respondeu sem conteúdo|tente de novo em instantes/i.test(error.message);
}

async function retryFiscalJob(job: FiscalJob, message: string, now: Date, conn: Queryable): Promise<void> {
  const delayMinutes = Math.min(30, 2 ** (job.attempts - 1));
  await conn.query(
    "UPDATE fiscal_jobs SET status = 'pendente', run_after = $2, lease_until = NULL, last_error = $3, updated_at = $4 WHERE id = $1 AND status = 'processando'",
    [job.id, new Date(now.getTime() + delayMinutes * 60_000), message.slice(0, 2000), now],
  );
}

async function failFiscalJob(job: FiscalJob, error: unknown, now: Date, conn: Queryable): Promise<boolean> {
  const message = error instanceof Error ? error.message.slice(0, 2000) : "Falha inesperada ao processar a nota.";
  const retry = job.attempts < MAX_ATTEMPTS && (job.kind === "emitir_nfe" ? await awaitingAnswer(job.orderId, conn) : isTransientEventError(error));
  if (!retry) {
    await conn.query(
      "UPDATE fiscal_jobs SET status = 'revisao_manual', lease_until = NULL, last_error = $2, updated_at = $3 WHERE id = $1 AND status = 'processando'",
      [job.id, message, now],
    );
    return false;
  }
  await retryFiscalJob(job, message, now, conn);
  return true;
}

export type FiscalJobDependencies = { vault: Buffer; send: Send; check: LayoutCheck | null; env: Record<string, string | undefined>; mailSend?: MailSender };

/** An e-mail failure never reopens a concluded fiscal job: sendInvoiceMail records its own result. */
async function sendAutomaticMail(kind: "nota" | "correcao" | "cancelamento", invoiceId: number, sentBy: string, now: Date, dependencies: FiscalJobDependencies, conn: Queryable): Promise<void> {
  try {
    if (!(await loadMailInfo(conn)).autoSend) return;
    const prior = await conn.query("SELECT recipient FROM fiscal_invoice_mails WHERE invoice_id = $1 AND kind = 'nota' AND status = 'enviado' ORDER BY id DESC LIMIT 1", [invoiceId]);
    if (kind === "nota" && prior.rows[0]) return;
    if (kind !== "nota" && !prior.rows[0]) return;
    if (kind !== "nota") {
      const already = await conn.query("SELECT 1 FROM fiscal_invoice_mails WHERE invoice_id = $1 AND kind = $2 AND status = 'enviado' AND event_id = (SELECT id FROM fiscal_invoice_events WHERE invoice_id = $1 AND kind = $2 ORDER BY sequence DESC LIMIT 1)", [invoiceId, kind]);
      if (already.rows[0]) return;
    }
    await sendInvoiceMail({ invoiceId, ...(kind === "correcao" ? { kind } : {}), to: kind === "nota" ? null : String(prior.rows[0].recipient), sentBy, now, env: dependencies.env, key: () => dependencies.vault, send: dependencies.mailSend ?? sendMail }, conn);
  } catch (error) {
    console.error("[fila fiscal] e-mail automático não enviado:", error instanceof Error ? error.message : error);
  }
}

/** Drains a bounded batch so one background tick can make progress without monopolising a tenant. */
export async function runFiscalJobBatch(now: Date, dependencies: FiscalJobDependencies, conn: Queryable, limit = 10): Promise<number> {
  let processed = 0;
  while (processed < limit) {
    if ((await runOneFiscalJob(now, dependencies, conn)) === "none") break;
    processed += 1;
  }
  return processed;
}

/** Processes one invoice request. The lease is already durable before any network operation begins. */
export async function runOneFiscalJob(now: Date, dependencies: FiscalJobDependencies, conn: Queryable): Promise<"none" | "completed" | "retry" | "manual_review"> {
  const job = await claimFiscalJob(now, conn);
  if (!job) return "none";
  try {
    if (job.kind === "emitir_nfe") {
      const prior = await conn.query("SELECT id, status FROM fiscal_invoices WHERE fiscal_job_id = $1 LIMIT 1", [job.id]);
      if (prior.rows[0] && prior.rows[0].status !== "assinada") {
        if (prior.rows[0].status === "autorizada") await sendAutomaticMail("nota", Number(prior.rows[0].id), job.requestedBy, now, dependencies, conn);
        await completeFiscalJob(job.id, now, conn);
        return "completed";
      }
      const result = await issueOrderNfe(job.orderNumber, job.requestedBy, now, dependencies.vault, dependencies.send, conn, dependencies.check, job.id);
      if (result.invoice.status === "autorizada") await sendAutomaticMail("nota", result.invoice.id, job.requestedBy, now, dependencies, conn);
      if (result.invoice.status === "assinada") {
        await retryFiscalJob(job, result.message, now, conn);
        return "retry";
      }
    } else {
      const recorded = await conn.query("SELECT id, invoice_id FROM fiscal_invoice_events WHERE fiscal_job_id = $1 LIMIT 1", [job.id]);
      if (recorded.rows[0]) {
        const kind = job.kind === "correcao_nfe" ? "correcao" : "cancelamento";
        await sendAutomaticMail(kind, Number(recorded.rows[0].invoice_id), job.requestedBy, now, dependencies, conn);
        await completeFiscalJob(job.id, now, conn);
        return "completed";
      }
      const kind = job.kind === "correcao_nfe" ? "correcao" : "cancelamento";
      if (job.invoiceId === null) throw new IssueError("O evento pendente não está vinculado a uma nota; revise-o manualmente.");
      const result = await registerOrderNfeEvent(job.orderNumber, kind, job.eventText ?? "", job.requestedBy, now, dependencies.vault, dependencies.send, conn, { invoiceId: job.invoiceId, fiscalJobId: job.id });
      await sendAutomaticMail(kind, result.invoiceId, job.requestedBy, now, dependencies, conn);
    }
    await completeFiscalJob(job.id, now, conn);
    return "completed";
  } catch (error) {
    return (await failFiscalJob(job, error, now, conn)) ? "retry" : "manual_review";
  }
}

/** Dependencies used by the production background routine, kept here to make the worker testable. */
export function fiscalJobDependencies(env: Record<string, string | undefined>, send: Send, check: LayoutCheck | null): FiscalJobDependencies {
  return { vault: vaultKey(env.ERP_CERT_KEY), send, check, env };
}

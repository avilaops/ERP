import type { Queryable } from "@/lib/db/pool";
import type { InvoiceStatus } from "@/lib/db/invoices";

type Environment = "homologacao" | "producao";
type JobKind = "emitir_nfe" | "correcao_nfe" | "cancelamento_nfe";
type JobStatus = "pendente" | "processando" | "concluido" | "revisao_manual";

export type FiscalOrderStage = "emitir" | "fila" | "revisao" | "concluido";

export type FiscalOrderOverview = {
  orderId: number;
  orderNumber: string;
  customerName: string;
  closedAt: Date;
  invoiceId: number | null;
  invoiceStatus: InvoiceStatus | null;
  invoiceNumber: number | null;
  environment: Environment | null;
  jobId: number | null;
  jobKind: JobKind | null;
  jobStatus: JobStatus | null;
  jobAttempts: number;
  jobError: string | null;
  jobRunAfter: Date | null;
  stage: FiscalOrderStage;
};

export type FiscalInvoiceOverview = {
  id: number;
  orderNumber: string;
  customerName: string;
  environment: Environment;
  series: number;
  number: number;
  accessKey: string;
  status: InvoiceStatus;
  protocol: string | null;
  statusCode: string | null;
  statusReason: string | null;
  issuedAt: Date;
  mail: { status: "enviado" | "falhou"; recipient: string; sentAt: Date } | null;
};

export type FiscalVoidJobOverview = {
  id: number;
  environment: Environment;
  series: number;
  first: number;
  last: number;
  status: JobStatus;
  attempts: number;
  lastError: string | null;
  runAfter: Date;
  createdAt: Date;
};

export type FiscalNumberVoidOverview = {
  id: number;
  environment: Environment;
  series: number;
  first: number;
  last: number;
  reason: string;
  protocol: string;
  createdAt: Date;
  createdBy: string;
};

export type FiscalOverview = {
  orders: FiscalOrderOverview[];
  invoices: FiscalInvoiceOverview[];
  voidJobs: FiscalVoidJobOverview[];
  voids: FiscalNumberVoidOverview[];
};

export type FiscalOverviewScope = { sellerEmail: string | null; environment: Environment };

const textOrNull = (value: unknown) => value === null || value === undefined ? null : String(value);
const numberOrNull = (value: unknown) => value === null || value === undefined ? null : Number(value);

function stageOf(invoice: InvoiceStatus | null, job: JobStatus | null): FiscalOrderStage {
  if (job === "revisao_manual") return "revisao";
  if (job === "pendente" || job === "processando") return "fila";
  if (invoice === "autorizada" || invoice === "cancelada" || invoice === "denegada") return "concluido";
  if (invoice === "assinada" || invoice === "rejeitada") return "revisao";
  return "emitir";
}

/**
 * The operational fiscal screen receives status metadata only. XMLs, PFX files,
 * passwords and message bodies remain in their purpose-specific repositories.
 */
export async function listFiscalOverview(scope: FiscalOverviewScope, conn: Queryable): Promise<FiscalOverview> {
  const [orders, invoices, voidJobs, voids] = await Promise.all([
    conn.query(
      `SELECT o.id AS order_id, o.number AS order_number, COALESCE(c.trade_name, c.name, 'Cliente não vinculado') AS customer_name, o.closed_at,
              i.id AS invoice_id, i.status AS invoice_status, i.number AS invoice_number, i.environment,
              j.id AS job_id, j.kind AS job_kind, j.status AS job_status, j.attempts AS job_attempts,
              j.last_error AS job_error, j.run_after AS job_run_after
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN LATERAL (
           SELECT id, status, number, environment FROM fiscal_invoices
            WHERE order_id = o.id AND environment = $2 ORDER BY id DESC LIMIT 1
         ) i ON true
         LEFT JOIN LATERAL (
           SELECT fj.id, fj.kind, fj.status, fj.attempts, fj.last_error, fj.run_after FROM fiscal_jobs fj
            WHERE fj.order_id = o.id
              AND (fj.invoice_id IS NULL OR EXISTS (
                SELECT 1 FROM fiscal_invoices job_invoice
                 WHERE job_invoice.id = fj.invoice_id AND job_invoice.environment = $2
              ))
            ORDER BY CASE
                       WHEN fj.status = 'revisao_manual' AND NOT EXISTS (
                         SELECT 1 FROM fiscal_jobs replacement
                          WHERE replacement.order_id = fj.order_id
                            AND replacement.kind = fj.kind
                            AND replacement.id > fj.id
                            AND (fj.kind = 'emitir_nfe' OR replacement.invoice_id IS NOT DISTINCT FROM fj.invoice_id)
                       ) THEN 0
                       WHEN fj.status = 'processando' THEN 1
                       WHEN fj.status = 'pendente' THEN 2
                       ELSE 3
                     END,
                     fj.id DESC
            LIMIT 1
         ) j ON true
        WHERE o.status = 'fechado' AND ($1::text IS NULL OR o.seller_email = $1)
        ORDER BY o.closed_at DESC, o.id DESC`,
      [scope.sellerEmail, scope.environment],
    ),
    conn.query(
      `SELECT i.id, o.number AS order_number, COALESCE(c.trade_name, c.name, 'Cliente não vinculado') AS customer_name,
              i.environment, i.series, i.number, i.access_key, i.status, i.protocol, i.status_code, i.status_reason, i.issued_at,
              m.status AS mail_status, m.recipient AS mail_recipient, m.sent_at AS mail_sent_at
         FROM fiscal_invoices i
         JOIN orders o ON o.id = i.order_id
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN LATERAL (
           SELECT status, recipient, sent_at FROM fiscal_invoice_mails WHERE invoice_id = i.id ORDER BY id DESC LIMIT 1
         ) m ON true
        WHERE ($1::text IS NULL OR o.seller_email = $1)
        ORDER BY i.issued_at DESC, i.id DESC`,
      [scope.sellerEmail],
    ),
    conn.query(
      `SELECT id, environment, series, first_number, last_number, status, attempts, last_error, run_after, created_at
         FROM fiscal_void_jobs j
        WHERE j.status <> 'concluido'
          AND NOT EXISTS (
            SELECT 1 FROM fiscal_number_voids v
             WHERE v.environment = j.environment AND v.series = j.series
               AND v.first_number = j.first_number AND v.last_number = j.last_number
          )
        ORDER BY CASE status WHEN 'revisao_manual' THEN 0 WHEN 'processando' THEN 1 WHEN 'pendente' THEN 2 ELSE 3 END, id DESC`,
    ),
    conn.query(
      `SELECT id, environment, series, first_number, last_number, reason, protocol, created_at, created_by
         FROM fiscal_number_voids ORDER BY created_at DESC, id DESC`,
    ),
  ]);

  return {
    orders: orders.rows.map((row) => {
      const invoiceStatus = textOrNull(row.invoice_status) as InvoiceStatus | null;
      const jobStatus = textOrNull(row.job_status) as JobStatus | null;
      return {
        orderId: Number(row.order_id), orderNumber: String(row.order_number), customerName: String(row.customer_name), closedAt: row.closed_at as Date,
        invoiceId: numberOrNull(row.invoice_id), invoiceStatus, invoiceNumber: numberOrNull(row.invoice_number), environment: textOrNull(row.environment) as Environment | null,
        jobId: numberOrNull(row.job_id), jobKind: textOrNull(row.job_kind) as JobKind | null, jobStatus, jobAttempts: Number(row.job_attempts ?? 0),
        jobError: textOrNull(row.job_error), jobRunAfter: row.job_run_after === null || row.job_run_after === undefined ? null : row.job_run_after as Date,
        stage: stageOf(invoiceStatus, jobStatus),
      };
    }),
    invoices: invoices.rows.map((row) => ({
      id: Number(row.id), orderNumber: String(row.order_number), customerName: String(row.customer_name), environment: row.environment as Environment,
      series: Number(row.series), number: Number(row.number), accessKey: String(row.access_key), status: row.status as InvoiceStatus,
      protocol: textOrNull(row.protocol), statusCode: textOrNull(row.status_code), statusReason: textOrNull(row.status_reason), issuedAt: row.issued_at as Date,
      mail: row.mail_status === null || row.mail_status === undefined ? null : { status: row.mail_status as "enviado" | "falhou", recipient: String(row.mail_recipient), sentAt: row.mail_sent_at as Date },
    })),
    voidJobs: voidJobs.rows.map((row) => ({
      id: Number(row.id), environment: row.environment as Environment, series: Number(row.series), first: Number(row.first_number), last: Number(row.last_number),
      status: row.status as JobStatus, attempts: Number(row.attempts), lastError: textOrNull(row.last_error), runAfter: row.run_after as Date, createdAt: row.created_at as Date,
    })),
    voids: voids.rows.map((row) => ({
      id: Number(row.id), environment: row.environment as Environment, series: Number(row.series), first: Number(row.first_number), last: Number(row.last_number),
      reason: String(row.reason), protocol: String(row.protocol), createdAt: row.created_at as Date, createdBy: String(row.created_by),
    })),
  };
}

import type { Queryable } from "@/lib/db/pool";

export type InvoiceStatus = "assinada" | "autorizada" | "rejeitada" | "denegada";
type Environment = "homologacao" | "producao";

/** One attempt of issuing the invoice of an order, as the screen shows it. The XML never comes along. */
export type Invoice = {
  id: number;
  environment: Environment;
  series: number;
  number: number;
  accessKey: string;
  status: InvoiceStatus;
  protocol: string | null;
  statusCode: string | null;
  statusReason: string | null;
  issuedAt: Date;
  createdBy: string;
};

const COLUMNS = "id, environment, series, number, access_key, status, protocol, status_code, status_reason, issued_at, created_by";

const toInvoice = (row: Record<string, unknown>): Invoice => ({
  id: Number(row.id),
  environment: row.environment as Environment,
  series: Number(row.series),
  number: Number(row.number),
  accessKey: String(row.access_key),
  status: row.status as InvoiceStatus,
  protocol: row.protocol === null ? null : String(row.protocol),
  statusCode: row.status_code === null ? null : String(row.status_code),
  statusReason: row.status_reason === null ? null : String(row.status_reason),
  issuedAt: row.issued_at as Date,
  createdBy: String(row.created_by),
});

/** The invoices of an order, the newest first. */
export async function listOrderInvoices(orderId: number, conn: Queryable): Promise<Invoice[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM fiscal_invoices WHERE order_id = $1 ORDER BY id DESC`, [orderId]);
  return rows.map(toInvoice);
}

/** Takes the next number of the company and moves the counter, in one statement: two issuers never get the same. */
export async function takeNextNumber(conn: Queryable): Promise<number> {
  const { rows } = await conn.query("UPDATE company_settings SET nfe_next_number = nfe_next_number + 1 RETURNING nfe_next_number - 1 AS taken");
  if (!rows[0]) throw new Error("Dados da empresa não cadastrados no banco. Rode `npm run db:migrate`.");
  return Number(rows[0].taken);
}

export type SignedInvoice = { orderId: number; environment: Environment; series: number; number: number; accessKey: string; signedXml: string; issuedAt: string; createdBy: string };

/**
 * Keeps the signed invoice before it is sent: whatever happens to the call, the
 * system knows what it tried to issue. A rejected invoice of the same number is
 * replaced by the corrected one; an authorised or denied one never is.
 */
export async function saveSignedInvoice(invoice: SignedInvoice, conn: Queryable): Promise<Invoice> {
  const { rows } = await conn.query(
    `INSERT INTO fiscal_invoices (order_id, environment, series, number, access_key, status, signed_xml, issued_at, created_by)
     VALUES ($1, $2, $3, $4, $5, 'assinada', $6, $7, $8)
     ON CONFLICT (environment, series, number) DO UPDATE
        SET access_key = EXCLUDED.access_key, status = 'assinada', signed_xml = EXCLUDED.signed_xml, issued_at = EXCLUDED.issued_at,
            status_code = NULL, status_reason = NULL, updated_at = now(), created_by = EXCLUDED.created_by
      WHERE fiscal_invoices.order_id = EXCLUDED.order_id AND fiscal_invoices.status IN ('rejeitada', 'assinada')
     RETURNING ${COLUMNS}`,
    [invoice.orderId, invoice.environment, invoice.series, invoice.number, invoice.accessKey, invoice.signedXml, invoice.issuedAt, invoice.createdBy],
  );
  if (!rows[0]) throw new Error(`O número ${invoice.number} da série ${invoice.series} já pertence a outra nota.`);
  return toInvoice(rows[0]);
}

export type InvoiceVerdict =
  | { status: "autorizada"; code: string; reason: string; protocol: string; authorizedXml: string }
  | { status: "denegada"; code: string; reason: string; protocol: string }
  | { status: "rejeitada" | "assinada"; code: string; reason: string };

/** Writes what SEFAZ answered. Only an invoice still without a verdict changes: an authorised one is never rewritten. */
export async function recordVerdict(id: number, verdict: InvoiceVerdict, conn: Queryable): Promise<Invoice> {
  const { rows } = await conn.query(
    `UPDATE fiscal_invoices
        SET status = $2, status_code = $3, status_reason = $4, protocol = $5, authorized_xml = $6, updated_at = now()
      WHERE id = $1 AND status = 'assinada'
      RETURNING ${COLUMNS}`,
    [id, verdict.status, verdict.code, verdict.reason, "protocol" in verdict ? verdict.protocol : null, verdict.status === "autorizada" ? verdict.authorizedXml : null],
  );
  if (!rows[0]) throw new Error("A nota já tinha um veredito gravado; nada foi alterado.");
  return toInvoice(rows[0]);
}

/** The signed XML of an invoice still without a verdict, to send again exactly as it was signed. */
export async function loadSignedXml(id: number, conn: Queryable): Promise<string | null> {
  const { rows } = await conn.query("SELECT signed_xml FROM fiscal_invoices WHERE id = $1", [id]);
  return rows[0] ? String(rows[0].signed_xml) : null;
}

/** The file of the authorised invoice of an order (nfeProc), or `null`. `environment` filters; without it, production first. */
export async function loadAuthorizedXml(orderId: number, conn: Queryable): Promise<{ xml: string; accessKey: string } | null> {
  const { rows } = await conn.query(
    `SELECT authorized_xml, access_key FROM fiscal_invoices
      WHERE order_id = $1 AND status = 'autorizada' ORDER BY (environment = 'producao') DESC, id DESC LIMIT 1`,
    [orderId],
  );
  return rows[0] ? { xml: String(rows[0].authorized_xml), accessKey: String(rows[0].access_key) } : null;
}

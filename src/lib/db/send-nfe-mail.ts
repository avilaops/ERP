import { DEFAULT_NFE_BODY, DEFAULT_NFE_SUBJECT, fillMailText, loadMailInfo, mailChannel } from "@/lib/db/mail";
import type { Queryable } from "@/lib/db/pool";
import { loadDanfeReformDate } from "@/lib/db/fiscal";
import { danfeData, renderDanfe, usesReformLayout } from "@/lib/fiscal/danfe";
import { buildMessage, isMailAddress, MailError } from "@/lib/mail/message";
import type { MailAttachment } from "@/lib/mail/message";
import type { SmtpConfig } from "@/lib/mail/smtp";

/** How a message is handed to a mail server. The tests give a stand-in. */
export type MailSender = (config: SmtpConfig, envelope: { from: string; to: string }, message: string) => Promise<void>;

export type InvoiceMail = { id: number; invoiceId: number; kind: "nota" | "cancelamento"; recipient: string; channel: "empresa" | "avilaops"; status: "enviado" | "falhou"; detail: string | null; sentAt: Date; sentBy: string };

/** Every attempt of sending the invoices of an order, the latest first. */
export async function listOrderInvoiceMails(orderId: number, conn: Queryable): Promise<InvoiceMail[]> {
  const { rows } = await conn.query(
    `SELECT m.id, m.invoice_id, m.kind, m.recipient, m.channel, m.status, m.detail, m.sent_at, m.sent_by
       FROM fiscal_invoice_mails m JOIN fiscal_invoices i ON i.id = m.invoice_id WHERE i.order_id = $1 ORDER BY m.id DESC`,
    [orderId],
  );
  return rows.map((row) => ({
    id: Number(row.id), invoiceId: Number(row.invoice_id), kind: row.kind as InvoiceMail["kind"], recipient: String(row.recipient), channel: row.channel as InvoiceMail["channel"],
    status: row.status as InvoiceMail["status"], detail: row.detail === null ? null : String(row.detail), sentAt: row.sent_at as Date, sentBy: String(row.sent_by),
  }));
}

export const MAIL_NOT_SET = "Envio de e-mail não configurado: cadastre a caixa da empresa em Parâmetros → E-mail das notas, ou peça à Ávila Ops para ligar a caixa padrão.";

export type SendInvoiceMail = {
  invoiceId: number;
  /** `null`: the e-mail of the customer of the order. */
  to: string | null;
  sentBy: string;
  now: Date;
  env: Record<string, string | undefined>;
  /** Opens the vault, only when the company has a mailbox of its own. */
  key: () => Buffer;
  send: MailSender;
};

/**
 * Sends an invoice to the customer: the authorised XML and the DANFE, or, for a
 * cancelled invoice, the XML of the cancellation. Every attempt that reaches a
 * mail server is recorded with its result; what is refused before that (no
 * mailbox, no address) throws `MailError` and nothing is recorded as sent.
 */
export async function sendInvoiceMail(request: SendInvoiceMail, conn: Queryable): Promise<{ status: "enviado" | "falhou"; recipient: string; detail: string | null }> {
  const { rows } = await conn.query(
    `SELECT i.id, i.status, i.number, i.series, i.access_key, i.authorized_xml, c.name AS customer_name, c.email AS customer_email
       FROM fiscal_invoices i JOIN orders o ON o.id = i.order_id LEFT JOIN customers c ON c.id = o.customer_id WHERE i.id = $1`,
    [request.invoiceId],
  );
  const invoice = rows[0];
  if (!invoice || invoice.authorized_xml === null || !["autorizada", "cancelada"].includes(String(invoice.status))) throw new MailError("Só nota autorizada ou cancelada é enviada por e-mail.");
  const recipient = (request.to ?? (invoice.customer_email === null ? "" : String(invoice.customer_email))).trim().toLowerCase();
  if (recipient === "") throw new MailError("O cliente não tem e-mail no cadastro: informe o destinatário.");
  if (!isMailAddress(recipient)) throw new MailError("E-mail do destinatário inválido.");
  const channel = await mailChannel(conn, request.env, request.key);
  if (!channel) throw new MailError(MAIL_NOT_SET);

  const settings = await loadMailInfo(conn);
  const xml = String(invoice.authorized_xml);
  const data = danfeData(xml);
  const cancelled = invoice.status === "cancelada";
  const words = { numero: String(invoice.number), serie: String(invoice.series), empresa: data.issuer.name, cliente: String(invoice.customer_name ?? data.recipient.name), chave: String(invoice.access_key) };
  const attachments: MailAttachment[] = [{ filename: `NFe${invoice.access_key}.xml`, contentType: "application/xml", content: Buffer.from(xml, "utf8") }];
  let subject = fillMailText(settings.subject ?? DEFAULT_NFE_SUBJECT, words);
  let text = fillMailText(settings.body ?? DEFAULT_NFE_BODY, words);
  if (cancelled) {
    const event = await conn.query("SELECT signed_xml, protocol FROM fiscal_invoice_events WHERE invoice_id = $1 AND kind = 'cancelamento' ORDER BY id DESC LIMIT 1", [request.invoiceId]);
    subject = `Cancelamento da nota fiscal nº ${words.numero} - ${words.empresa}`;
    text = `Olá,\n\nA nota fiscal eletrônica nº ${words.numero}, série ${words.serie}, emitida por ${words.empresa} para ${words.cliente}, foi CANCELADA.\n\nChave de acesso: ${words.chave}${event.rows[0] ? `\nProtocolo do cancelamento: ${event.rows[0].protocol}` : ""}\n\nO XML da nota e o do cancelamento estão em anexo.`;
    if (event.rows[0]) attachments.push({ filename: `Cancelamento-NFe${invoice.access_key}.xml`, contentType: "application/xml", content: Buffer.from(String(event.rows[0].signed_xml), "utf8") });
  } else {
    attachments.push({ filename: `DANFE-${invoice.number}.pdf`, contentType: "application/pdf", content: await renderDanfe(data, { reform: usesReformLayout(data.issuedAt, await loadDanfeReformDate(conn)) }) });
  }
  if (data.homologation) text += "\n\nNOTA EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO: SEM VALOR FISCAL.";

  const message = buildMessage({ from: channel.from, fromName: data.issuer.name, to: recipient, replyTo: settings.replyTo, subject, text, attachments }, request.now);
  let status: "enviado" | "falhou" = "enviado";
  let detail: string | null = null;
  try {
    await request.send(channel.smtp, { from: channel.from, to: recipient }, message);
  } catch (error) {
    status = "falhou";
    detail = (error instanceof MailError ? error.message : "Falha inesperada no envio.").slice(0, 300);
    if (!(error instanceof MailError)) console.error("[e-mail] falha inesperada no envio da nota:", error instanceof Error ? error.message : error);
  }
  await conn.query(
    "INSERT INTO fiscal_invoice_mails (invoice_id, kind, recipient, channel, status, detail, sent_by) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [request.invoiceId, cancelled ? "cancelamento" : "nota", recipient, channel.channel, status, detail, request.sentBy],
  );
  return { status, recipient, detail };
}

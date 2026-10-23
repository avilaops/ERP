import { DEFAULT_NFE_BODY, DEFAULT_NFE_SUBJECT, fillMailText, loadMailInfo, mailChannel } from "@/lib/db/mail";
import { listOrderContracts } from "@/lib/db/contracts";
import type { Queryable } from "@/lib/db/pool";
import { contractFile, contractFileName } from "@/lib/db/send-contract";
import { loadDanfeReformDate } from "@/lib/db/fiscal";
import { danfeData, renderDanfe, usesReformLayout } from "@/lib/fiscal/danfe";
import { buildMessage, isMailAddress, MailError } from "@/lib/mail/message";
import type { MailAttachment } from "@/lib/mail/message";
import type { SmtpConfig } from "@/lib/mail/smtp";

/** How a message is handed to a mail server. The tests give a stand-in. */
export type MailSender = (config: SmtpConfig, envelope: { from: string; to: string }, message: string) => Promise<void>;

export type InvoiceMail = { id: number; invoiceId: number; eventId: number | null; kind: "nota" | "cancelamento" | "correcao"; recipient: string; channel: "empresa" | "avilaops"; status: "enviado" | "falhou"; detail: string | null; sentAt: Date; sentBy: string };

/** Every attempt of sending the invoices of an order, the latest first. */
export async function listOrderInvoiceMails(orderId: number, conn: Queryable): Promise<InvoiceMail[]> {
  const { rows } = await conn.query(
    `SELECT m.id, m.invoice_id, m.event_id, m.kind, m.recipient, m.channel, m.status, m.detail, m.sent_at, m.sent_by
       FROM fiscal_invoice_mails m JOIN fiscal_invoices i ON i.id = m.invoice_id WHERE i.order_id = $1 ORDER BY m.id DESC`,
    [orderId],
  );
  return rows.map((row) => ({
    id: Number(row.id), invoiceId: Number(row.invoice_id), eventId: row.event_id === null ? null : Number(row.event_id), kind: row.kind as InvoiceMail["kind"], recipient: String(row.recipient), channel: row.channel as InvoiceMail["channel"],
    status: row.status as InvoiceMail["status"], detail: row.detail === null ? null : String(row.detail), sentAt: row.sent_at as Date, sentBy: String(row.sent_by),
  }));
}

export const MAIL_NOT_SET = "Envio de e-mail não configurado: cadastre a caixa da empresa em Parâmetros → E-mail das notas, ou peça à Ávila Ops para ligar a caixa padrão.";

export const INVOICE_MAIL_DOCUMENTS = ["xml", "danfe", "evento", "contrato"] as const;
export type InvoiceMailDocument = (typeof INVOICE_MAIL_DOCUMENTS)[number];

export type SendInvoiceMail = {
  invoiceId: number;
  /** Default sends the current invoice and applicable events; correction sends the latest CC-e. */
  kind?: "correcao";
  /** Automatic mail binds to the exact registered event; manual resend may choose latest. */
  eventId?: number;
  /** `null`: the e-mail of the customer of the order. */
  to: string | null;
  /** Undefined keeps the automatic package; the manual form sends exactly this selection. */
  documents?: readonly InvoiceMailDocument[];
  sentBy: string;
  now: Date;
  env: Record<string, string | undefined>;
  /** Opens the vault, only when the company has a mailbox of its own. */
  key: () => Buffer;
  send: MailSender;
};

/**
 * Sends the authorised XML, DANFE and selected CC-e, or the cancellation package.
 * The original invoice is never rewritten by a correction. Every attempt that reaches a
 * mail server is recorded with its result; what is refused before that (no
 * mailbox, no address) throws `MailError` and nothing is recorded as sent.
 */
export async function sendInvoiceMail(request: SendInvoiceMail, conn: Queryable): Promise<{ status: "enviado" | "falhou"; recipient: string; detail: string | null }> {
  if (request.eventId !== undefined && (request.kind !== "correcao" || !Number.isSafeInteger(request.eventId) || request.eventId < 1)) throw new MailError("Evento fiscal inválido para envio.");
  const selected = request.documents === undefined ? null : new Set(request.documents);
  if (selected !== null && selected.size === 0) throw new MailError("Escolha pelo menos um documento para enviar.");
  if (selected !== null && [...selected].some((document) => !INVOICE_MAIL_DOCUMENTS.includes(document))) throw new MailError("Há um documento inválido na seleção de anexos.");
  const { rows } = await conn.query(
    `SELECT i.id, i.status, i.number, i.series, i.access_key, i.authorized_xml, o.id AS order_id, o.number AS order_number, c.name AS customer_name, c.email AS customer_email
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
  if (cancelled && request.kind === "correcao") throw new MailError("A nota está cancelada. Envie o cancelamento.");
  const eventKind = cancelled ? "cancelamento" : "correcao";
  const eventRows = await conn.query("SELECT id, sequence, text, signed_xml, protocol FROM fiscal_invoice_events WHERE invoice_id = $1 AND kind = $2 AND ($3::integer IS NULL OR id=$3) ORDER BY sequence DESC LIMIT 1", [request.invoiceId, eventKind, request.eventId ?? null]);
  const event = eventRows.rows[0];
  if ((cancelled || request.kind === "correcao") && !event) throw new MailError("O evento fiscal ainda não está registrado nesta nota.");
  if (event && (!String(event.signed_xml).includes("<procEventoNFe") || !String(event.signed_xml).includes("<retEvento"))) throw new MailError("O evento antigo não tem o XML completo do recibo. Consulte a SEFAZ para recuperar o arquivo antes de enviar.");
  const words = { numero: String(invoice.number), serie: String(invoice.series), empresa: data.issuer.name, cliente: String(invoice.customer_name ?? data.recipient.name), chave: String(invoice.access_key) };
  const includes = (document: InvoiceMailDocument) => selected === null || selected.has(document);
  const attachments: MailAttachment[] = [];
  if (includes("xml")) attachments.push({ filename: `NFe${invoice.access_key}.xml`, contentType: "application/xml", content: Buffer.from(xml, "utf8") });
  let subject = fillMailText(settings.subject ?? DEFAULT_NFE_SUBJECT, words);
  let text = fillMailText(settings.body ?? DEFAULT_NFE_BODY, words);
  if (cancelled) {
    subject = `Cancelamento da nota fiscal nº ${words.numero} - ${words.empresa}`;
    text = `Olá,\n\nA nota fiscal eletrônica nº ${words.numero}, série ${words.serie}, emitida por ${words.empresa} para ${words.cliente}, foi CANCELADA.\n\nChave de acesso: ${words.chave}\nProtocolo do cancelamento: ${event.protocol}\n\nO XML da nota e o do cancelamento estão em anexo.`;
    if (includes("evento")) attachments.push({ filename: `Cancelamento-NFe${invoice.access_key}.xml`, contentType: "application/xml", content: Buffer.from(String(event.signed_xml), "utf8") });
  } else {
    if (includes("danfe")) attachments.push({ filename: `DANFE-${invoice.number}.pdf`, contentType: "application/pdf", content: await renderDanfe(data, { reform: usesReformLayout(data.issuedAt, await loadDanfeReformDate(conn)) }) });
    if (event && includes("evento")) {
      attachments.push({ filename: `CCe-${event.sequence}-NFe${invoice.access_key}.xml`, contentType: "application/xml", content: Buffer.from(String(event.signed_xml), "utf8") });
      const correctionText = `\n\nCarta de correção nº ${event.sequence}, protocolo ${event.protocol}:\n${event.text}\n\nO XML da CC-e e seu recibo estão em anexo. A carta complementa a nota; o XML autorizado e o DANFE preservam os dados originais.`;
      if (request.kind === "correcao") {
        subject = `Carta de correção da nota fiscal nº ${words.numero} - ${words.empresa}`;
        text = `Olá,\n\nSegue a carta de correção da NF-e nº ${words.numero}, série ${words.serie}.\nChave de acesso: ${words.chave}`;
      }
      text += correctionText;
    }
  }
  if (selected?.has("evento") && !event) throw new MailError("Esta nota ainda não tem evento fiscal disponível para anexar.");
  if (selected?.has("contrato")) {
    const contract = (await listOrderContracts(Number(invoice.order_id), conn)).find((item) => item.status === "assinado");
    if (!contract) throw new MailError("Este pedido ainda não tem contrato assinado para anexar.");
    attachments.push({
      filename: contractFileName(String(invoice.order_number), contract),
      contentType: "application/pdf",
      content: await contractFile(contract, { company: data.issuer.name, orderNumber: String(invoice.order_number), now: request.now, vault: request.key }, conn),
    });
  }
  if (attachments.length === 0) throw new MailError("Nenhum dos documentos escolhidos está disponível para envio.");
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
    "INSERT INTO fiscal_invoice_mails (invoice_id, kind, recipient, channel, status, detail, sent_by, event_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [request.invoiceId, cancelled ? "cancelamento" : request.kind ?? "nota", recipient, channel.channel, status, detail, request.sentBy, event ? Number(event.id) : null],
  );
  return { status, recipient, detail };
}

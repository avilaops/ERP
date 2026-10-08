import { randomInt } from "node:crypto";
import { loadFiscalSettings, loadSealedCertificate } from "@/lib/db/fiscal";
import { countCorrections, listOrderInvoices, loadSignedXml, recordInvoiceEvent, recordVerdict, saveSignedInvoice, takeNextNumber } from "@/lib/db/invoices";
import type { Invoice } from "@/lib/db/invoices";
import { issueInstant, previewOrderNfe } from "@/lib/db/order-nfe";
import { getOrder } from "@/lib/db/orders";
import type { Queryable } from "@/lib/db/pool";
import { openCertificate } from "@/lib/fiscal/certificate";
import { NfeError, accessKey, buildNfeXml } from "@/lib/fiscal/nfe";
import { AUTHORIZATION_ACTION, SefazError, authorizationEnvelope, authorizationUrl, nfeProcXml, parseAuthorization } from "@/lib/fiscal/sefaz";
import { EVENT_ACTION, eventEnvelope, eventUrl, eventXml, parseEvent } from "@/lib/fiscal/events";
import { signEventXml, signingKeyOf, signNfeXml } from "@/lib/fiscal/sign";

/** A refusal of the issuing the user can act on. */
export class IssueError extends Error {}

/** How an envelope reaches SEFAZ: the real channel in production, a stand-in in the tests. */
export type Send = (url: string, action: string, envelope: string, certificate: { pfx: Buffer; passphrase: string }) => Promise<string>;

export type IssueResult = { invoice: Invoice; message: string };

/**
 * Issues the invoice of a closed order: number, XML, signature, storage,
 * transmission and the verdict of SEFAZ, in that order. The signed invoice is
 * stored before anything is sent, so a call that dies half way leaves a trace
 * and never a second number. A rejected invoice is issued again with its own
 * number; an invoice sent without an answer is sent again exactly as signed.
 */
export async function issueOrderNfe(orderNumber: string, who: string, now: Date, vault: Buffer, send: Send, conn: Queryable): Promise<IssueResult> {
  const preview = await previewOrderNfe(orderNumber, now, conn);
  if (!preview) throw new IssueError("Pedido não encontrado ou ainda não fechado: só pedido fechado tem nota.");
  if (preview.problems.length > 0) throw new IssueError(`A nota ainda não pode ser emitida. Falta: ${preview.problems.join(" ")}`);
  const { environment, series } = preview.input;

  const sealed = await loadSealedCertificate(conn);
  if (!sealed) throw new IssueError("Envie o certificado digital A1 em Parâmetros → Fiscal antes de emitir.");
  if (sealed.validUntil.getTime() <= now.getTime()) throw new IssueError("O certificado digital venceu. Envie o certificado em vigor em Parâmetros → Fiscal.");
  const certificate = openCertificate(sealed, vault);
  const url = authorizationUrl(preview.issuerUf, environment);

  const previous = (await listOrderInvoices(preview.orderId, conn)).filter((invoice) => invoice.environment === environment);
  if (previous.some((invoice) => invoice.status === "autorizada")) throw new IssueError("Este pedido já tem nota autorizada.");
  const waiting = previous.find((invoice) => invoice.status === "assinada");

  let invoice: Invoice;
  let signedXml: string;
  if (waiting) {
    // Sent before without an answer: the same bytes go again, so SEFAZ recognises the same invoice.
    const stored = await loadSignedXml(waiting.id, conn);
    if (!stored) throw new Error("A nota aguardando resposta perdeu o XML.");
    invoice = waiting;
    signedXml = stored;
  } else {
    const rejected = previous.find((item) => item.status === "rejeitada" && item.series === series);
    const number = rejected ? rejected.number : await takeNextNumber(conn);
    let randomCode = String(randomInt(0, 100_000_000)).padStart(8, "0");
    if (Number(randomCode) === number) randomCode = String((number + 1) % 100_000_000).padStart(8, "0");

    const numbered = await previewOrderNfe(orderNumber, now, conn, { number, randomCode });
    if (!numbered || numbered.problems.length > 0) throw new IssueError("O pedido mudou enquanto a nota era montada. Tente de novo.");
    let built: { key: string; xml: string };
    try {
      built = buildNfeXml(numbered.input);
    } catch (error) {
      if (error instanceof NfeError) throw new IssueError(error.message);
      throw error;
    }
    signedXml = signNfeXml(built.xml, signingKeyOf(certificate.pfx, certificate.password));
    invoice = await saveSignedInvoice(
      { orderId: preview.orderId, environment, series, number, accessKey: accessKey(numbered.input), signedXml, issuedAt: numbered.input.issuedAt, createdBy: who },
      conn,
    );
  }

  let answer: string;
  try {
    answer = await send(url, AUTHORIZATION_ACTION, authorizationEnvelope(signedXml, String(invoice.id)), { pfx: certificate.pfx, passphrase: certificate.password });
  } catch (error) {
    if (error instanceof SefazError) {
      throw new IssueError(`${error.message} A nota ${invoice.number} ficou guardada como "aguardando resposta": emita de novo para reenviar a mesma nota.`);
    }
    throw error;
  }

  let verdict;
  try {
    verdict = parseAuthorization(answer, invoice.accessKey);
  } catch (error) {
    if (error instanceof SefazError) throw new IssueError(`${error.message} A nota ${invoice.number} ficou guardada como "aguardando resposta".`);
    throw error;
  }
  if (verdict.status === "autorizada") {
    const saved = await recordVerdict(invoice.id, { status: "autorizada", code: verdict.code, reason: verdict.reason, protocol: verdict.protocol, authorizedXml: nfeProcXml(signedXml, verdict.protocolXml) }, conn);
    return { invoice: saved, message: `Nota ${saved.number} autorizada. Protocolo ${verdict.protocol}.` };
  }
  if (verdict.status === "denegada") {
    const saved = await recordVerdict(invoice.id, { status: "denegada", code: verdict.code, reason: verdict.reason, protocol: verdict.protocol }, conn);
    return { invoice: saved, message: `Nota ${saved.number} denegada pela SEFAZ: ${verdict.reason}` };
  }
  if (verdict.status === "rejeitada") {
    const saved = await recordVerdict(invoice.id, { status: "rejeitada", code: verdict.code, reason: verdict.reason }, conn);
    return { invoice: saved, message: `A SEFAZ rejeitou a nota ${saved.number} (${verdict.code}): ${verdict.reason}. Corrija e emita de novo: o número é o mesmo.` };
  }
  const saved = await recordVerdict(invoice.id, { status: "assinada", code: verdict.code, reason: verdict.reason }, conn);
  return { invoice: saved, message: `A SEFAZ ainda não deu o veredito (${verdict.code}: ${verdict.reason}). Emita de novo em instantes: a mesma nota é reenviada.` };
}

/**
 * Registers a cancellation or a correction letter for the authorised invoice of
 * an order, in the environment the company is in. Nothing is written unless
 * SEFAZ registers the event.
 */
export async function registerOrderNfeEvent(
  orderNumber: string,
  kind: "cancelamento" | "correcao",
  text: string,
  who: string,
  now: Date,
  vault: Buffer,
  send: Send,
  conn: Queryable,
): Promise<{ message: string }> {
  const order = await getOrder(orderNumber, { sellerEmail: null }, conn);
  if (!order) throw new IssueError("Pedido não encontrado.");
  const settings = await loadFiscalSettings(conn);
  const invoice = (await listOrderInvoices(order.id, conn)).find((item) => item.status === "autorizada" && item.environment === settings.environment);
  if (!invoice || !invoice.protocol) throw new IssueError("Este pedido não tem nota autorizada neste ambiente.");

  const sealed = await loadSealedCertificate(conn);
  if (!sealed) throw new IssueError("Envie o certificado digital A1 em Parâmetros → Fiscal.");
  if (sealed.validUntil.getTime() <= now.getTime()) throw new IssueError("O certificado digital venceu. Envie o certificado em vigor em Parâmetros → Fiscal.");
  const certificate = openCertificate(sealed, vault);

  const sequence = kind === "cancelamento" ? 1 : (await countCorrections(invoice.id, conn)) + 1;
  let signed: string;
  try {
    const event = eventXml({ kind, environment: invoice.environment, accessKey: invoice.accessKey, cnpj: invoice.accessKey.slice(6, 20), at: issueInstant(now), sequence, protocol: invoice.protocol, text });
    signed = signEventXml(event.xml, signingKeyOf(certificate.pfx, certificate.password));
  } catch (error) {
    if (error instanceof NfeError) throw new IssueError(error.message);
    throw error;
  }

  let result;
  try {
    const answer = await send(eventUrl(settings.uf ?? "", invoice.environment), EVENT_ACTION, eventEnvelope(signed, String(invoice.id)), { pfx: certificate.pfx, passphrase: certificate.password });
    result = parseEvent(answer, invoice.accessKey);
  } catch (error) {
    if (error instanceof SefazError) throw new IssueError(`${error.message} Nada foi gravado: confira a nota na SEFAZ antes de tentar de novo.`);
    throw error;
  }
  if (!result.registered) throw new IssueError(`A SEFAZ não registrou (${result.code}): ${result.reason}`);

  await recordInvoiceEvent({ invoiceId: invoice.id, kind, sequence, text: text.replace(/\s+/g, " ").trim(), signedXml: signed, protocol: result.protocol, statusCode: result.code, createdBy: who }, conn);
  return { message: kind === "cancelamento" ? `Nota ${invoice.number} cancelada. Protocolo ${result.protocol}.` : `Carta de correção ${sequence} registrada. Protocolo ${result.protocol}.` };
}

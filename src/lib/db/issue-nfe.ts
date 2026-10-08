import { randomInt } from "node:crypto";
import { loadFiscalSettings, loadSealedCertificate } from "@/lib/db/fiscal";
import { countCorrections, isNumberVoided, listOrderInvoices, recordNumberVoid, usedNumbersIn, loadSignedXml, recordInvoiceEvent, recordVerdict, saveSignedInvoice, takeNextNumber } from "@/lib/db/invoices";
import type { Invoice } from "@/lib/db/invoices";
import { issueInstant, previewOrderNfe } from "@/lib/db/order-nfe";
import { getOrder } from "@/lib/db/orders";
import type { Queryable } from "@/lib/db/pool";
import type { Send } from "@/lib/fiscal/channel";
import { openCertificate } from "@/lib/fiscal/certificate";
import { NfeError, accessKey, buildNfeXml } from "@/lib/fiscal/nfe";
import {
  AUTHORIZATION_ACTION, CONSULT_ACTION, SefazError, VOID_ACTION, authorizationEnvelope, authorizationUrl, consultEnvelope, consultUrl, nfeProcXml,
  parseAuthorization, parseConsult, parseVoid, voidEnvelope, voidUrl, voidXml,
} from "@/lib/fiscal/sefaz";
import { EVENT_ACTION, eventEnvelope, eventUrl, eventXml, parseEvent } from "@/lib/fiscal/events";
import { UF_CODES } from "@/lib/fiscal/nfe";
import { signEventXml, signingKeyOf, signNfeXml, signVoidXml } from "@/lib/fiscal/sign";

/** A refusal of the issuing the user can act on. */
export class IssueError extends Error {}

export type { Send } from "@/lib/fiscal/channel";

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
    const stored = await loadSignedXml(waiting.id, conn);
    if (!stored) throw new Error("A nota aguardando resposta perdeu o XML.");
    invoice = waiting;
    signedXml = stored;
    // Sent before without an answer: first ask SEFAZ what it has. Only an invoice it never received is sent again.
    let known;
    try {
      known = parseConsult(await send(consultUrl(preview.issuerUf, environment), CONSULT_ACTION, consultEnvelope(waiting.accessKey, environment), { pfx: certificate.pfx, passphrase: certificate.password }), waiting.accessKey);
    } catch (error) {
      if (error instanceof SefazError) throw new IssueError(`${error.message} A nota ${waiting.number} continua aguardando resposta.`);
      throw error;
    }
    if (known.status === "autorizada") {
      const saved = await recordVerdict(waiting.id, { status: "autorizada", code: known.code, reason: known.reason, protocol: known.protocol, authorizedXml: nfeProcXml(stored, known.protocolXml) }, conn);
      return { invoice: saved, message: `A nota ${saved.number} já estava autorizada na SEFAZ. Protocolo ${known.protocol}.` };
    }
    if (known.status !== "nao-consta") {
      throw new IssueError(`A SEFAZ respondeu sobre a nota ${waiting.number} (${known.code}): ${known.reason}. Nada foi reenviado; confira com o contador.`);
    }
  } else {
    const rejected = previous.find((item) => item.status === "rejeitada" && item.series === series);
    // A rejected invoice is issued again with its number, unless that number was made unusable meanwhile.
    const reuse = rejected && !(await isNumberVoided(environment, series, rejected.number, conn)) ? rejected.number : null;
    const number = reuse ?? (await takeNextNumber(conn));
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
): Promise<{ invoiceId: number; message: string }> {
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
  return { invoiceId: invoice.id, message: kind === "cancelamento" ? `Nota ${invoice.number} cancelada. Protocolo ${result.protocol}.` : `Carta de correção ${sequence} registrada. Protocolo ${result.protocol}.` };
}

/**
 * Makes a range of numbers unusable at SEFAZ: numbers the company skipped and
 * will never issue. Refused here when a number of the range already is an
 * invoice with a verdict, or was not reached by the counter yet.
 */
export async function voidInvoiceNumbers(
  range: { series: number; first: number; last: number; reason: string },
  who: string,
  now: Date,
  vault: Buffer,
  send: Send,
  conn: Queryable,
): Promise<{ message: string }> {
  const settings = await loadFiscalSettings(conn);
  if (!settings.cnpj || !settings.uf || !UF_CODES[settings.uf]) throw new IssueError("Preencha o CNPJ e a UF da empresa em Parâmetros → Fiscal.");
  if (!(range.last < settings.nextNumber)) throw new IssueError(`Só dá para inutilizar número que o sistema já passou: o próximo da empresa é o ${settings.nextNumber}.`);
  const used = await usedNumbersIn(settings.environment, range.series, range.first, range.last, conn);
  if (used.length > 0) throw new IssueError(`Há nota com veredito da SEFAZ nesta faixa (número ${used.join(", ")}): ela não pode ser inutilizada.`);

  const sealed = await loadSealedCertificate(conn);
  if (!sealed) throw new IssueError("Envie o certificado digital A1 em Parâmetros → Fiscal.");
  if (sealed.validUntil.getTime() <= now.getTime()) throw new IssueError("O certificado digital venceu. Envie o certificado em vigor em Parâmetros → Fiscal.");
  const certificate = openCertificate(sealed, vault);

  let signed: string;
  let result;
  try {
    const request = voidXml({ environment: settings.environment, stateCode: UF_CODES[settings.uf], year: issueInstant(now).slice(2, 4), cnpj: settings.cnpj, series: range.series, first: range.first, last: range.last, reason: range.reason });
    signed = signVoidXml(request.xml, signingKeyOf(certificate.pfx, certificate.password));
    result = parseVoid(await send(voidUrl(settings.uf, settings.environment), VOID_ACTION, voidEnvelope(signed), { pfx: certificate.pfx, passphrase: certificate.password }));
  } catch (error) {
    if (error instanceof SefazError) throw new IssueError(error.message);
    throw error;
  }
  if (!result.registered) throw new IssueError(`A SEFAZ não inutilizou (${result.code}): ${result.reason}`);

  await recordNumberVoid({ environment: settings.environment, series: range.series, first: range.first, last: range.last, reason: range.reason.replace(/\s+/g, " ").trim(), signedXml: signed, protocol: result.protocol, createdBy: who }, conn);
  return { message: `Numeração ${range.first} a ${range.last} inutilizada. Protocolo ${result.protocol}.` };
}

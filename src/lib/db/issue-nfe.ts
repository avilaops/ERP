import { randomInt } from "node:crypto";
import { loadFiscalSettings, loadSealedCertificate } from "@/lib/db/fiscal";
import { countCorrections, isNumberVoided, listOrderInvoices, recordNumberVoid, usedNumbersIn, loadSignedXml, recordInvoiceEvent, recordVerdict, saveSignedInvoice, takeNextNumber, InvoicePreparationChanged } from "@/lib/db/invoices";
import type { Invoice } from "@/lib/db/invoices";
import { issueInstant, previewOrderNfe } from "@/lib/db/order-nfe";
import { getOrder } from "@/lib/db/orders";
import type { Queryable } from "@/lib/db/pool";
import { withQueryableConnection } from "@/lib/db/pool";
import type { Send } from "@/lib/fiscal/channel";
import type { LayoutCheck } from "@/lib/fiscal/precheck";
import { openCertificate } from "@/lib/fiscal/certificate";
import { NfeError, accessKey, buildNfeXml, isAcceptableRandomCode } from "@/lib/fiscal/nfe";
import {
  AUTHORIZATION_ACTION, CONSULT_ACTION, NUMBER_TAKEN, SefazError, VOID_ACTION, authorizationEnvelope, authorizationUrl, consultEnvelope, consultEvents, consultUrl, nfeProcXml,
  parseAuthorization, parseConsult, parseVoid, voidEnvelope, voidUrl, voidXml,
} from "@/lib/fiscal/sefaz";
import { EVENT_ACTION, eventEnvelope, eventUrl, eventXml, parseEvent, processedEventXml } from "@/lib/fiscal/events";
import { UF_CODES } from "@/lib/fiscal/nfe";
import { signEventXml, signingKeyOf, signNfeXml, signVoidXml } from "@/lib/fiscal/sign";
import { assertFiscalXml, FiscalXmlError } from "@/lib/fiscal/local-layout";
import type { FiscalXmlKind } from "@/lib/fiscal/local-layout";

/** A refusal of the issuing the user can act on. */
export class IssueError extends Error {}

/** "Rejeição: Duplicidade de Evento" (MOC 7.0, Anexo I): the event of that type and sequence already exists for the invoice. */
const DUPLICATED_EVENT = "573";

async function checkLocalXml(xml: string, kind: FiscalXmlKind): Promise<void> {
  try {
    await assertFiscalXml(xml, kind);
  } catch (error) {
    if (error instanceof FiscalXmlError) throw new IssueError(error.message);
    throw error;
  }
}

export type { Send } from "@/lib/fiscal/channel";

export type IssueResult = { invoice: Invoice; message: string };

/**
 * Issues the invoice of a closed order: number, XML, signature, storage,
 * transmission and the verdict of SEFAZ, in that order. The signed invoice is
 * stored before anything is sent, so a call that dies half way leaves a trace
 * and never a second number. A rejected invoice is issued again with its own
 * number; an invoice sent without an answer is sent again exactly as signed.
 * The local XSD check is mandatory before numbering and before transmission.
 * `check` may add an external conference; it never replaces the local check.
 */
export async function issueOrderNfe(orderNumber: string, who: string, now: Date, vault: Buffer, send: Send, conn: Queryable, check: LayoutCheck | null = null, fiscalJobId?: number): Promise<IssueResult> {
  return withQueryableConnection(conn, held => issueOnConnection(orderNumber, who, now, vault, send, held, check, fiscalJobId));
}

async function linkInvoiceToJob(invoiceId: number, fiscalJobId: number | undefined, conn: Queryable): Promise<void> {
  if (fiscalJobId === undefined) return;
  await conn.query("UPDATE fiscal_invoices SET fiscal_job_id = $2 WHERE id = $1", [invoiceId, fiscalJobId]);
  await conn.query("UPDATE fiscal_jobs SET invoice_id = $2 WHERE id = $1", [fiscalJobId, invoiceId]);
}

async function prepareOrderInvoice(orderNumber: string, who: string, now: Date, vault: Buffer, send: Send, conn: Queryable, check: LayoutCheck | null, fiscalJobId?: number) {
  await conn.query("BEGIN");
  try {
    // Serialize preparation of this order and roll back its number on any refusal.
    await conn.query("SELECT id FROM orders WHERE number=$1 FOR UPDATE", [orderNumber]);
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
        await linkInvoiceToJob(saved.id, fiscalJobId, conn);
        await conn.query("COMMIT");
        return { completed: { invoice: saved, message: `A nota ${saved.number} já estava autorizada na SEFAZ. Protocolo ${known.protocol}.` } };
      }
      if (known.status !== "nao-consta") {
        throw new IssueError(`A SEFAZ respondeu sobre a nota ${waiting.number} (${known.code}): ${known.reason}. Nada foi reenviado; confira com o contador.`);
      }
      await checkLocalXml(stored, "nfe");
    } else {
      let draft: string;
      try {
        draft = signNfeXml(buildNfeXml(preview.input).xml, signingKeyOf(certificate.pfx, certificate.password));
      } catch (error) {
        if (error instanceof NfeError) throw new IssueError(error.message);
        throw error;
      }
      await checkLocalXml(draft, "nfe");
      if (check) {
        const problems = await check(draft);
        if (problems.length > 0) throw new IssueError(`A nota não passou na conferência do leiaute oficial e não foi enviada; nenhum número foi usado. ${problems.join(" · ")}`);
      }
      const rejected = previous.find((item) => item.status === "rejeitada" && item.series === series);
      // A rejected invoice is issued again with its number, unless that number was made unusable meanwhile
      // or the rejection itself says the number already belongs to another invoice at SEFAZ (204, 539…).
      const reuse = rejected && !NUMBER_TAKEN.has(rejected.statusCode ?? "") && !(await isNumberVoided(environment, series, rejected.number, conn)) ? rejected.number : null;
      const number = reuse ?? (await takeNextNumber(conn));
      // Rule B03-10: never the number of the invoice, nor repeated or sequential digits (rejection 897).
      let randomCode: string;
      do randomCode = String(randomInt(0, 100_000_000)).padStart(8, "0");
      while (!isAcceptableRandomCode(randomCode, number));

      const numbered = await previewOrderNfe(orderNumber, now, conn, { number, randomCode });
      if (!numbered || numbered.problems.length > 0 || numbered.rulesRevision !== preview.rulesRevision) throw new IssueError("O pedido ou a preparação fiscal mudou enquanto a nota era montada. Confira e tente de novo.");
      let built: { key: string; xml: string };
      try {
        built = buildNfeXml(numbered.input);
      } catch (error) {
        if (error instanceof NfeError) throw new IssueError(error.message);
        throw error;
      }
      signedXml = signNfeXml(built.xml, signingKeyOf(certificate.pfx, certificate.password));
      await checkLocalXml(signedXml, "nfe");
      try {
        invoice = await saveSignedInvoice(
          { orderId: preview.orderId, environment, series, number, accessKey: accessKey(numbered.input), signedXml, issuedAt: numbered.input.issuedAt, createdBy: who, rulesRevision: numbered.rulesRevision },
          conn,
        );
      } catch (error) {
        if (error instanceof InvoicePreparationChanged) throw new IssueError(error.message);
        throw error;
      }
    }

    await linkInvoiceToJob(invoice.id, fiscalJobId, conn);

    await conn.query("COMMIT");
    return { invoice, signedXml, certificate, url, environment, issuerUf:preview.issuerUf };
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  }
}

async function issueOnConnection(orderNumber: string, who: string, now: Date, vault: Buffer, send: Send, conn: Queryable, check: LayoutCheck | null, fiscalJobId?: number): Promise<IssueResult> {
  const prepared = await prepareOrderInvoice(orderNumber, who, now, vault, send, conn, check, fiscalJobId);
  if (prepared.completed) return prepared.completed;
  const { invoice, signedXml, certificate, url, environment, issuerUf } = prepared;

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
    if (verdict.code === "204") {
      // Duplicated (rule 2B08-20): SEFAZ already has an invoice with this number. When it is this very key, it was
      // authorised in a call whose answer never arrived: the protocol is fetched, and nothing is issued twice.
      let known;
      try {
        known = parseConsult(await send(consultUrl(issuerUf, environment), CONSULT_ACTION, consultEnvelope(invoice.accessKey, environment), { pfx: certificate.pfx, passphrase: certificate.password }), invoice.accessKey);
      } catch (error) {
        if (error instanceof SefazError) throw new IssueError(`A SEFAZ diz que a nota ${invoice.number} já existe (204) e a consulta dela falhou: ${error.message} A nota continua aguardando resposta: emita de novo para consultar outra vez.`);
        throw error;
      }
      if (known.status === "autorizada") {
        const saved = await recordVerdict(invoice.id, { status: "autorizada", code: known.code, reason: known.reason, protocol: known.protocol, authorizedXml: nfeProcXml(signedXml, known.protocolXml) }, conn);
        return { invoice: saved, message: `A nota ${saved.number} já estava autorizada na SEFAZ. Protocolo ${known.protocol}.` };
      }
      // SEFAZ says the number is taken and does not show this key (yet, or because the number belongs to another invoice).
      // Giving it up for rejected here could issue the same sale twice: the invoice keeps waiting, and a person decides.
      throw new IssueError(
        `A SEFAZ diz que a nota ${invoice.number} já existe (204), mas a consulta da chave respondeu ${known.code}: ${known.reason}. Nada foi dado por rejeitado nem emitido de novo. ` +
          `Emita outra vez em alguns minutos; se continuar assim, confira com o contador se o número ${invoice.number} da série ${invoice.series} já foi usado fora deste sistema.`,
      );
    }
    const saved = await recordVerdict(invoice.id, { status: "rejeitada", code: verdict.code, reason: verdict.reason }, conn);
    const next = NUMBER_TAKEN.has(verdict.code) ? "Esse número já tem dono na SEFAZ: a próxima emissão sai com um número novo. Confira com o contador a nota que está lá." : "Corrija e emita de novo: o número é o mesmo.";
    return { invoice: saved, message: `A SEFAZ rejeitou a nota ${saved.number} (${verdict.code}): ${verdict.reason}. ${next}` };
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
  context: { invoiceId?: number; fiscalJobId?: number } = {},
): Promise<{ invoiceId: number; eventId: number; message: string }> {
  const order = await getOrder(orderNumber, { sellerEmail: null }, conn);
  if (!order) throw new IssueError("Pedido não encontrado.");
  const settings = await loadFiscalSettings(conn);
  const invoice = (await listOrderInvoices(order.id, conn)).find((item) =>
    item.status === "autorizada" && (context.invoiceId === undefined ? item.environment === settings.environment : item.id === context.invoiceId),
  );
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
    await checkLocalXml(signed, "evento");
  } catch (error) {
    if (error instanceof NfeError) throw new IssueError(error.message);
    throw error;
  }

  let result;
  let processed: string | null = null;
  try {
    const answer = await send(eventUrl(settings.uf ?? "", invoice.environment), EVENT_ACTION, eventEnvelope(signed, String(invoice.id)), { pfx: certificate.pfx, passphrase: certificate.password });
    result = parseEvent(answer, invoice.accessKey);
    if (result.registered) processed = processedEventXml(signed, answer);
  } catch (error) {
    if (error instanceof SefazError) throw new IssueError(`${error.message} Nada foi gravado: confira a nota na SEFAZ antes de tentar de novo.`);
    throw error;
  }
  if (!result.registered && result.code === DUPLICATED_EVENT) {
    // The event of this number is already at SEFAZ: it was registered in a call whose answer never arrived.
    // The consultation of the invoice brings it back, with its protocol, and it is written as it is there.
    let found;
    try {
      const answer = await send(consultUrl(settings.uf ?? "", invoice.environment), CONSULT_ACTION, consultEnvelope(invoice.accessKey, invoice.environment), { pfx: certificate.pfx, passphrase: certificate.password });
      found = consultEvents(answer, invoice.accessKey).find((event) => event.kind === kind && event.sequence === sequence);
    } catch (error) {
      if (error instanceof SefazError) throw new IssueError(`A SEFAZ diz que este evento já existe (573) e a consulta da nota falhou: ${error.message} Nada foi gravado.`);
      throw error;
    }
    if (!found) throw new IssueError(`A SEFAZ não registrou (${result.code}): ${result.reason}. A consulta da nota não trouxe esse evento: confira no portal da SEFAZ.`);
    const eventId = await recordInvoiceEvent({ invoiceId: invoice.id, kind, sequence, text: found.text, signedXml: found.xml, protocol: found.protocol, statusCode: found.code, createdBy: who, fiscalJobId: context.fiscalJobId }, conn);
    if (kind === "cancelamento") return { invoiceId: invoice.id, eventId, message: `A nota ${invoice.number} já estava cancelada na SEFAZ. Protocolo ${found.protocol}.` };
    if (found.text === text.replace(/\s+/g, " ").trim()) return { invoiceId: invoice.id, eventId, message: `A carta de correção ${sequence} já estava registrada na SEFAZ. Protocolo ${found.protocol}.` };
    throw new IssueError(`A carta de correção ${sequence} já estava registrada na SEFAZ com outro texto ("${found.text}", protocolo ${found.protocol}) e foi gravada aqui. Se a correção de agora ainda é necessária, registre de novo: ela sai como a carta ${sequence + 1}.`);
  }
  if (!result.registered) throw new IssueError(`A SEFAZ não registrou (${result.code}): ${result.reason}`);
  if (processed === null) throw new IssueError("O recibo completo do evento não foi obtido. Consulte a SEFAZ antes de reenviar.");

  const eventId = await recordInvoiceEvent({ invoiceId: invoice.id, kind, sequence, text: text.replace(/\s+/g, " ").trim(), signedXml: processed, protocol: result.protocol, statusCode: result.code, createdBy: who, fiscalJobId: context.fiscalJobId }, conn);
  return { invoiceId: invoice.id, eventId, message: kind === "cancelamento" ? `Nota ${invoice.number} cancelada. Protocolo ${result.protocol}.` : `Carta de correção ${sequence} registrada. Protocolo ${result.protocol}.` };
}

/**
 * Makes a range of numbers unusable at SEFAZ: numbers the company skipped and
 * will never issue. Refused here when a number of the range already is an
 * invoice with a verdict, or was not reached by the counter yet.
 */
export type NumberVoidRange = { series: number; first: number; last: number; reason: string };

/** A signed request is made and stored before the fiscal worker talks to SEFAZ. */
export type PreparedNumberVoid = NumberVoidRange & {
  environment: "homologacao" | "producao";
  issuerUf: string;
  signedXml: string;
};

/** Validates the range and signs its immutable request, without transmitting it. */
export async function prepareNumberVoid(
  range: NumberVoidRange,
  now: Date,
  vault: Buffer,
  conn: Queryable,
): Promise<PreparedNumberVoid> {
  const settings = await loadFiscalSettings(conn);
  if (!settings.cnpj || !settings.uf || !UF_CODES[settings.uf]) throw new IssueError("Preencha o CNPJ e a UF da empresa em Parâmetros → Fiscal.");
  if (!(range.last < settings.nextNumber)) throw new IssueError(`Só dá para inutilizar número que o sistema já passou: o próximo da empresa é o ${settings.nextNumber}.`);
  const used = await usedNumbersIn(settings.environment, range.series, range.first, range.last, conn);
  if (used.length > 0) throw new IssueError(`Há nota com veredito da SEFAZ nesta faixa (número ${used.join(", ")}): ela não pode ser inutilizada.`);

  const sealed = await loadSealedCertificate(conn);
  if (!sealed) throw new IssueError("Envie o certificado digital A1 em Parâmetros → Fiscal.");
  if (sealed.validUntil.getTime() <= now.getTime()) throw new IssueError("O certificado digital venceu. Envie o certificado em vigor em Parâmetros → Fiscal.");
  const certificate = openCertificate(sealed, vault);
  let signedXml: string;
  try {
    const request = voidXml({ environment: settings.environment, stateCode: UF_CODES[settings.uf], year: issueInstant(now).slice(2, 4), cnpj: settings.cnpj, series: range.series, first: range.first, last: range.last, reason: range.reason });
    signedXml = signVoidXml(request.xml, signingKeyOf(certificate.pfx, certificate.password));
    await checkLocalXml(signedXml, "inutilizacao");
  } catch (error) {
    if (error instanceof SefazError) throw new IssueError(error.message);
    throw error;
  }
  return { environment: settings.environment, issuerUf: settings.uf, series: range.series, first: range.first, last: range.last, reason: range.reason.replace(/\s+/g, " ").trim(), signedXml };
}

/** Sends exactly the signed request that was persisted with the operation. */
export async function sendPreparedNumberVoid(
  prepared: PreparedNumberVoid,
  who: string,
  now: Date,
  vault: Buffer,
  send: Send,
  conn: Queryable,
): Promise<{ message: string }> {
  const sealed = await loadSealedCertificate(conn);
  if (!sealed) throw new IssueError("Envie o certificado digital A1 em Parâmetros → Fiscal.");
  if (sealed.validUntil.getTime() <= now.getTime()) throw new IssueError("O certificado digital venceu. Envie o certificado em vigor em Parâmetros → Fiscal.");
  const certificate = openCertificate(sealed, vault);
  let result;
  try {
    result = parseVoid(await send(voidUrl(prepared.issuerUf, prepared.environment), VOID_ACTION, voidEnvelope(prepared.signedXml), { pfx: certificate.pfx, passphrase: certificate.password }));
  } catch (error) {
    if (error instanceof SefazError) throw new IssueError(error.message);
    throw error;
  }
  if (!result.registered) throw new IssueError(`A SEFAZ não inutilizou (${result.code}): ${result.reason}`);

  await recordNumberVoid({ environment: prepared.environment, series: prepared.series, first: prepared.first, last: prepared.last, reason: prepared.reason, signedXml: prepared.signedXml, protocol: result.protocol, createdBy: who }, conn);
  return { message: `Numeração ${prepared.first} a ${prepared.last} inutilizada. Protocolo ${result.protocol}.` };
}

export async function voidInvoiceNumbers(
  range: { series: number; first: number; last: number; reason: string },
  who: string,
  now: Date,
  vault: Buffer,
  send: Send,
  conn: Queryable,
): Promise<{ message: string }> {
  return sendPreparedNumberVoid(await prepareNumberVoid(range, now, vault, conn), who, now, vault, send, conn);
}

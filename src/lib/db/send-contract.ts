import { PDFDocument } from "pdf-lib";
import { renderContractPdf, withEvidence } from "@/lib/contract/pdf";
import { sealPdf } from "@/lib/contract/seal";
import { maskedPhone, mobileNumber, smsAvailable, smsConfig, SmsError } from "@/lib/contract/sms";
import type { SmsSender } from "@/lib/contract/sms";
import { blankWords, contractNumber, contractValues, DEFAULT_CONTRACT_BODY, DEFAULT_CONTRACT_TITLE, fillContract } from "@/lib/contract/text";
import { CODE_MINUTES, fingerprint, hashCode, hashToken, newCode, newToken } from "@/lib/contract/token";
import { isValidCpf, normalizeDocument } from "@/lib/customer";
import { loadLogo, loadProposalSettings } from "@/lib/db/company";
import {
  addContractEvent, ContractError, createContract, DEFAULT_CONTRACT_MAIL_BODY, DEFAULT_CONTRACT_MAIL_SUBJECT, fillContractMail, getOrderContract, isOpen, loadContractPdf, loadContractSettings,
  loadEvidence, nextContractSequence, renewContractLink, signWithCode, startCode,
} from "@/lib/db/contracts";
import type { Contract, SigningContract } from "@/lib/db/contracts";
import { loadContractSeal } from "@/lib/db/contract-seal";
import { loadFiscalSettings } from "@/lib/db/fiscal";
import { loadMailInfo, mailChannel } from "@/lib/db/mail";
import type { Order } from "@/lib/db/orders";
import type { Queryable } from "@/lib/db/pool";
import { loadPublishedTable } from "@/lib/db/price-table";
import { MAIL_NOT_SET } from "@/lib/db/send-nfe-mail";
import type { MailSender } from "@/lib/db/send-nfe-mail";
import { isoDate, showDateTime } from "@/lib/format";
import { buildMessage, isMailAddress, MailError } from "@/lib/mail/message";
import type { MailAttachment } from "@/lib/mail/message";
import { dueDates, paymentOf, saleOf } from "@/lib/order-quote";
import { logoPng } from "@/lib/photos/normalize";
import { quoteDocument } from "@/lib/quote/document";

/** The logo as embedded: three times the box it is drawn in. */
const LOGO_SIDE = { width: 510, height: 144 };

/** How the messages leave: the server's environment, the key of the vault and the function that talks to the mail server. */
export type MailWay = { env: Record<string, string | undefined>; key: () => Buffer; send: MailSender; /** How a text message is handed to the provider, for the second code. */ sms?: SmsSender };

export type OrderContractDraft = {
  title: string;
  /** The text with the values of the order. */
  body: string;
  /** Fields the text uses and this order has nothing for, in the words of the screen. */
  blanks: string[];
};

/**
 * The contract of an order as it would leave now: the company's model (or the
 * standard one) filled with the order. Made from the same account as the
 * quotation, so it never reads a cost.
 */
export async function draftOrderContract(order: Order, company: string, now: Date, conn: Queryable): Promise<OrderContractDraft> {
  if (order.status !== "fechado") throw new ContractError("O contrato é emitido depois que o pedido é fechado.");
  if (!order.customer) throw new ContractError("Vincule o cliente ao pedido antes de gerar o contrato.");
  if (order.items.length === 0) throw new ContractError("O pedido não tem equipamento.");
  const table = await loadPublishedTable(order.priceTableVersion, conn);
  if (!table) throw new ContractError("A tabela de preços deste pedido não foi encontrada.");
  const today = isoDate(now);
  const sale = saleOf(order, table);
  const proposal = await loadProposalSettings(conn);
  const quote = quoteDocument({
    company, order, table, sale, today, dates: dueDates(order, table, today), products: new Map(), manager: proposal.managerName, place: proposal.place,
    payment: { plan: paymentOf(order, sale, table, today), onDelivery: order.balanceOnDelivery },
  });
  const settings = await loadContractSettings(conn);
  const template = settings.body ?? DEFAULT_CONTRACT_BODY;
  const values = contractValues({ company, issuer: await loadFiscalSettings(conn), customer: order.customer, orderNumber: order.number, quote });
  return { title: settings.title ?? DEFAULT_CONTRACT_TITLE, body: fillContract(template, values), blanks: blankWords(template, values) };
}

async function logoOf(conn: Queryable): Promise<Uint8Array | null> {
  const stored = await loadLogo(conn);
  // A logo that cannot be read does not stop the contract: the company's name goes in its place.
  return stored ? await logoPng(stored.bytes, LOGO_SIDE.width, LOGO_SIDE.height).catch(() => null) : null;
}

/** The PDF of the contract as it would leave now, for conference: nothing is stored or sent. */
export async function previewOrderContract(order: Order, company: string, now: Date, conn: Queryable): Promise<Uint8Array> {
  const draft = await draftOrderContract(order, company, now, conn);
  const sequence = await nextContractSequence(order.id, conn);
  return renderContractPdf({ company, title: draft.title, number: contractNumber(order.number, sequence), body: draft.body }, await logoOf(conn));
}

type Delivery = { status: "enviado" | "falhou"; detail: string | null };

/** Hands one message to the mail server. A refusal of the server is an answer, not an exception. */
async function deliver(way: MailWay, conn: Queryable, mail: { company: string; to: string; subject: string; text: string; attachments?: MailAttachment[] }, now: Date): Promise<Delivery> {
  const channel = await mailChannel(conn, way.env, way.key);
  if (!channel) throw new MailError(MAIL_NOT_SET);
  const { replyTo } = await loadMailInfo(conn);
  const message = buildMessage({ from: channel.from, fromName: mail.company, to: mail.to, replyTo, subject: mail.subject, text: mail.text, attachments: mail.attachments ?? [] }, now);
  try {
    await way.send(channel.smtp, { from: channel.from, to: mail.to }, message);
    return { status: "enviado", detail: null };
  } catch (error) {
    if (!(error instanceof MailError)) console.error("[contrato] falha inesperada no envio:", error instanceof Error ? error.message : error);
    return { status: "falhou", detail: (error instanceof MailError ? error.message : "Falha inesperada no envio.").slice(0, 300) };
  }
}

/** The address the customer signs at. The company is in it, but only the secret opens anything. */
export const signingUrl = (appUrl: string, tenant: string, token: string) => `${appUrl.replace(/\/+$/, "")}/contrato/${tenant}/${token}`;

async function mailLink(contract: Contract, order: Pick<Order, "number">, link: string, context: SendContext, conn: Queryable): Promise<Delivery> {
  const settings = await loadContractSettings(conn);
  const words = { empresa: context.company, cliente: contract.recipientName, pedido: order.number, link, validade: showDateTime(contract.expiresAt) };
  const delivery = await deliver(
    context.way, conn,
    { company: context.company, to: contract.recipientEmail, subject: fillContractMail(settings.mailSubject ?? DEFAULT_CONTRACT_MAIL_SUBJECT, words), text: fillContractMail(settings.mailBody ?? DEFAULT_CONTRACT_MAIL_BODY, words) },
    context.now,
  );
  await addContractEvent(
    contract.id, "email",
    { detail: delivery.status === "enviado" ? `link de assinatura enviado para ${contract.recipientEmail}` : `o link para ${contract.recipientEmail} não saiu: ${delivery.detail}`, actor: context.sentBy },
    conn,
  );
  return delivery;
}

export type SendContext = {
  company: string;
  /** Slug of the company of the session: it goes in the address of the link. */
  tenant: string;
  /** Public address of the ERP, without the final slash. */
  appUrl: string;
  sentBy: string;
  now: Date;
  way: MailWay;
};

export type SentContract = { contract: Contract; delivery: Delivery };

export const SMS_NOT_SET = "O segundo código pelo celular está ligado em Parâmetros → Contrato, mas o serviço de SMS não está configurado neste servidor. Desligue a opção ou avise a Ávila Ops.";

/**
 * Who signs for the customer, from what was typed or, blank, from the
 * customer's register. When the company asks for the second code, the mobile
 * phone of who signs is part of it, and the service that sends it has to exist.
 */
async function recipientOf(order: Order, typed: { name: string | null; email: string | null; phone?: string | null }, way: MailWay, conn: Queryable): Promise<{ name: string; email: string; phone: string | null }> {
  const email = (typed.email ?? order.customer?.email ?? "").trim().toLowerCase();
  const name = (typed.name ?? "").trim() || order.customer?.contactName?.trim() || order.customer?.name || "";
  if (email === "") throw new ContractError("O cliente não tem e-mail no cadastro: informe o e-mail de quem assina.");
  if (!isMailAddress(email)) throw new ContractError("E-mail de quem assina inválido.");
  if (name === "") throw new ContractError("Informe o nome de quem assina pelo cliente.");
  if (name.length > 120) throw new ContractError("Nome de quem assina: até 120 letras.");
  if (!(await loadContractSettings(conn)).secondFactor) return { name, email, phone: null };
  if (!way.sms || !smsAvailable(way.env)) throw new ContractError(SMS_NOT_SET);
  const phone = mobileNumber(typed.phone ?? order.customer?.phone ?? "");
  if (!phone) throw new ContractError("Informe o celular de quem assina, com DDD: o segundo código de confirmação vai por SMS para ele.");
  return { name, email, phone };
}

/** Keeps the file as it leaves, with its fingerprint and a new secret link, and writes to the customer. */
async function keepAndSend(order: Order, file: { title: string; body: string; pdf: Uint8Array; sequence: number; fileName: string | null }, recipient: { name: string; email: string; phone: string | null }, context: SendContext, conn: Queryable): Promise<SentContract> {
  const settings = await loadContractSettings(conn);
  const token = newToken();
  const contract = await createContract(
    {
      orderId: order.id, sequence: file.sequence, title: file.title, body: file.body, pdf: file.pdf, sha256: fingerprint(file.pdf), tokenHash: hashToken(token), fileName: file.fileName,
      expiresAt: new Date(context.now.getTime() + settings.linkDays * 86_400_000), recipientName: recipient.name, recipientEmail: recipient.email, recipientPhone: recipient.phone, createdBy: context.sentBy,
    },
    conn,
  );
  await addContractEvent(contract.id, "enviado", { detail: `para ${recipient.name} <${recipient.email}>${file.fileName ? `, arquivo ${file.fileName}` : ""}`, actor: context.sentBy }, conn);
  return { contract, delivery: await mailLink(contract, order, signingUrl(context.appUrl, context.tenant, token), context, conn) };
}

/**
 * "Enviar contrato para assinatura". Draws the contract, keeps the file and
 * its fingerprint, and writes to the customer with the link. What is refused
 * before the contract exists (no mailbox, no address, order not closed) throws;
 * a mail server that refuses the message leaves the contract waiting, and the
 * link can be sent again.
 */
export async function sendOrderContract(order: Order, recipient: { name: string | null; email: string | null; phone?: string | null }, context: SendContext, conn: Queryable): Promise<SentContract> {
  const draft = await draftOrderContract(order, context.company, context.now, conn);
  const signer = await recipientOf(order, recipient, context.way, conn);
  if (!(await mailChannel(conn, context.way.env, context.way.key))) throw new MailError(MAIL_NOT_SET);
  const sequence = await nextContractSequence(order.id, conn);
  const pdf = await renderContractPdf({ company: context.company, title: draft.title, number: contractNumber(order.number, sequence), body: draft.body }, await logoOf(conn));
  return keepAndSend(order, { title: draft.title, body: draft.body, pdf, sequence, fileName: null }, signer, context, conn);
}

/** A PDF of a contract is a few pages; a scanned one may be heavier. */
export const MAX_CONTRACT_PDF_BYTES = 6 * 1024 * 1024;

/**
 * "Enviar um PDF próprio para assinatura": the company sends the contract
 * ready, and that is the file the customer reads and signs. It is kept byte by
 * byte; the ERP only adds the record of signatures after it. A file that is
 * not a PDF, is locked with a password or cannot take that record is refused
 * before anything is stored or sent.
 */
export async function sendUploadedContract(order: Order, file: { bytes: Uint8Array; name: string }, recipient: { name: string | null; email: string | null; phone?: string | null }, context: SendContext, conn: Queryable): Promise<SentContract> {
  if (order.status !== "fechado") throw new ContractError("O contrato é enviado depois que o pedido é fechado.");
  if (file.bytes.byteLength === 0) throw new ContractError("Escolha o arquivo do contrato em PDF.");
  if (file.bytes.byteLength > MAX_CONTRACT_PDF_BYTES) throw new ContractError("PDF grande demais: o limite é 6 MB. Se for digitalizado, reduza a resolução e envie de novo.");
  if (Buffer.from(file.bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") throw new ContractError("O arquivo não é um PDF. Salve o contrato como PDF e envie de novo.");
  try {
    // The same reading the record of signatures does later: what cannot be opened now could not be signed.
    const opened = await PDFDocument.load(file.bytes);
    if (opened.getPageCount() === 0) throw new Error("sem páginas");
  } catch {
    throw new ContractError("Não foi possível abrir este PDF: ele está protegido por senha ou danificado. Gere o PDF de novo, sem senha, e envie.");
  }
  const signer = await recipientOf(order, recipient, context.way, conn);
  if (!(await mailChannel(conn, context.way.env, context.way.key))) throw new MailError(MAIL_NOT_SET);
  const settings = await loadContractSettings(conn);
  const fileName = file.name.replace(/[\u0000-\u001f\\/]+/g, " ").trim().slice(0, 200) || "contrato.pdf";
  return keepAndSend(
    order,
    { title: settings.title ?? DEFAULT_CONTRACT_TITLE, body: `Este contrato foi enviado em arquivo PDF (${fileName}). O texto completo está no arquivo: abra-o para ler antes de assinar.`, pdf: file.bytes, sequence: await nextContractSequence(order.id, conn), fileName },
    signer,
    context,
    conn,
  );
}

/** "Enviar o link de novo": a new link for the same contract; the one sent before stops working. */
export async function resendOrderContract(order: Pick<Order, "id" | "number">, contractId: number, context: SendContext, conn: Queryable): Promise<SentContract> {
  if (!(await mailChannel(conn, context.way.env, context.way.key))) throw new MailError(MAIL_NOT_SET);
  const settings = await loadContractSettings(conn);
  const token = newToken();
  const contract = await renewContractLink(order.id, contractId, hashToken(token), new Date(context.now.getTime() + settings.linkDays * 86_400_000), conn);
  return { contract, delivery: await mailLink(contract, order, signingUrl(context.appUrl, context.tenant, token), context, conn) };
}

/**
 * The contract with its record of signatures, as it stands now. A signed
 * contract of a company that turned the seal on leaves signed with the
 * company's digital certificate (`vault` opens it). A seal that cannot be made
 * (no key on the server, certificate that does not open) never keeps the
 * contract from the person: the file leaves without it, and the log says why.
 */
export async function contractFile(contract: Contract, context: { company: string; orderNumber: string; now: Date; vault?: () => Buffer }, conn: Queryable): Promise<Uint8Array> {
  const pdf = await loadContractPdf(contract.id, conn);
  if (!pdf) throw new Error(`Contrato ${contract.id} sem arquivo.`);
  const plain = async () => withEvidence(pdf, await loadEvidence(contract, context, conn));
  if (contract.status !== "assinado" || !context.vault) return plain();
  try {
    const seal = await loadContractSeal(conn, context.vault, context.now);
    if (!seal) return await plain();
    const file = await withEvidence(pdf, await loadEvidence(contract, { ...context, sealedBy: seal.holder }, conn));
    return await sealPdf(file, seal.key, { name: seal.holder, reason: `Contrato nº ${contractNumber(context.orderNumber, contract.sequence)} assinado eletronicamente`, at: context.now });
  } catch (error) {
    console.error("[contrato] o selo digital não pôde ser aplicado; o arquivo sai sem ele:", error instanceof Error ? error.message : error);
    return plain();
  }
}

export const contractFileName = (orderNumber: string, contract: Pick<Contract, "sequence" | "status">) =>
  `contrato-${contractNumber(orderNumber, contract.sequence)}${contract.status === "assinado" ? "-assinado" : ""}.pdf`;

export type SignerInput = { name: string; document: string; accepted: boolean };

/**
 * Step one of the signature, from the link: who signs says their name and CPF
 * and agrees; a code goes to the e-mail the contract was sent to. The code is
 * never shown on the screen nor written to a log.
 */
export async function requestSigningCode(contract: SigningContract, token: string, signer: SignerInput, context: { company: string; now: Date; ip: string | null; way: MailWay }, conn: Queryable): Promise<void> {
  if (!isOpen(contract, context.now)) throw new ContractError("Este contrato não está mais aguardando assinatura.");
  const name = signer.name.trim().replace(/\s+/g, " ");
  const document = normalizeDocument(signer.document);
  const problems: string[] = [];
  if (name.length < 5 || name.length > 120 || !name.includes(" ")) problems.push("Informe o seu nome completo.");
  if (!isValidCpf(document)) problems.push("Informe um CPF válido.");
  if (!signer.accepted) problems.push("Marque que leu e concorda com o contrato.");
  if (problems.length > 0) throw new ContractError(problems.join(" "));
  if (!(await mailChannel(conn, context.way.env, context.way.key))) throw new ContractError("O envio de e-mail desta empresa está fora do ar. Avise quem lhe enviou o contrato.");

  // The second code, when this contract asks for it: another six digits, to the mobile phone, by another way.
  const sms = contract.recipientPhone && smsAvailable(context.way.env) ? smsConfig(context.way.env) : null;
  if (contract.recipientPhone && (!sms || !context.way.sms)) throw new ContractError("O envio do código por SMS desta empresa está fora do ar. Avise quem lhe enviou o contrato.");
  const code = newCode();
  const phoneCode = contract.recipientPhone ? newCode() : null;
  await startCode(contract.id, { name, document, codeHash: hashCode(token, code), phoneCodeHash: phoneCode === null ? null : hashCode(token, `sms:${phoneCode}`), ip: context.ip }, conn);
  if (phoneCode !== null && sms && context.way.sms) {
    try {
      await context.way.sms(sms, contract.recipientPhone!, `${context.company}: ${phoneCode} é o seu código para assinar o contrato do pedido ${contract.orderNumber}. Vale ${CODE_MINUTES} min. Não informe a ninguém.`);
      await addContractEvent(contract.id, "email", { detail: `código por SMS enviado ao celular ${maskedPhone(contract.recipientPhone!)}`, ip: context.ip, actor: "cliente" }, conn);
    } catch (error) {
      if (!(error instanceof SmsError)) console.error("[contrato] falha inesperada no SMS:", error instanceof Error ? error.message : error);
      await addContractEvent(contract.id, "email", { detail: `o código por SMS para ${maskedPhone(contract.recipientPhone!)} não saiu${error instanceof SmsError ? `: ${error.message}` : ""}`, ip: context.ip, actor: "cliente" }, conn);
      throw new ContractError("Não conseguimos enviar o código por SMS agora. Tente de novo em um minuto.");
    }
  }
  const delivery = await deliver(
    context.way, conn,
    {
      company: context.company, to: contract.recipientEmail, subject: `Código para assinar o contrato do pedido nº ${contract.orderNumber}`,
      text: `Olá, ${name}.\n\nO código para assinar o contrato do pedido nº ${contract.orderNumber}, de ${context.company}, é:\n\n${code}\n\nEle vale por ${CODE_MINUTES} minutos. Se não foi você que pediu, ignore esta mensagem: sem o código, nada é assinado.`,
    },
    context.now,
  );
  if (delivery.status === "falhou") {
    await addContractEvent(contract.id, "email", { detail: `o código para ${contract.recipientEmail} não saiu: ${delivery.detail}`, ip: context.ip, actor: "cliente" }, conn);
    throw new ContractError("Não conseguimos enviar o código agora. Tente de novo em um minuto.");
  }
}

/**
 * Step two: the code. Signed, a copy of the contract with the record of
 * signatures goes to the customer and to the seller; a copy that does not
 * leave never undoes the signature.
 */
export async function signOrderContract(
  contract: SigningContract, token: string, code: string,
  context: { company: string; now: Date; ip: string | null; agent: string | null; way: MailWay; /** What was typed as the code of the phone. */ phoneCode?: string | null },
  conn: Queryable,
): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new ContractError("O código do e-mail tem 6 números.");
  const phoneCode = context.phoneCode ?? "";
  if (contract.recipientPhone && !/^\d{6}$/.test(phoneCode)) throw new ContractError("Informe também o código de 6 números que chegou por SMS no celular.");
  await signWithCode(contract.id, { codeHash: hashCode(token, code), phoneCodeHash: contract.recipientPhone ? hashCode(token, `sms:${phoneCode}`) : null, ip: context.ip, agent: context.agent }, conn);
  try {
    const signed = (await getOrderContract(contract.orderId, contract.id, conn))!;
    const file = await contractFile(signed, { company: context.company, orderNumber: contract.orderNumber, now: context.now, vault: context.way.key }, conn);
    const attachments: MailAttachment[] = [{ filename: contractFileName(contract.orderNumber, signed), contentType: "application/pdf", content: file }];
    const number = contractNumber(contract.orderNumber, signed.sequence);
    for (const to of [...new Set([signed.recipientEmail, contract.sellerEmail].filter((address) => isMailAddress(address)))]) {
      const delivery = await deliver(
        context.way, conn,
        {
          company: context.company, to, subject: `Contrato nº ${number} assinado - ${context.company}`, attachments,
          text: `O contrato nº ${number}, de ${context.company}, foi assinado por ${signed.signerName} em ${showDateTime(signed.signedAt!)} (horário de Brasília).\n\nO contrato vai em anexo, com o registro das assinaturas na última folha.`,
        },
        context.now,
      );
      await addContractEvent(contract.id, "email", { detail: delivery.status === "enviado" ? `contrato assinado enviado para ${to}` : `o contrato assinado para ${to} não saiu: ${delivery.detail}`, actor: "sistema" }, conn);
    }
  } catch (error) {
    console.error("[contrato] assinado, mas a cópia por e-mail falhou:", error instanceof Error ? error.message : error);
  }
}

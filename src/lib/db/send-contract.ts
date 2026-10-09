import { renderContractPdf, withEvidence } from "@/lib/contract/pdf";
import { blankWords, contractNumber, contractValues, DEFAULT_CONTRACT_BODY, DEFAULT_CONTRACT_TITLE, fillContract } from "@/lib/contract/text";
import { CODE_MINUTES, fingerprint, hashCode, hashToken, newCode, newToken } from "@/lib/contract/token";
import { isValidCpf, normalizeDocument } from "@/lib/customer";
import { loadLogo, loadProposalSettings } from "@/lib/db/company";
import {
  addContractEvent, ContractError, createContract, DEFAULT_CONTRACT_MAIL_BODY, DEFAULT_CONTRACT_MAIL_SUBJECT, fillContractMail, getOrderContract, isOpen, loadContractPdf, loadContractSettings,
  loadEvidence, nextContractSequence, renewContractLink, signWithCode, startCode,
} from "@/lib/db/contracts";
import type { Contract, SigningContract } from "@/lib/db/contracts";
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
export type MailWay = { env: Record<string, string | undefined>; key: () => Buffer; send: MailSender };

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

/**
 * "Enviar contrato para assinatura". Draws the contract, keeps the file and
 * its fingerprint, and writes to the customer with the link. What is refused
 * before the contract exists (no mailbox, no address, order not closed) throws;
 * a mail server that refuses the message leaves the contract waiting, and the
 * link can be sent again.
 */
export async function sendOrderContract(order: Order, recipient: { name: string | null; email: string | null }, context: SendContext, conn: Queryable): Promise<SentContract> {
  const draft = await draftOrderContract(order, context.company, context.now, conn);
  const email = (recipient.email ?? order.customer?.email ?? "").trim().toLowerCase();
  const name = (recipient.name ?? "").trim() || order.customer?.contactName?.trim() || order.customer!.name;
  if (email === "") throw new ContractError("O cliente não tem e-mail no cadastro: informe o e-mail de quem assina.");
  if (!isMailAddress(email)) throw new ContractError("E-mail de quem assina inválido.");
  if (name.length > 120) throw new ContractError("Nome de quem assina: até 120 letras.");
  if (!(await mailChannel(conn, context.way.env, context.way.key))) throw new MailError(MAIL_NOT_SET);

  const settings = await loadContractSettings(conn);
  const sequence = await nextContractSequence(order.id, conn);
  const pdf = await renderContractPdf({ company: context.company, title: draft.title, number: contractNumber(order.number, sequence), body: draft.body }, await logoOf(conn));
  const token = newToken();
  const contract = await createContract(
    {
      orderId: order.id, sequence, title: draft.title, body: draft.body, pdf, sha256: fingerprint(pdf), tokenHash: hashToken(token),
      expiresAt: new Date(context.now.getTime() + settings.linkDays * 86_400_000), recipientName: name, recipientEmail: email, createdBy: context.sentBy,
    },
    conn,
  );
  await addContractEvent(contract.id, "enviado", { detail: `para ${name} <${email}>`, actor: context.sentBy }, conn);
  return { contract, delivery: await mailLink(contract, order, signingUrl(context.appUrl, context.tenant, token), context, conn) };
}

/** "Enviar o link de novo": a new link for the same contract; the one sent before stops working. */
export async function resendOrderContract(order: Pick<Order, "id" | "number">, contractId: number, context: SendContext, conn: Queryable): Promise<SentContract> {
  if (!(await mailChannel(conn, context.way.env, context.way.key))) throw new MailError(MAIL_NOT_SET);
  const settings = await loadContractSettings(conn);
  const token = newToken();
  const contract = await renewContractLink(order.id, contractId, hashToken(token), new Date(context.now.getTime() + settings.linkDays * 86_400_000), conn);
  return { contract, delivery: await mailLink(contract, order, signingUrl(context.appUrl, context.tenant, token), context, conn) };
}

/** The contract with its record of signatures, as it stands now. */
export async function contractFile(contract: Contract, context: { company: string; orderNumber: string; now: Date }, conn: Queryable): Promise<Uint8Array> {
  const pdf = await loadContractPdf(contract.id, conn);
  if (!pdf) throw new Error(`Contrato ${contract.id} sem arquivo.`);
  return withEvidence(pdf, await loadEvidence(contract, context, conn));
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

  const code = newCode();
  await startCode(contract.id, { name, document, codeHash: hashCode(token, code), ip: context.ip }, conn);
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
  context: { company: string; now: Date; ip: string | null; agent: string | null; way: MailWay },
  conn: Queryable,
): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new ContractError("O código tem 6 números.");
  await signWithCode(contract.id, { codeHash: hashCode(token, code), ip: context.ip, agent: context.agent }, conn);
  try {
    const signed = (await getOrderContract(contract.orderId, contract.id, conn))!;
    const file = await contractFile(signed, { company: context.company, orderNumber: contract.orderNumber, now: context.now }, conn);
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

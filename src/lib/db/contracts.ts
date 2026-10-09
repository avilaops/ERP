import { CODE_INTERVAL_SECONDS, CODE_MAX_ATTEMPTS, CODE_MAX_SENT, CODE_MINUTES } from "@/lib/contract/token";
import type { ContractEvidence } from "@/lib/contract/pdf";
import { contractNumber } from "@/lib/contract/text";
import { formatDocument } from "@/lib/customer";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { showDateTime } from "@/lib/format";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class ContractError extends Error {}

const UNIQUE_VIOLATION = "23505";

const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const blank = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);
const moment = (value: unknown) => (value === null || value === undefined ? null : (value as Date));

/** The model of the contract and the message that carries the link. `null` is the standard text. */
export type ContractSettings = { title: string | null; body: string | null; linkDays: number; mailSubject: string | null; mailBody: string | null };

export const DEFAULT_CONTRACT_MAIL_SUBJECT = "Contrato do pedido nº {pedido} para assinatura - {empresa}";
export const DEFAULT_CONTRACT_MAIL_BODY =
  "Olá, {cliente}.\n\nO contrato do pedido nº {pedido}, de {empresa}, está pronto para a sua assinatura.\n\nAbra o endereço abaixo para ler e assinar. Na hora de assinar, enviamos um código de confirmação para este mesmo e-mail.\n\n{link}\n\nO endereço vale até {validade}. Se você não reconhece este pedido, apenas ignore esta mensagem.";

export const CONTRACT_MAIL_WORDS = ["empresa", "cliente", "pedido", "link", "validade"] as const;
export const fillContractMail = (template: string, values: Record<(typeof CONTRACT_MAIL_WORDS)[number], string>): string =>
  template.replace(/\{(empresa|cliente|pedido|link|validade)\}/g, (_match, word: (typeof CONTRACT_MAIL_WORDS)[number]) => values[word]);

export async function loadContractSettings(conn: Queryable): Promise<ContractSettings> {
  const { rows } = await conn.query("SELECT title, body, link_days, mail_subject, mail_body FROM contract_settings");
  const row = rows[0];
  if (!row) return { title: null, body: null, linkDays: 7, mailSubject: null, mailBody: null };
  return { title: text(row.title), body: text(row.body), linkDays: Number(row.link_days), mailSubject: text(row.mail_subject), mailBody: text(row.mail_body) };
}

/** Blank takes a text back to the standard one. */
export async function saveContractSettings(input: ContractSettings, updatedBy: string, conn: Queryable): Promise<void> {
  const title = blank(input.title);
  const body = blank(input.body?.replace(/\r\n?/g, "\n"));
  const mailSubject = blank(input.mailSubject);
  const mailBody = blank(input.mailBody);
  const problems: string[] = [];
  if (title !== null && (title.length < 3 || title.length > 120 || /\n/.test(title))) problems.push("Título: de 3 a 120 letras, em uma linha.");
  if (body !== null && (body.length < 20 || body.length > 60000)) problems.push("Texto do contrato: de 20 a 60.000 letras.");
  if (!Number.isInteger(input.linkDays) || input.linkDays < 1 || input.linkDays > 60) problems.push("Validade do link: de 1 a 60 dias.");
  if (mailSubject !== null && (mailSubject.length < 3 || mailSubject.length > 150 || /[\r\n]/.test(mailSubject))) problems.push("Assunto do e-mail: de 3 a 150 letras, em uma linha.");
  if (mailBody !== null && (mailBody.length < 10 || mailBody.length > 4000)) problems.push("Texto do e-mail: de 10 a 4.000 letras.");
  if (mailBody !== null && !mailBody.includes("{link}")) problems.push("Texto do e-mail: precisa ter {link}, que é o endereço onde o cliente assina.");
  if (problems.length > 0) throw new ContractError(problems.join(" "));
  await conn.query(
    `INSERT INTO contract_settings (title, body, link_days, mail_subject, mail_body, updated_by) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, link_days = EXCLUDED.link_days,
       mail_subject = EXCLUDED.mail_subject, mail_body = EXCLUDED.mail_body, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [title, body, input.linkDays, mailSubject, mailBody, updatedBy],
  );
}

export type ContractStatus = "enviado" | "assinado" | "recusado" | "cancelado";

export type CompanySignature = { email: string; name: string; role: string; ip: string | null; signedAt: Date };

/** A contract as the screens know it: never the file, never the hash of the link or of the code. */
export type Contract = {
  id: number;
  orderId: number;
  sequence: number;
  status: ContractStatus;
  title: string;
  body: string;
  sha256: string;
  expiresAt: Date;
  recipientName: string;
  recipientEmail: string;
  viewedAt: Date | null;
  signedAt: Date | null;
  signerName: string | null;
  signerDocument: string | null;
  signerIp: string | null;
  refusedAt: Date | null;
  refusalReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  createdAt: Date;
  createdBy: string;
  /** Whether a confirmation code is out and still good. */
  codePending: boolean;
  pendingName: string | null;
  companySignatures: CompanySignature[];
};

const COLUMNS = `c.id, c.order_id, c.sequence, c.status, c.title, c.body, c.pdf_sha256, c.expires_at, c.recipient_name, c.recipient_email, c.viewed_at,
  c.signed_at, c.signer_name, c.signer_document, c.signer_ip, c.refused_at, c.refusal_reason, c.cancelled_at, c.cancelled_by, c.created_at, c.created_by,
  (c.code_hash IS NOT NULL AND c.code_expires_at > now() AND c.code_attempts < ${CODE_MAX_ATTEMPTS}) AS code_pending, c.pending_name,
  COALESCE((SELECT json_agg(json_build_object('email', s.email, 'name', s.name, 'role', s.role, 'ip', s.ip, 'signedAt', s.signed_at) ORDER BY s.id)
              FROM order_contract_signatures s WHERE s.contract_id = c.id), '[]'::json) AS company_signatures`;

function toContract(row: Record<string, unknown>): Contract {
  return {
    id: Number(row.id), orderId: Number(row.order_id), sequence: Number(row.sequence), status: row.status as ContractStatus, title: String(row.title), body: String(row.body),
    sha256: String(row.pdf_sha256), expiresAt: row.expires_at as Date, recipientName: String(row.recipient_name), recipientEmail: String(row.recipient_email),
    viewedAt: moment(row.viewed_at), signedAt: moment(row.signed_at), signerName: text(row.signer_name), signerDocument: text(row.signer_document), signerIp: text(row.signer_ip),
    refusedAt: moment(row.refused_at), refusalReason: text(row.refusal_reason), cancelledAt: moment(row.cancelled_at), cancelledBy: text(row.cancelled_by),
    createdAt: row.created_at as Date, createdBy: String(row.created_by), codePending: Boolean(row.code_pending), pendingName: text(row.pending_name),
    companySignatures: (row.company_signatures as { email: string; name: string; role: string; ip: string | null; signedAt: string }[]).map((signature) => ({
      email: signature.email, name: signature.name, role: signature.role, ip: signature.ip, signedAt: new Date(signature.signedAt),
    })),
  };
}

/** Waiting for the customer and still within the time of the link. */
export const isOpen = (contract: Pick<Contract, "status" | "expiresAt">, now: Date) => contract.status === "enviado" && contract.expiresAt.getTime() > now.getTime();

/** How the contract stands, in the words of the screen. */
export function standingText(contract: Contract, now: Date): string {
  if (contract.status === "assinado") return `Assinado pelo cliente em ${showDateTime(contract.signedAt!)}`;
  if (contract.status === "recusado") return `Recusado pelo cliente em ${showDateTime(contract.refusedAt!)}`;
  if (contract.status === "cancelado") return `Cancelado em ${showDateTime(contract.cancelledAt!)}`;
  if (!isOpen(contract, now)) return `Link vencido em ${showDateTime(contract.expiresAt)}, sem assinatura`;
  return contract.viewedAt ? `Aguardando a assinatura do cliente (abriu em ${showDateTime(contract.viewedAt)})` : "Aguardando a assinatura do cliente (ainda não abriu)";
}

/** Every contract of an order, the latest first. */
export async function listOrderContracts(orderId: number, conn: Queryable): Promise<Contract[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM order_contracts c WHERE c.order_id = $1 ORDER BY c.sequence DESC`, [orderId]);
  return rows.map(toContract);
}

/** One contract of one order: the order is always part of the question, so a number of another order finds nothing. */
export async function getOrderContract(orderId: number, contractId: number, conn: Queryable): Promise<Contract | null> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM order_contracts c WHERE c.order_id = $1 AND c.id = $2`, [orderId, contractId]);
  return rows[0] ? toContract(rows[0]) : null;
}

/** A contract as the signing link sees it: with the number of its order and who sold, to send the signed copy to. */
export type SigningContract = Contract & { orderNumber: string; sellerEmail: string };

/** The contract a signing link opens, by the hash of its secret. */
export async function findContractByToken(tokenHash: string, conn: Queryable): Promise<SigningContract | null> {
  const { rows } = await conn.query(`SELECT ${COLUMNS}, o.number AS order_number, o.seller_email FROM order_contracts c JOIN orders o ON o.id = c.order_id WHERE c.token_hash = $1`, [tokenHash]);
  return rows[0] ? { ...toContract(rows[0]), orderNumber: String(rows[0].order_number), sellerEmail: String(rows[0].seller_email) } : null;
}

export async function loadContractPdf(contractId: number, conn: Queryable): Promise<Uint8Array | null> {
  const { rows } = await conn.query("SELECT pdf FROM order_contracts WHERE id = $1", [contractId]);
  return rows[0] ? new Uint8Array(rows[0].pdf as Buffer) : null;
}

export type ContractEventKind = "enviado" | "email" | "visualizado" | "codigo_enviado" | "codigo_errado" | "assinado" | "assinado_empresa" | "recusado" | "cancelado";

export async function addContractEvent(contractId: number, kind: ContractEventKind, event: { detail?: string | null; ip?: string | null; actor: string }, conn: Queryable): Promise<void> {
  await conn.query("INSERT INTO order_contract_events (contract_id, kind, detail, ip, actor) VALUES ($1, $2, $3, $4, $5)", [contractId, kind, event.detail?.slice(0, 400) ?? null, event.ip ?? null, event.actor]);
}

export type NewContract = { orderId: number; sequence: number; title: string; body: string; pdf: Uint8Array; sha256: string; tokenHash: string; expiresAt: Date; recipientName: string; recipientEmail: string; createdBy: string };

export const PENDING_EXISTS = "Este pedido já tem um contrato aguardando assinatura. Cancele-o antes de enviar outro.";

/** Stores a contract as sent. One waiting for signature per order: a second is refused. */
export async function createContract(input: NewContract, conn: Queryable): Promise<Contract> {
  try {
    const { rows } = await conn.query(
      `INSERT INTO order_contracts (order_id, sequence, title, body, pdf, pdf_sha256, token_hash, expires_at, recipient_name, recipient_email, created_by)
       VALUES ($1, $11, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [input.orderId, input.title, input.body, Buffer.from(input.pdf), input.sha256, input.tokenHash, input.expiresAt, input.recipientName, input.recipientEmail, input.createdBy, input.sequence],
    );
    return (await getOrderContract(input.orderId, Number(rows[0].id), conn))!;
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new ContractError(PENDING_EXISTS);
    throw error;
  }
}

/** The sequence the next contract of an order takes: what the number printed on it is made of. */
export async function nextContractSequence(orderId: number, conn: Queryable): Promise<number> {
  const { rows } = await conn.query("SELECT COALESCE(max(sequence), 0) + 1 AS next FROM order_contracts WHERE order_id = $1", [orderId]);
  return Number(rows[0].next);
}

/** A new link for a contract still waiting: the old one stops working, and the time starts again. */
export async function renewContractLink(orderId: number, contractId: number, tokenHash: string, expiresAt: Date, conn: Queryable): Promise<Contract> {
  const { rows } = await conn.query(
    `UPDATE order_contracts SET token_hash = $3, expires_at = $4, code_hash = NULL, code_expires_at = NULL, code_attempts = 0, codes_sent = 0, code_sent_at = NULL
      WHERE order_id = $1 AND id = $2 AND status = 'enviado' RETURNING id`,
    [orderId, contractId, tokenHash, expiresAt],
  );
  if (rows.length === 0) throw new ContractError("Só contrato aguardando assinatura recebe link novo.");
  return (await getOrderContract(orderId, contractId, conn))!;
}

/** Withdraws a contract nobody signed. A signed one stays as it is. */
export async function cancelContract(orderId: number, contractId: number, who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    "UPDATE order_contracts SET status = 'cancelado', cancelled_at = now(), cancelled_by = $3, code_hash = NULL WHERE order_id = $1 AND id = $2 AND status = 'enviado' RETURNING id",
    [orderId, contractId, who],
  );
  if (rows.length === 0) throw new ContractError("Só contrato aguardando assinatura pode ser cancelado.");
  await addContractEvent(contractId, "cancelado", { actor: who }, conn);
}

/** A person of the company signs with their own account. Once each; not on a contract refused or cancelled. */
export async function signForCompany(orderId: number, contractId: number, signer: { email: string; name: string; role: string; ip: string | null }, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query(
      `INSERT INTO order_contract_signatures (contract_id, email, name, role, ip)
       SELECT c.id, $3, $4, $5, $6 FROM order_contracts c WHERE c.order_id = $1 AND c.id = $2 AND c.status IN ('enviado', 'assinado') RETURNING id`,
      [orderId, contractId, signer.email, signer.name, signer.role, signer.ip],
    );
    if (rows.length === 0) throw new ContractError("Este contrato foi recusado ou cancelado e não recebe assinatura.");
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new ContractError("Você já assinou este contrato.");
    throw error;
  }
  await addContractEvent(contractId, "assinado_empresa", { detail: `${signer.name} (${signer.role})`, ip: signer.ip, actor: signer.email }, conn);
}

/** The first time the link is opened. */
export async function markViewed(contractId: number, ip: string | null, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("UPDATE order_contracts SET viewed_at = now() WHERE id = $1 AND viewed_at IS NULL AND status = 'enviado' RETURNING id", [contractId]);
  if (rows.length > 0) await addContractEvent(contractId, "visualizado", { ip, actor: "cliente" }, conn);
}

/**
 * Keeps who is about to sign and the hash of the code that goes to their
 * e-mail. One code a minute, ten in all, and never on a contract that is not
 * waiting anymore: each refusal says which rule stopped it.
 */
export async function startCode(contractId: number, signer: { name: string; document: string; codeHash: string; ip: string | null }, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `UPDATE order_contracts
        SET code_hash = $2, code_expires_at = now() + make_interval(mins => $5::int), code_sent_at = now(), code_attempts = 0, codes_sent = codes_sent + 1,
            pending_name = $3, pending_document = $4
      WHERE id = $1 AND status = 'enviado' AND expires_at > now() AND codes_sent < $6::int
        AND (code_sent_at IS NULL OR code_sent_at < now() - make_interval(secs => $7::int))
      RETURNING id`,
    [contractId, signer.codeHash, signer.name, signer.document, CODE_MINUTES, CODE_MAX_SENT, CODE_INTERVAL_SECONDS],
  );
  if (rows.length > 0) {
    await addContractEvent(contractId, "codigo_enviado", { ip: signer.ip, actor: "cliente" }, conn);
    return;
  }
  const state = await conn.query(
    `SELECT status, expires_at > now() AS in_time, codes_sent, code_sent_at IS NOT NULL AND code_sent_at >= now() - make_interval(secs => $2::int) AS too_soon FROM order_contracts WHERE id = $1`,
    [contractId, CODE_INTERVAL_SECONDS],
  );
  const row = state.rows[0];
  if (!row || row.status !== "enviado" || !row.in_time) throw new ContractError("Este contrato não está mais aguardando assinatura.");
  if (row.too_soon) throw new ContractError("Acabamos de enviar um código. Aguarde um minuto para pedir outro.");
  throw new ContractError("Foram pedidos códigos demais para este contrato. Peça à empresa um novo link.");
}

/**
 * Signs, when the code is the one that went to the e-mail. Everything is
 * checked in the same statement that writes the signature: a contract is never
 * signed twice, after its time or with a code that ran out of tries.
 */
export async function signWithCode(contractId: number, proof: { codeHash: string; ip: string | null; agent: string | null }, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `UPDATE order_contracts
        SET status = 'assinado', signed_at = now(), signer_name = pending_name, signer_document = pending_document, signer_ip = $3, signer_agent = $4,
            code_hash = NULL, code_expires_at = NULL
      WHERE id = $1 AND status = 'enviado' AND expires_at > now() AND code_hash = $2 AND code_expires_at > now() AND code_attempts < $5::int
        AND pending_name IS NOT NULL AND pending_document IS NOT NULL
      RETURNING signer_name, signer_document`,
    [contractId, proof.codeHash, proof.ip, proof.agent?.slice(0, 300) ?? null, CODE_MAX_ATTEMPTS],
  );
  if (rows.length > 0) {
    await addContractEvent(contractId, "assinado", { detail: `${rows[0].signer_name}, CPF ${formatDocument(String(rows[0].signer_document))}, com código enviado ao e-mail`, ip: proof.ip, actor: "cliente" }, conn);
    return;
  }
  const tried = await conn.query(
    `UPDATE order_contracts SET code_attempts = code_attempts + 1
      WHERE id = $1 AND status = 'enviado' AND expires_at > now() AND code_hash IS NOT NULL AND code_expires_at > now() AND code_attempts < $2::int
      RETURNING code_attempts`,
    [contractId, CODE_MAX_ATTEMPTS],
  );
  if (tried.rows.length === 0) throw new ContractError("O código venceu ou não foi pedido. Peça um código novo.");
  await addContractEvent(contractId, "codigo_errado", { ip: proof.ip, actor: "cliente" }, conn);
  const left = CODE_MAX_ATTEMPTS - Number(tried.rows[0].code_attempts);
  throw new ContractError(left > 0 ? `Código incorreto. ${left === 1 ? "Resta 1 tentativa" : `Restam ${left} tentativas`}.` : "Código incorreto. As tentativas acabaram: peça um código novo.");
}

/** The customer says no. The reason is theirs to give or not. */
export async function refuseContract(contractId: number, reason: string | null, ip: string | null, conn: Queryable): Promise<void> {
  const why = blank(reason)?.slice(0, 500) ?? null;
  const { rows } = await conn.query(
    "UPDATE order_contracts SET status = 'recusado', refused_at = now(), refusal_reason = $2, code_hash = NULL WHERE id = $1 AND status = 'enviado' AND expires_at > now() RETURNING id",
    [contractId, why],
  );
  if (rows.length === 0) throw new ContractError("Este contrato não está mais aguardando assinatura.");
  await addContractEvent(contractId, "recusado", { detail: why, ip, actor: "cliente" }, conn);
}

const EVENT_TEXT: Record<ContractEventKind, string> = {
  enviado: "Contrato gerado e enviado para assinatura",
  email: "E-mail",
  visualizado: "Cliente abriu o contrato",
  codigo_enviado: "Código de confirmação enviado ao e-mail do cliente",
  codigo_errado: "Código de confirmação incorreto",
  assinado: "Cliente assinou",
  assinado_empresa: "Assinatura da empresa",
  recusado: "Cliente recusou",
  cancelado: "Contrato cancelado pela empresa",
};

export type ContractEvent = { kind: ContractEventKind; text: string; ip: string | null; actor: string; at: Date };

export async function listContractEvents(contractId: number, conn: Queryable): Promise<ContractEvent[]> {
  const { rows } = await conn.query("SELECT kind, detail, ip, actor, at FROM order_contract_events WHERE contract_id = $1 ORDER BY id", [contractId]);
  return rows.map((row) => {
    const kind = row.kind as ContractEventKind;
    const detail = text(row.detail);
    const who = String(row.actor);
    return { kind, text: `${EVENT_TEXT[kind]}${detail ? `: ${detail}` : ""}${who !== "cliente" && who !== "sistema" && kind !== "assinado_empresa" ? ` (por ${who})` : ""}`, ip: text(row.ip), actor: who, at: row.at as Date };
  });
}

/** What the record of signatures prints for a contract, from what was stored at each step. */
export async function loadEvidence(contract: Contract, context: { company: string; orderNumber: string; now: Date }, conn: Queryable): Promise<ContractEvidence> {
  const events = await listContractEvents(contract.id, conn);
  return {
    company: context.company,
    title: contract.title,
    number: contractNumber(context.orderNumber, contract.sequence),
    sha256: contract.sha256,
    standing: standingText(contract, context.now),
    signers: [
      ...(contract.status === "assinado"
        ? [{
            party: "Comprador(a)", name: contract.signerName!, document: formatDocument(contract.signerDocument!), email: contract.recipientEmail, at: showDateTime(contract.signedAt!), ip: contract.signerIp,
            method: "código de confirmação enviado ao e-mail acima, digitado no link de assinatura",
          }]
        : []),
      ...contract.companySignatures.map((signature) => ({
        party: `Vendedora · ${signature.role}`, name: signature.name, document: null, email: signature.email, at: showDateTime(signature.signedAt), ip: signature.ip,
        method: "conta própria no sistema da empresa, com login autenticado",
      })),
    ],
    events: events.map((event) => ({ at: showDateTime(event.at), text: event.text, ip: event.ip })),
  };
}

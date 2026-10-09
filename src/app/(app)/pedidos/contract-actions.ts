"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { clientIp, publicAppUrl } from "@/lib/contract/public";
import { cancelContract, ContractError, signForCompany } from "@/lib/db/contracts";
import { getOrder } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { resendOrderContract, sendOrderContract, sendUploadedContract } from "@/lib/db/send-contract";
import type { SentContract } from "@/lib/db/send-contract";
import { vaultKey } from "@/lib/fiscal/certificate";
import { MailError } from "@/lib/mail/message";
import { sendMail } from "@/lib/mail/smtp";
import type { ActionState } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";

const FAILED = "Não foi possível concluir agora. Tente de novo.";
const NOT_FOUND = "Pedido não encontrado.";

const way = { env: process.env, key: () => vaultKey(process.env.ERP_CERT_KEY), send: sendMail };

function refusal(error: unknown): ActionState {
  if (error instanceof ContractError || error instanceof MailError) return { error: error.message };
  console.error("[contrato] falha:", error instanceof Error ? error.message : error);
  return { error: FAILED };
}

const told = ({ contract, delivery }: SentContract): ActionState =>
  delivery.status === "enviado"
    ? { error: null, notice: `Contrato enviado para ${contract.recipientEmail}.` }
    : { error: `O contrato foi gerado, mas o e-mail para ${contract.recipientEmail} não saiu: ${delivery.detail ?? "falha no envio"}. Use "Enviar o link de novo".` };

const field = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

/** "Enviar contrato para assinatura" of a closed order. Who reaches the order sends; a seller, only their own. */
export async function sendContractAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);
  const number = field(formData, "number");
  if (number === null || !ORDER_NUMBER.test(number)) return { error: NOT_FOUND };
  const order = await getOrder(number, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  if (!order) return { error: NOT_FOUND };
  let sent: SentContract;
  try {
    sent = await sendOrderContract(
      order,
      { name: field(formData, "recipientName"), email: field(formData, "recipientEmail") },
      { company: session.tenant.name, tenant: session.tenant.slug, appUrl: publicAppUrl(), sentBy: session.email, now: new Date(), way },
      conn,
    );
  } catch (error) {
    return refusal(error);
  }
  console.info(`[contrato] pedido ${number}: contrato ${sent.contract.sequence} gerado por ${session.email}`);
  revalidatePath(`${menuItem("pedidos").href}/${number}`);
  return told(sent);
}

/**
 * "Enviar este PDF para assinatura": the company's own file instead of the
 * model. Same reach as the other: who reaches the order sends; a seller, only their own.
 */
export async function sendUploadedContractAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);
  const number = field(formData, "number");
  if (number === null || !ORDER_NUMBER.test(number)) return { error: NOT_FOUND };
  const order = await getOrder(number, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  if (!order) return { error: NOT_FOUND };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo do contrato em PDF." };
  // Refused by its size before a byte of it is read into memory.
  if (file.size > 6 * 1024 * 1024) return { error: "PDF grande demais: o limite é 6 MB. Se for digitalizado, reduza a resolução e envie de novo." };
  let sent: SentContract;
  try {
    sent = await sendUploadedContract(
      order,
      { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name },
      { name: field(formData, "recipientName"), email: field(formData, "recipientEmail") },
      { company: session.tenant.name, tenant: session.tenant.slug, appUrl: publicAppUrl(), sentBy: session.email, now: new Date(), way },
      conn,
    );
  } catch (error) {
    return refusal(error);
  }
  console.info(`[contrato] pedido ${number}: contrato ${sent.contract.sequence} enviado em arquivo por ${session.email}`);
  revalidatePath(`${menuItem("pedidos").href}/${number}`);
  return told(sent);
}

/** The order and the number of the contract a form of the order's screen is about, with the session's reach. */
async function target(formData: FormData, session: Awaited<ReturnType<typeof requirePermission>>, conn: ReturnType<typeof tenantDb>) {
  const number = field(formData, "number");
  const contractId = Number(field(formData, "contractId"));
  if (number === null || !ORDER_NUMBER.test(number) || !Number.isSafeInteger(contractId) || contractId <= 0) return null;
  const order = await getOrder(number, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  return order ? { order, contractId } : null;
}

/** "Enviar o link de novo": a new link for the contract that is waiting. */
export async function resendContractAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);
  const found = await target(formData, session, conn);
  if (!found) return { error: NOT_FOUND };
  let sent: SentContract;
  try {
    sent = await resendOrderContract(found.order, found.contractId, { company: session.tenant.name, tenant: session.tenant.slug, appUrl: publicAppUrl(), sentBy: session.email, now: new Date(), way }, conn);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`${menuItem("pedidos").href}/${found.order.number}`);
  return told(sent);
}

/** "Cancelar contrato": withdraws the one nobody signed. */
export async function cancelContractAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);
  const found = await target(formData, session, conn);
  if (!found) return { error: NOT_FOUND };
  try {
    await cancelContract(found.order.id, found.contractId, session.email, conn);
  } catch (error) {
    return refusal(error);
  }
  console.info(`[contrato] pedido ${found.order.number}: contrato cancelado por ${session.email}`);
  revalidatePath(`${menuItem("pedidos").href}/${found.order.number}`);
  return { error: null, notice: "Contrato cancelado. O link enviado ao cliente não funciona mais." };
}

/** "Assinar pela empresa": the person signed in signs with their own account. Name, e-mail and profile come from the session. */
export async function signContractAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);
  const found = await target(formData, session, conn);
  if (!found) return { error: NOT_FOUND };
  try {
    await signForCompany(found.order.id, found.contractId, { email: session.email, name: session.name, role: session.profile ?? ROLE_LABELS[session.role], ip: clientIp(await headers()) }, conn);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`${menuItem("pedidos").href}/${found.order.number}`);
  return { error: null, notice: "Sua assinatura foi registrada." };
}

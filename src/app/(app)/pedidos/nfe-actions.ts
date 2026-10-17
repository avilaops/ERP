"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { IssueError } from "@/lib/db/issue-nfe";
import { enqueueNfeEvent, enqueueNfeIssue } from "@/lib/db/fiscal-jobs";
import { CarrierError, saveOrderTransport } from "@/lib/db/carriers";
import { saveFreightMode } from "@/lib/db/invoices";
import { DeliveryError, saveOrderDelivery } from "@/lib/db/order-delivery";
import { getOrder } from "@/lib/db/orders";
import { sendInvoiceMail } from "@/lib/db/send-nfe-mail";
import { tenantDb } from "@/lib/db/pool";
import { vaultKey } from "@/lib/fiscal/certificate";
import { MailError } from "@/lib/mail/message";
import { sendMail } from "@/lib/mail/smtp";
import type { ActionState } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";

const FAILED = "Não foi possível emitir agora. Confira a situação da nota abaixo antes de tentar de novo.";

const FAILED_TO_SAVE = "Não foi possível gravar agora. Tente de novo.";

/**
 * "Emitir nota fiscal" of a closed order. Only who operates Fiscal issues it:
 * the invoice binds the company before the tax authority.
 */
export async function issueNfeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("fiscal");
  const conn = tenantDb(session.tenant.slug);
  const scope = { sellerEmail: seesAllOrders(session) ? null : session.email };
  const number = formData.get("number");
  if (typeof number !== "string" || !ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };

  try {
    const job = await enqueueNfeIssue(number, session.email, scope, conn);
    revalidatePath(`${menuItem("pedidos").href}/${number}`);
    return { error: null, notice: job.joined ? "A emissão desta nota já está na fila." : "Emissão colocada na fila fiscal. A situação será atualizada automaticamente." };
  } catch (error) {
    revalidatePath(`${menuItem("pedidos").href}/${number}`);
    if (error instanceof IssueError) return { error: error.message };
    // Never the certificate, its password or the XML: only what kind of failure it was.
    console.error("[nfe] falha ao emitir:", error instanceof Error ? error.message : error);
    return { error: FAILED };
  }
}

/** "Registrar carta de correção" and "Cancelar nota fiscal" of the authorised invoice of an order. Same hands as issuing. */
export async function registerNfeEventAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("fiscal");
  const conn = tenantDb(session.tenant.slug);
  const scope = { sellerEmail: seesAllOrders(session) ? null : session.email };
  const number = formData.get("number");
  const kind = formData.get("kind");
  const text = formData.get("text");
  if (typeof number !== "string" || !ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };
  if (kind !== "cancelamento" && kind !== "correcao") return { error: "Escolha carta de correção ou cancelamento." };

  try {
    const job = await enqueueNfeEvent(number, kind, typeof text === "string" ? text : "", session.email, scope, conn);
    revalidatePath(`${menuItem("pedidos").href}/${number}`);
    return { error: null, notice: job.joined ? "Este evento fiscal já está na fila." : "Evento fiscal colocado na fila. A situação será atualizada automaticamente." };
  } catch (error) {
    if (error instanceof IssueError) return { error: error.message };
    console.error("[nfe] falha ao registrar evento:", error instanceof Error ? error.message : error);
    return { error: FAILED };
  }
}

/** The transport of the invoice: the way of freight (one of the options of the layout), who carries and the volumes. */
export async function saveTransportAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("fiscal");
  const conn = tenantDb(session.tenant.slug);
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const number = text("number");
  const mode = text("freightMode");
  if (!ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };
  if (!["0", "1", "2", "3", "4", "9"].includes(mode)) return { error: "Escolha a modalidade do frete na lista." };
  const whole = (key: string) => (text(key) === "" ? null : /^\d{1,6}$/.test(text(key)) ? Number(text(key)) : Number.NaN);
  const weight = (key: string) => (text(key) === "" ? null : /^\d{1,8}([.,]\d{1,3})?$/.test(text(key)) ? Number(text(key).replace(",", ".")) : Number.NaN);
  const order = await getOrder(number, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  if (!order) return { error: "Pedido não encontrado." };
  try {
    await saveOrderTransport(
      order.id,
      { carrierId: text("carrierId") === "" ? null : Number(text("carrierId")), volumes: whole("volumes"), volumeKind: text("volumeKind") || null, netWeight: weight("netWeight"), grossWeight: weight("grossWeight") },
      conn,
    );
    await saveFreightMode(order.id, mode, conn);
  } catch (error) {
    if (error instanceof CarrierError) return { error: error.message };
    console.error("[nfe] falha ao gravar o transporte:", error instanceof Error ? error.message : error);
    return { error: FAILED };
  }
  revalidatePath(`${menuItem("pedidos").href}/${number}`);
  return { error: null };
}

/**
 * The place of delivery of the invoice, when the goods do not go to the address
 * of the customer's register. The button "Usar o endereço do cadastro" sends
 * `clear` and takes it away.
 */
export async function saveDeliveryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("fiscal");
  const conn = tenantDb(session.tenant.slug);
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };
  const number = text("number");
  if (number === null || !ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };
  const order = await getOrder(number, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  if (!order) return { error: "Pedido não encontrado." };
  const clear = text("clear") !== null;
  const field = (key: string) => (clear ? null : text(key));
  try {
    await saveOrderDelivery(
      order.id,
      {
        name: field("deliveryName"), document: field("deliveryDocument"), cep: field("deliveryCep"), street: field("deliveryStreet"), number: field("deliveryNumber"),
        complement: field("deliveryComplement"), district: field("deliveryDistrict"), city: field("deliveryCity"), uf: field("deliveryState"), phone: field("deliveryPhone"),
      },
      conn,
    );
  } catch (error) {
    if (error instanceof DeliveryError) return { error: error.message };
    console.error("[nfe] falha ao gravar o local de entrega:", error instanceof Error ? error.message : error);
    return { error: FAILED_TO_SAVE };
  }
  revalidatePath(`${menuItem("pedidos").href}/${number}`);
  return { error: null };
}

/** "Enviar por e-mail" of an authorised or cancelled invoice, to the address typed (the customer's when blank). */
export async function sendNfeMailAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("fiscal");
  const conn = tenantDb(session.tenant.slug);
  const number = formData.get("number");
  const invoiceId = Number(formData.get("invoiceId"));
  const to = formData.get("to");
  if (typeof number !== "string" || !ORDER_NUMBER.test(number) || !Number.isInteger(invoiceId)) return { error: "Nota não encontrada." };
  const order = await getOrder(number, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  const owned = order ? await conn.query("SELECT 1 FROM fiscal_invoices WHERE id = $1 AND order_id = $2", [invoiceId, order.id]) : null;
  if (!order || !owned?.rows[0]) return { error: "Nota não encontrada." };
  try {
    const result = await sendInvoiceMail(
      { invoiceId, to: typeof to === "string" && to.trim() !== "" ? to : null, sentBy: session.email, now: new Date(), env: process.env, key: () => vaultKey(process.env.ERP_CERT_KEY), send: sendMail },
      conn,
    );
    revalidatePath(`${menuItem("pedidos").href}/${number}`);
    if (result.status === "falhou") return { error: `O e-mail para ${result.recipient} não saiu: ${result.detail ?? "falha no envio"}` };
    return { error: null, notice: `E-mail enviado para ${result.recipient}.` };
  } catch (error) {
    if (error instanceof MailError) return { error: error.message };
    console.error("[e-mail] falha ao enviar a nota:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível enviar agora. Tente de novo." };
  }
}

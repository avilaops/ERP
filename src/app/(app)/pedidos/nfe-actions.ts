"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { IssueError, issueOrderNfe, registerOrderNfeEvent } from "@/lib/db/issue-nfe";
import { CarrierError, saveOrderTransport } from "@/lib/db/carriers";
import { saveFreightMode } from "@/lib/db/invoices";
import { DeliveryError, saveOrderDelivery } from "@/lib/db/order-delivery";
import { getOrder } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { vaultKey } from "@/lib/fiscal/certificate";
import { sendToSefaz } from "@/lib/fiscal/channel";
import type { ActionState } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";

const FAILED = "Não foi possível emitir agora. Confira a situação da nota abaixo antes de tentar de novo.";

const FAILED_TO_SAVE = "Não foi possível gravar agora. Tente de novo.";

const send = sendToSefaz;

/**
 * "Emitir nota fiscal" of a closed order. Only who edits the fiscal parameters
 * issues: the invoice binds the company before the tax authority.
 */
export async function issueNfeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const number = formData.get("number");
  if (typeof number !== "string" || !ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };

  try {
    const result = await issueOrderNfe(number, session.email, new Date(), vaultKey(process.env.ERP_CERT_KEY), send, conn);
    console.info(`[nfe] pedido ${number}: nota ${result.invoice.number} ${result.invoice.status} (${result.invoice.statusCode ?? "-"}), por ${session.email}`);
  } catch (error) {
    revalidatePath(`${menuItem("pedidos").href}/${number}`);
    if (error instanceof IssueError) return { error: error.message };
    // Never the certificate, its password or the XML: only what kind of failure it was.
    console.error("[nfe] falha ao emitir:", error instanceof Error ? error.message : error);
    return { error: FAILED };
  }
  revalidatePath(`${menuItem("pedidos").href}/${number}`);
  return { error: null };
}

/** "Registrar carta de correção" and "Cancelar nota fiscal" of the authorised invoice of an order. Same hands as issuing. */
export async function registerNfeEventAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const number = formData.get("number");
  const kind = formData.get("kind");
  const text = formData.get("text");
  if (typeof number !== "string" || !ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };
  if (kind !== "cancelamento" && kind !== "correcao") return { error: "Escolha carta de correção ou cancelamento." };

  try {
    const result = await registerOrderNfeEvent(number, kind, typeof text === "string" ? text : "", session.email, new Date(), vaultKey(process.env.ERP_CERT_KEY), send, conn);
    console.info(`[nfe] pedido ${number}: ${result.message} Por ${session.email}`);
  } catch (error) {
    if (error instanceof IssueError) return { error: error.message };
    console.error("[nfe] falha ao registrar evento:", error instanceof Error ? error.message : error);
    return { error: FAILED };
  }
  revalidatePath(`${menuItem("pedidos").href}/${number}`);
  return { error: null };
}

/** The transport of the invoice: the way of freight (one of the options of the layout), who carries and the volumes. */
export async function saveTransportAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
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
  const order = await getOrder(number, { sellerEmail: null }, conn);
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
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };
  const number = text("number");
  if (number === null || !ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };
  const order = await getOrder(number, { sellerEmail: null }, conn);
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

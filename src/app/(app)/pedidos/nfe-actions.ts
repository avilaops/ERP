"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { IssueError, issueOrderNfe, registerOrderNfeEvent } from "@/lib/db/issue-nfe";
import { saveFreightMode } from "@/lib/db/invoices";
import { getOrder } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { vaultKey } from "@/lib/fiscal/certificate";
import { sendToSefaz } from "@/lib/fiscal/channel";
import type { ActionState } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";

const FAILED = "Não foi possível emitir agora. Confira a situação da nota abaixo antes de tentar de novo.";

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

/** The way of freight of the invoice, among the options of the layout. */
export async function saveFreightModeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const number = formData.get("number");
  const mode = formData.get("freightMode");
  if (typeof number !== "string" || !ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };
  if (typeof mode !== "string" || !["0", "1", "2", "3", "4", "9"].includes(mode)) return { error: "Escolha a modalidade do frete na lista." };
  const order = await getOrder(number, { sellerEmail: null }, conn);
  if (!order) return { error: "Pedido não encontrado." };
  await saveFreightMode(order.id, mode, conn);
  revalidatePath(`${menuItem("pedidos").href}/${number}`);
  return { error: null };
}

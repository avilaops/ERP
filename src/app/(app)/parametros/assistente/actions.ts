"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { AssistError, saveAiSettings } from "@/lib/db/assist";
import { revokeConnection, setMcpEnabled } from "@/lib/db/mcp";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

/** "Salvar": whether the company uses the assistant, and how many requests it may make in a month. */
export async function saveAssistantAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const limit = formData.get("monthlyLimit");
  const typed = typeof limit === "string" ? limit.trim() : "";
  const enabled = formData.get("enabled") === "sim";
  try {
    await saveAiSettings({ enabled, monthlyLimit: /^\d{1,5}$/.test(typed) ? Number(typed) : Number.NaN }, session.email, conn);
  } catch (error) {
    if (error instanceof AssistError) return { error: error.message };
    console.error("[assistente] falha ao gravar:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
  }
  console.info(`[assistente] ${session.email} ${enabled ? "ligou" : "desligou"} o assistente de ${session.tenant.slug}`);
  revalidatePath("/parametros/assistente");
  return { error: null, notice: enabled ? "Assistente ligado." : "Assistente desligado." };
}

/** "Ligar" and "Desligar" the connection of assistants to the ERP. Turning it off ends every connection there is. */
export async function setMcpAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const enabled = formData.get("what") === "ligar";
  await setMcpEnabled(enabled, session.email, conn);
  console.info(`[mcp] ${session.email} ${enabled ? "ligou" : "desligou"} a conexão com assistentes de ${session.tenant.slug}`);
  revalidatePath("/parametros/assistente");
  return { error: null, notice: enabled ? "Conexão ligada. Cada pessoa autoriza o próprio aplicativo, com o próprio login." : "Conexão desligada. Todos os aplicativos conectados perderam o acesso." };
}

/** "Desconectar" one application of one person: its keys stop working at once. */
export async function revokeMcpAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const typed = formData.get("id");
  const id = typeof typed === "string" && /^[1-9]\d{0,8}$/.test(typed) ? Number(typed) : null;
  if (id === null || !(await revokeConnection(id, null, session.email, conn))) return { error: "Conexão não encontrada. Recarregue a página." };
  console.info(`[mcp] ${session.email} desconectou um aplicativo em ${session.tenant.slug}`);
  revalidatePath("/parametros/assistente");
  return { error: null, notice: "Aplicativo desconectado." };
}

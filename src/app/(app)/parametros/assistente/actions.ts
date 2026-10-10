"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { AssistError, saveAiSettings } from "@/lib/db/assist";
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

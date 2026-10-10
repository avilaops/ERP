"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { saveVoiceSettings } from "@/lib/db/voice";
import type { ActionState } from "@/lib/order-form";
import { VoiceError } from "@/lib/voice/call";

/** "Salvar": whether the company calls by the system, and how many calls it may make in a month. */
export async function saveVoiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const limit = formData.get("monthlyLimit");
  const typed = typeof limit === "string" ? limit.trim() : "";
  const enabled = formData.get("enabled") === "sim";
  try {
    await saveVoiceSettings({ enabled, monthlyLimit: /^\d{1,5}$/.test(typed) ? Number(typed) : Number.NaN }, session.email, conn);
  } catch (error) {
    if (error instanceof VoiceError) return { error: error.message };
    console.error("[telefonia] falha ao gravar:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
  }
  console.info(`[telefonia] ${session.email} ${enabled ? "ligou" : "desligou"} a ligação pelo sistema de ${session.tenant.slug}`);
  revalidatePath("/parametros/telefonia");
  return { error: null, notice: enabled ? "Ligação pelo sistema ligada." : "Ligação pelo sistema desligada." };
}

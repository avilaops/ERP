"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { AutomationError, saveAutomationRule } from "@/lib/db/automations";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

/** "Salvar" of one rule: for how many days, with which text, and whether it is on. */
export async function saveAutomationRuleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const id = Number(text("id"));
  const days = text("days").trim();
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "Regra não encontrada." };
  try {
    await saveAutomationRule(id, { days: /^\d{1,2}$/.test(days) ? Number(days) : Number.NaN, title: text("title"), active: text("active") === "sim" }, session.email, conn);
  } catch (error) {
    if (error instanceof AutomationError) return { error: error.message };
    console.error("[lembretes] falha ao gravar a regra:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
  }
  revalidatePath("/parametros/automacoes");
  return { error: null, notice: "Regra gravada. Vale para os próximos lembretes." };
}

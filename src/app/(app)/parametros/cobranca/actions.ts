"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { PixError, removePixSettings, savePixSettings } from "@/lib/db/pix";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/** "Salvar" of the PIX key, and "Remover" (the confirmation, a submit with no name). */
export async function pixSettingsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const saving = field(formData, "what") === "salvar";
  try {
    if (saving) await savePixSettings({ key: field(formData, "key"), name: field(formData, "name"), city: field(formData, "city") }, session.email, conn);
    else await removePixSettings(session.email, conn);
  } catch (error) {
    if (error instanceof PixError) return { error: error.message };
    console.error("[cobrança] falha ao gravar a chave PIX:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
  }
  revalidatePath("/parametros/cobranca");
  revalidatePath(menuItem("recebimentos").href, "layout");
  return { error: null, notice: saving ? "Chave PIX gravada: as parcelas em aberto já têm o PIX copia e cola." : "Chave PIX removida." };
}

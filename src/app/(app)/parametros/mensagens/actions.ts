"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { deleteTemplate, MessageError, saveTemplate } from "@/lib/db/messages";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

/** "Salvar modelo" (new, or the one with `id`) and "Remover", by the button pressed. */
export async function changeTemplateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const raw = field(formData, "id");
  const id = /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null;
  // "Remover" asks once more, and its confirmation is a plain submit: with no button named, on a saved template, it is the removal.
  const what = field(formData, "what") || (id === null ? "salvar" : "remover");
  try {
    if (what === "remover" && id !== null) await deleteTemplate(id, conn);
    else await saveTemplate(id, { name: field(formData, "name"), subject: field(formData, "subject"), body: field(formData, "body") }, session.email, conn);
  } catch (error) {
    if (error instanceof MessageError) return { error: error.message };
    console.error("[mensagens] falha ao gravar o modelo:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
  }
  revalidatePath("/parametros/mensagens");
  return { error: null, notice: what === "remover" ? "Modelo removido." : "Modelo gravado." };
}

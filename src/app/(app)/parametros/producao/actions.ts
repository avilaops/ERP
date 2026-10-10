"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { setProductionEnabled } from "@/lib/db/modules";
import { createProductionStage, deleteProductionStage, moveProductionStage, ProductionError, renameProductionStage } from "@/lib/db/production";
import type { ActionState } from "@/lib/order-form";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

function problem(error: unknown): ActionState {
  if (error instanceof ProductionError) return { error: error.message };
  console.error("[produção] falha ao gravar etapa:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
}

/** "Adicionar etapa" of the factory floor. */
export async function createProductionStageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await createProductionStage(field(formData, "name"), session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath("/parametros/producao");
  revalidatePath("/producao");
  return { error: null, notice: "Etapa criada." };
}

/** "Salvar" (the name), "Subir", "Descer" and "Remover" of one stage, by the button pressed. */
export async function changeProductionStageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const typed = field(formData, "id");
  const id = /^[1-9]\d{0,8}$/.test(typed) ? Number(typed) : null;
  const what = field(formData, "what") || "remover";
  if (id === null) return { error: "Etapa não encontrada." };
  try {
    if (what === "remover") await deleteProductionStage(id, conn);
    else if (what === "antes" || what === "depois") await moveProductionStage(id, what, session.email, conn);
    else await renameProductionStage(id, field(formData, "name"), session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath("/parametros/producao");
  revalidatePath("/producao");
  return { error: null };
}

/** "Ligar" and "Desligar" of the production module, for the whole company. */
export async function switchProductionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const enabled = field(formData, "enabled") === "1";
  try {
    await setProductionEnabled(enabled, session.email, tenantDb(session.tenant.slug));
  } catch (error) {
    return problem(error);
  }
  revalidatePath("/", "layout");
  return { error: null, notice: enabled ? "Produção ligada: já aparece no menu." : "Produção desligada: saiu do menu." };
}

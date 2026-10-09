"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { createStage, deleteStage, FunnelError, moveStage, renameStage } from "@/lib/db/funnel";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/funil";

function problem(error: unknown): ActionState {
  if (error instanceof FunnelError) return { error: error.message };
  console.error("[funil] falha ao gravar as etapas:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
}

const field = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

function done(): ActionState {
  revalidatePath(HERE);
  revalidatePath("/funil");
  return { error: null };
}

/** "Adicionar etapa", after the last open one. */
export async function createStageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await createStage(field(formData, "name"), session.email, conn);
  } catch (error) {
    return problem(error);
  }
  return done();
}

/** "Salvar", "Subir", "Descer" and "Remover" of one stage, by the button pressed. */
export async function changeStageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const id = Number(field(formData, "id"));
  // "Remover" asks once more before going, and its confirmation is a plain submit: with no button named, it is the removal.
  const what = field(formData, "what") || "remover";
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "Etapa não encontrada." };
  try {
    if (what === "remover") await deleteStage(id, conn);
    else if (what === "subir" || what === "descer") await moveStage(id, what === "subir" ? "antes" : "depois", session.email, conn);
    else await renameStage(id, field(formData, "name"), session.email, conn);
  } catch (error) {
    return problem(error);
  }
  return done();
}

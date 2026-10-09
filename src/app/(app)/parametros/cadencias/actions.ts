"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { addCadenceStep, CadenceError, createCadence, deleteCadence, deleteCadenceStep, saveCadence } from "@/lib/db/cadences";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/cadencias";
const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};
const whole = (value: string) => (/^[1-9]\d{0,8}$/.test(value) ? Number(value) : null);

function problem(error: unknown): ActionState {
  if (error instanceof CadenceError) return { error: error.message };
  console.error("[cadências] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
}

/** "Criar cadência": the name; the steps are added next. */
export async function createCadenceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await createCadence(field(formData, "name"), session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  return { error: null, notice: "Cadência criada. Abra-a e adicione os passos." };
}

/** "Salvar" (name and whether it is on) and "Remover" of one cadence, by the button pressed. */
export async function changeCadenceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const id = whole(field(formData, "id"));
  // "Remover" asks once more, and its confirmation is a plain submit: with no button named, it is the removal.
  const what = field(formData, "what") || "remover";
  if (id === null) return { error: "Cadência não encontrada." };
  try {
    if (what === "remover") await deleteCadence(id, conn);
    else await saveCadence(id, { name: field(formData, "name"), active: field(formData, "active") === "sim" }, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  return { error: null };
}

/** "Adicionar passo" at the end of a cadence, and "Remover" of one step. */
export async function changeCadenceStepAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const stepId = whole(field(formData, "stepId"));
  const cadenceId = whole(field(formData, "cadenceId"));
  try {
    if (stepId !== null) await deleteCadenceStep(stepId, conn);
    else if (cadenceId !== null) {
      const days = field(formData, "waitDays").trim();
      await addCadenceStep(cadenceId, { kind: field(formData, "kind"), waitDays: /^\d{1,2}$/.test(days) ? Number(days) : Number.NaN, templateId: whole(field(formData, "templateId")), taskTitle: field(formData, "taskTitle") }, conn);
    } else return { error: "Cadência não encontrada." };
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  return { error: null };
}

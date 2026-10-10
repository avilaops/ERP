"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { deleteProductionOrder, moveProductionOrder, ProductionError, saveProductionOrder, sendToProduction } from "@/lib/db/production";
import type { ActionState } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";

const HERE = "/producao";
const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};
const whole = (value: string) => (/^[1-9]\d{0,8}$/.test(value) ? Number(value) : null);

function problem(error: unknown): ActionState {
  if (error instanceof ProductionError) return { error: error.message };
  console.error("[produção] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
}

/** "Mandar para a produção": a closed order becomes one production order for each equipment. */
export async function sendToProductionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("producao");
  const conn = tenantDb(session.tenant.slug);
  const number = field(formData, "number").trim();
  if (!ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };
  let made: number;
  try {
    made = await sendToProduction(number, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  return { error: null, notice: `Pedido #${number} na produção: ${made} ${made === 1 ? "ordem criada" : "ordens criadas"}.` };
}

/** "Mover" a production order to the stage chosen. */
export async function moveProductionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("producao");
  const conn = tenantDb(session.tenant.slug);
  const id = whole(field(formData, "id"));
  const stageId = whole(field(formData, "stageId"));
  if (id === null || stageId === null) return { error: "Escolha a etapa." };
  try {
    await moveProductionOrder(id, stageId, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  revalidatePath(`${HERE}/${id}`);
  return { error: null, notice: "Ordem movida." };
}

/** "Salvar" (the day it is due and the notes) and "Tirar da produção" of one order, by the button pressed. */
export async function changeProductionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("producao");
  const conn = tenantDb(session.tenant.slug);
  const id = whole(field(formData, "id"));
  // "Tirar da produção" asks once more, and its confirmation is a plain submit: with no button named, it is the removal.
  const what = field(formData, "what") || "remover";
  if (id === null) return { error: "Ordem de produção não encontrada." };
  try {
    if (what === "remover") await deleteProductionOrder(id, conn);
    else await saveProductionOrder(id, { dueOn: field(formData, "dueOn") || null, notes: field(formData, "notes") || null }, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  if (what === "remover") redirect(HERE);
  revalidatePath(`${HERE}/${id}`);
  return { error: null, notice: "Ordem gravada." };
}

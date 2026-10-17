"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { ColorError, createEquipmentColor, deleteEquipmentColor, updateEquipmentColor } from "@/lib/db/equipment-colors";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/cores";
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

function problem(error: unknown): string {
  if (error instanceof ColorError) return error.message;
  console.error("[cores] falha ao gravar:", error instanceof Error ? error.message : error);
  return FAILED;
}

export async function createColorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await createEquipmentColor(text(formData, "part"), text(formData, "name"), session.email, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null, notice: "Cor adicionada." };
}

export async function updateColorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const position = text(formData, "position");
  try {
    // Anything that is not a whole number is refused by the database layer, with the message of the field.
    await updateEquipmentColor(Number(text(formData, "id")), { name: text(formData, "name"), position: /^\d{1,4}$/.test(position) ? Number(position) : -1 }, session.email, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null, notice: "Cor salva." };
}

/** "Remover": the orders that chose the colour keep it; only the list changes. */
export async function deleteColorAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await deleteEquipmentColor(Number(text(formData, "id")), conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null, notice: "Cor removida da lista. Os pedidos anteriores mantêm a escolha." };
}

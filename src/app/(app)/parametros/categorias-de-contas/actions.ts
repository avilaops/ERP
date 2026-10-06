"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { createPayableCategory, PayableCategoryError, updatePayableCategory } from "@/lib/db/payable-categories";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/categorias-de-contas";
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

function problem(error: unknown): string {
  if (error instanceof PayableCategoryError) return error.message;
  console.error("[categorias-de-contas] falha ao gravar:", error instanceof Error ? error.message : error);
  return FAILED;
}

export async function createPayableCategoryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await createPayableCategory(text(formData, "label"), session.email, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

export async function updatePayableCategoryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const position = text(formData, "position");
  try {
    await updatePayableCategory(
      Number(text(formData, "id")),
      // Anything that is not a whole number is refused by the database layer, with the message of the field.
      { label: text(formData, "label"), position: /^\d{1,4}$/.test(position) ? Number(position) : -1, active: text(formData, "active") !== "" },
      session.email,
      conn,
    );
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { createPaymentMethod, PaymentMethodError, updatePaymentMethod, deletePaymentMethod } from "@/lib/db/payment-methods";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/formas-de-pagamento";
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

function problem(error: unknown): string {
  if (error instanceof PaymentMethodError) return error.message;
  console.error("[formas-de-pagamento] falha ao gravar:", error instanceof Error ? error.message : error);
  return FAILED;
}

export async function createPaymentMethodAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await createPaymentMethod(text(formData, "label"), session.email, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

export async function updatePaymentMethodAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const position = text(formData, "position");
  try {
    await updatePaymentMethod(
      Number(text(formData, "id")),
      // Anything that is not a whole number is refused by the database layer, with the message of the field.
      { label: text(formData, "label"), position: /^\d{1,4}$/.test(position) ? Number(position) : -1, active: text(formData, "active") !== "", onDelivery: text(formData, "onDelivery") !== "" },
      session.email,
      conn,
    );
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

/** "Remover": what already used the name keeps it; only the list changes. */
export async function deletePaymentMethodAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await deletePaymentMethod(Number(text(formData, "id")), conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

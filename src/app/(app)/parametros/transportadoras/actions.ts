"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { CarrierError, createCarrier, deleteCarrier, updateCarrier } from "@/lib/db/carriers";
import type { CarrierInput } from "@/lib/db/carriers";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/transportadoras";
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};
const read = (formData: FormData): CarrierInput => ({
  document: text(formData, "document"),
  name: text(formData, "name"),
  stateRegistration: text(formData, "stateRegistration") || null,
  address: text(formData, "address") || null,
  city: text(formData, "city") || null,
  uf: text(formData, "uf") || null,
});

function problem(error: unknown): string {
  if (error instanceof CarrierError) return error.message;
  console.error("[transportadoras] falha ao gravar:", error instanceof Error ? error.message : error);
  return FAILED;
}

export async function createCarrierAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await createCarrier(read(formData), session.email, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

export async function updateCarrierAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await updateCarrier(Number(text(formData, "id")), read(formData), session.email, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

/** Only a carrier no order uses leaves. */
export async function deleteCarrierAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await deleteCarrier(Number(text(formData, "id")), conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

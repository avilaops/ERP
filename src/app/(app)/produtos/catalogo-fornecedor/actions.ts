"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { createSupplierItem, deleteSupplierItem, saveSupplierItemPhoto, SupplierItemError, updateSupplierItem } from "@/lib/db/supplier-items";
import type { SupplierItemInput } from "@/lib/db/supplier-items";
import type { ActionState } from "@/lib/order-form";
import { MAX_UPLOAD_BYTES, PhotoError, TOO_LARGE_MESSAGE } from "@/lib/photos/normalize";

const HERE = "/produtos/catalogo-fornecedor";
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

/** What was typed. A number field left blank is "not informed"; one that is not a number is refused by the database layer. */
function read(formData: FormData): SupplierItemInput {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const number = (key: string) => (text(key) === "" ? null : Number(text(key).replace(/\./g, "").replace(",", ".")));
  return {
    supplier: text("supplier"), catalog: text("catalog"), line: text("line") || null, code: text("code"), name: text("name"),
    description: text("description") || null, lengthMm: number("lengthMm"), widthMm: number("widthMm"), heightMm: number("heightMm"),
    weightKg: number("weightKg"), loadType: text("loadType") || null, productCode: text("productCode") || null,
  };
}

/** The photo chosen on the form, or `null` when none was. */
async function photoOf(formData: FormData): Promise<Uint8Array | null> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_UPLOAD_BYTES) throw new PhotoError(TOO_LARGE_MESSAGE);
  return new Uint8Array(await file.arrayBuffer());
}

function problem(error: unknown): ActionState {
  if (error instanceof SupplierItemError || error instanceof PhotoError) return { error: error.message };
  console.error("[catalogo-fornecedor] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: FAILED };
}

export async function createSupplierItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);
  try {
    const photo = await photoOf(formData);
    const { id } = await createSupplierItem(read(formData), session.email, conn);
    if (photo) await saveSupplierItemPhoto(id, photo, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  redirect(HERE);
}

export async function updateSupplierItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);
  const id = Number(formData.get("id"));
  try {
    const photo = await photoOf(formData);
    await updateSupplierItem(id, read(formData), session.email, conn);
    if (photo) await saveSupplierItemPhoto(id, photo, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  redirect(HERE);
}

/** "Remover item": leaves a line in the log. */
export async function deleteSupplierItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);
  try {
    const { code } = await deleteSupplierItem(Number(formData.get("id")), conn);
    console.info(`[catalogo-fornecedor] ${session.email} removeu o item ${code} em ${session.tenant.slug}`);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  redirect(HERE);
}

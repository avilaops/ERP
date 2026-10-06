"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { createSupplier, SupplierError, updateSupplier } from "@/lib/db/suppliers";
import type { ActionState } from "@/lib/order-form";
import { readSupplierForm } from "@/lib/payable-form";

const HERE = menuItem("fornecedores").href;
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

const reader = (formData: FormData) => (key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
};

function problem(error: unknown): string {
  if (error instanceof SupplierError) return error.message;
  console.error("[fornecedores] falha ao gravar:", error instanceof Error ? error.message : error);
  return FAILED;
}

export async function createSupplierAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("fornecedores");
  const conn = tenantDb(session.tenant.slug);
  let id: number;
  try {
    id = (await createSupplier(readSupplierForm(reader(formData)), session.email, conn)).id;
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  redirect(`${HERE}/${id}`);
}

export async function updateSupplierAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("fornecedores");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  try {
    await updateSupplier(Number(read("id")), readSupplierForm(read), session.email, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  redirect(HERE);
}

"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { createUser, updateUser, UserError } from "@/lib/db/users";
import type { ActionState } from "@/lib/order-form";
import { parseUserForm } from "@/lib/user-form";
import type { UserField } from "@/lib/user-form";

const HERE = "/parametros/usuarios";
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

const reader = (formData: FormData) => (key: UserField | "id") => {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
};

function problem(error: unknown): string {
  if (error instanceof UserError) return error.message;
  console.error("[usuarios] falha ao gravar:", error instanceof Error ? error.message : error);
  return FAILED;
}

/** "Adicionar": the person gets in at the next sign-in, with the profile chosen here. */
export async function createUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);

  const parsed = parseUserForm(reader(formData), { withEmail: true });
  if (!parsed.ok) return { error: parsed.errors.join(" ") };
  try {
    await createUser(parsed.user, session.email, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

/** "Salvar" of a row: name, profile and whether the person still gets in. */
export async function updateUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);

  const read = reader(formData);
  const parsed = parseUserForm(read, { withEmail: false });
  if (!parsed.ok) return { error: parsed.errors.join(" ") };
  try {
    await updateUser(Number(read("id")), parsed.user, session.email, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

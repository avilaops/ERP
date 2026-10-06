"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { createUser, updateUser, UserError } from "@/lib/db/users";
import type { ActionState } from "@/lib/order-form";
import { parseUserForm } from "@/lib/user-form";
import type { UserField } from "@/lib/user-form";

const HERE = menuItem("equipe").href;
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

const reader = (formData: FormData) => (key: UserField | "id") => {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
};

function problem(error: unknown): ActionState {
  if (error instanceof UserError) return { error: error.message };
  console.error("[equipe] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: FAILED };
}

function done(): never {
  revalidatePath(HERE);
  revalidatePath("/parametros/usuarios");
  redirect(HERE);
}

/** "Convidar": the person gets in at the next sign-in, with the type of access chosen. */
export async function inviteUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  const parsed = parseUserForm(reader(formData), { withEmail: true });
  if (!parsed.ok) return { error: parsed.errors.join(" ") };
  try {
    await createUser(parsed.user, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  done();
}

/** "Salvar": name, type of access and whether the person still gets in. */
export async function saveUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const parsed = parseUserForm(read, { withEmail: false });
  if (!parsed.ok) return { error: parsed.errors.join(" ") };
  try {
    await updateUser(Number(read("id")), parsed.user, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  done();
}

"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { isRole } from "@/lib/auth/roles";
import { createProfile, deleteProfile, ProfileError, updateProfile } from "@/lib/db/access-profiles";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const HERE = `${menuItem("equipe").href}/perfis`;
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};
const list = (formData: FormData, key: string) => formData.getAll(key).filter((value): value is string => typeof value === "string");
/** The form sends the powers the profile keeps; what is stored is what it gives up. The layer below keeps only the ones of the type. */
const givenUp = (formData: FormData) => list(formData, "allPowers").filter((power) => !list(formData, "powers").includes(power));

function problem(error: unknown): ActionState {
  if (error instanceof ProfileError) return { error: error.message };
  console.error("[perfis] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: FAILED };
}

function done(notice: string): ActionState {
  revalidatePath(HERE);
  revalidatePath(menuItem("equipe").href);
  return { error: null, notice };
}

/** "Criar perfil": from one of the four types, with the screens and powers ticked. */
export async function createProfileAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  const base = text(formData, "baseRole");
  if (!isRole(base)) return { error: "Escolha de qual tipo de acesso o perfil parte." };
  try {
    const created = await createProfile({ name: text(formData, "name"), baseRole: base, items: list(formData, "items"), denied: givenUp(formData) }, session.email, conn);
    console.info(`[perfis] ${session.email} criou o perfil ${created.id} em ${session.tenant.slug}`);
    return done(`Perfil "${created.name}" criado. Dê a ele as pessoas em Equipe e acessos.`);
  } catch (error) {
    return problem(error);
  }
}

/** "Salvar": whoever has the profile gets the change at the next page they open. */
export async function updateProfileAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  try {
    const saved = await updateProfile(Number(text(formData, "id")), { name: text(formData, "name"), items: list(formData, "items"), denied: givenUp(formData) }, session.email, conn);
    console.info(`[perfis] ${session.email} alterou o perfil ${saved.id} em ${session.tenant.slug}`);
    return done(`Perfil "${saved.name}" gravado.`);
  } catch (error) {
    return problem(error);
  }
}

export async function deleteProfileAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  try {
    const removed = await deleteProfile(Number(text(formData, "id")), conn);
    console.info(`[perfis] ${session.email} removeu um perfil de ${session.tenant.slug}`);
    return done(`Perfil "${removed.name}" removido.`);
  } catch (error) {
    return problem(error);
  }
}

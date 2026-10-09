"use server";

import { noteUserChange } from "@/lib/auth/signed-up";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { publicAppUrl } from "@/lib/contract/public";
import { inviteByMail } from "@/lib/db/invite";
import { tenantDb } from "@/lib/db/pool";
import { vaultKey } from "@/lib/fiscal/certificate";
import { sendMail } from "@/lib/mail/smtp";
import { createUser, deleteUser, updateUser, UserError } from "@/lib/db/users";
import type { ActionState } from "@/lib/order-form";
import { parseUserForm } from "@/lib/user-form";
import type { UserField } from "@/lib/user-form";

const HERE = menuItem("equipe").href;
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

const reader = (formData: FormData) => (key: UserField | "id") => {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
};

/** The boxes ticked on the screen. The database layer keeps only the ones the type of access has. */
const screensOf = (formData: FormData) => formData.getAll("items").filter((value): value is string => typeof value === "string");

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
    const created = await createUser({ ...parsed.user, items: screensOf(formData) }, session.email, conn);
    await noteUserChange(process.env, session.tenant.slug, created.email, created.active);
    // The person is in; the e-mail tells them. What happens to it shows on the list, and it can be sent again.
    const invite = await inviteByMail({ userId: created.id, company: session.tenant.name, appUrl: publicAppUrl(), invitedBy: session.name, now: new Date(), env: process.env, key: () => vaultKey(process.env.ERP_CERT_KEY), send: sendMail }, conn);
    console.info(`[equipe] ${session.email} convidou ${created.email} em ${session.tenant.slug}: convite ${invite.status}`);
  } catch (error) {
    return problem(error);
  }
  done();
}

/** "Enviar convite por e-mail" of a person already registered: the same message of the invitation, again. */
export async function sendInviteAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  const id = Number(reader(formData)("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "Pessoa não encontrada." };
  let invite;
  try {
    invite = await inviteByMail({ userId: id, company: session.tenant.name, appUrl: publicAppUrl(), invitedBy: session.name, now: new Date(), env: process.env, key: () => vaultKey(process.env.ERP_CERT_KEY), send: sendMail }, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  revalidatePath(`${HERE}/${id}`);
  if (invite.status === "enviado") return { error: null, notice: `Convite enviado: ${invite.detail}.` };
  return { error: invite.detail ?? "O convite não saiu." };
}

/** "Salvar": name, type of access and whether the person still gets in. */
export async function saveUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const parsed = parseUserForm(read, { withEmail: false });
  if (!parsed.ok) return { error: parsed.errors.join(" ") };
  try {
    const saved = await updateUser(Number(read("id")), { ...parsed.user, items: screensOf(formData) }, session.email, conn);
    await noteUserChange(process.env, session.tenant.slug, saved.email, saved.active);
  } catch (error) {
    return problem(error);
  }
  done();
}

/** "Remover pessoa": she no longer gets in, and leaves the list. Leaves a line in the log. */
export async function deleteUserAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  try {
    const { email } = await deleteUser(Number(reader(formData)("id")), session.email, conn);
    console.info(`[equipe] ${session.email} removeu ${email} de ${session.tenant.slug}`);
    await noteUserChange(process.env, session.tenant.slug, email, false);
  } catch (error) {
    return problem(error);
  }
  done();
}

"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { deleteWhatsappTemplate, removeWhatsapp, saveWhatsapp, saveWhatsappTemplate } from "@/lib/db/whatsapp";
import { vaultKey } from "@/lib/fiscal/certificate";
import type { ActionState } from "@/lib/order-form";
import { WhatsappError } from "@/lib/whatsapp/api";

const HERE = "/parametros/whatsapp";
const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

function problem(error: unknown): ActionState {
  if (error instanceof WhatsappError) return { error: error.message };
  console.error("[whatsapp] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
}

/** "Salvar conta": the company's own official account. What is typed is sealed and never comes back to the screen or goes to a log. */
export async function saveWhatsappAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  let key: Buffer;
  try {
    key = vaultKey(process.env.ERP_CERT_KEY);
  } catch {
    return { error: "O cofre não está configurado neste servidor. Avise o suporte: falta a chave ERP_CERT_KEY." };
  }
  try {
    await saveWhatsapp({ phoneNumberId: field(formData, "phoneNumberId"), displayPhone: field(formData, "displayPhone") || null, token: field(formData, "accessKey"), secret: field(formData, "appSecret") }, key, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  console.info(`[whatsapp] ${session.email} cadastrou a conta de ${session.tenant.slug}`);
  revalidatePath(HERE);
  return { error: null, notice: "Conta gravada. Falta colar o endereço de aviso e a palavra de conferência no painel da Meta (abaixo)." };
}

/** "Remover conta": nothing more is sent or received. The conversations stay. */
export async function removeWhatsappAction(): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await removeWhatsapp(conn);
  } catch (error) {
    return problem(error);
  }
  console.info(`[whatsapp] ${session.email} removeu a conta de ${session.tenant.slug}`);
  revalidatePath(HERE);
  return { error: null, notice: "Conta removida." };
}

/** "Adicionar", "Salvar" and "Remover" of an approved template, by the button pressed. */
export async function whatsappTemplateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const typed = field(formData, "id");
  const id = /^[1-9]\d{0,8}$/.test(typed) ? Number(typed) : null;
  const what = field(formData, "what") || "remover";
  try {
    if (what === "remover") {
      if (id === null) return { error: "Modelo não encontrado." };
      await deleteWhatsappTemplate(id, conn);
    } else await saveWhatsappTemplate(id, { name: field(formData, "name"), language: field(formData, "language"), preview: field(formData, "preview") }, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  return { error: null, notice: what === "remover" ? "Modelo removido." : "Modelo gravado." };
}

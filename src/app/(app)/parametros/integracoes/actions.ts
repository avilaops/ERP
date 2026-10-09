"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { createApiKey, createWebhook, deleteWebhook, deliverPending, IntegrationError, retryDelivery, revokeApiKey, setWebhookActive } from "@/lib/db/integrations";
import { tenantDb } from "@/lib/db/pool";
import { vaultKey } from "@/lib/fiscal/certificate";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/integracoes";
const NO_VAULT = "O cofre não está configurado neste servidor. Avise o suporte: falta a chave ERP_CERT_KEY.";

function problem(error: unknown): ActionState {
  if (error instanceof IntegrationError) return { error: error.message };
  console.error("[integrações] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
}

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};
const whole = (value: string) => (/^[1-9]\d{0,8}$/.test(value) ? Number(value) : null);

/** "Criar chave". The key is shown once, in the answer, and never again: what is kept is its hash. */
export async function createApiKeyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  let made;
  try {
    made = await createApiKey(session.tenant.slug, { name: field(formData, "name"), canWrite: field(formData, "canWrite") === "sim", ownerEmail: field(formData, "ownerEmail") }, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  console.info(`[integrações] ${session.email} criou a chave "${made.record.name}" (${made.record.prefix}…) em ${session.tenant.slug}`);
  revalidatePath(HERE);
  return { error: null, notice: `Copie a chave agora, ela não aparece de novo: ${made.key}` };
}

/** "Revogar": the key stops working at once. */
export async function revokeApiKeyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const id = whole(field(formData, "id"));
  if (id === null) return { error: "Chave não encontrada." };
  try {
    await revokeApiKey(id, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  console.info(`[integrações] ${session.email} revogou a chave ${id} de ${session.tenant.slug}`);
  revalidatePath(HERE);
  return { error: null, notice: "Chave revogada." };
}

/** "Adicionar destino" of the notices. Its secret is shown once, to check the signature on the other side. */
export async function createWebhookAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  let key: Buffer;
  try {
    key = vaultKey(process.env.ERP_CERT_KEY);
  } catch {
    return { error: NO_VAULT };
  }
  let made;
  try {
    made = await createWebhook({ name: field(formData, "name"), url: field(formData, "url"), events: formData.getAll("events").filter((value): value is string => typeof value === "string") }, key, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  console.info(`[integrações] ${session.email} cadastrou o destino de avisos ${made.id} em ${session.tenant.slug}`);
  revalidatePath(HERE);
  return { error: null, notice: `Destino cadastrado. Copie o segredo que assina os avisos, ele não aparece de novo: ${made.secret}` };
}

/** "Pausar", "Retomar" and "Remover" of one destination, by the button pressed. */
export async function changeWebhookAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const id = whole(field(formData, "id"));
  // "Remover" asks once more, and its confirmation is a plain submit: with no button named, it is the removal.
  const what = field(formData, "what") || "remover";
  if (id === null) return { error: "Destino não encontrado." };
  try {
    if (what === "remover") await deleteWebhook(id, conn);
    else await setWebhookActive(id, what === "retomar", conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  return { error: null };
}

/** "Tentar de novo": a failed notice gets its tries back and is sent now. */
export async function retryDeliveryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const id = whole(field(formData, "id"));
  if (id === null) return { error: "Aviso não encontrado." };
  try {
    await retryDelivery(id, conn);
    await deliverPending(() => vaultKey(process.env.ERP_CERT_KEY), new Date(), conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  return { error: null };
}

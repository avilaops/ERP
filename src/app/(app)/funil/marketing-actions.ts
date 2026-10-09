"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { CampaignError, cancelCampaign, deleteCampaign, saveCampaign, saveMarketingSettings, sendCampaignTest, startCampaign } from "@/lib/db/campaigns";
import { CaptureError, deleteCaptureForm, saveCaptureForm } from "@/lib/db/capture";
import { addOptout, OptoutError, removeOptout } from "@/lib/db/optout";
import { tenantDb } from "@/lib/db/pool";
import { vaultKey } from "@/lib/fiscal/certificate";
import { MailError } from "@/lib/mail/message";
import { sendMail } from "@/lib/mail/smtp";
import type { ActionState } from "@/lib/order-form";

/**
 * Campaigns, the list of who left and the capture forms. They speak to the
 * whole base of the company, so they are of who answers for the team: the
 * manager and the direction. A seller has the funnel, not these.
 */
const CAMPAIGNS = "/funil/campanhas";
const FORMS = "/funil/captura";
const ONLY_TEAM_LEAD = "Campanhas e formulários são de quem acompanha a equipe toda (gerência e diretoria).";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};
const whole = (value: string) => (/^[1-9]\d{0,8}$/.test(value) ? Number(value) : null);

function problem(error: unknown): ActionState {
  if (error instanceof CampaignError || error instanceof CaptureError || error instanceof OptoutError || error instanceof MailError) return { error: error.message };
  console.error("[marketing] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
}

/** "Criar campanha" (goes to the campaign) and "Salvar" of a draft. */
export async function saveCampaignAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  if (!seesAllOrders(session)) return { error: ONLY_TEAM_LEAD };
  const conn = tenantDb(session.tenant.slug);
  const id = whole(field(formData, "id"));
  let saved: number;
  try {
    saved = await saveCampaign(id, { name: field(formData, "name"), subject: field(formData, "subject"), body: field(formData, "body"), audience: field(formData, "audience"), uf: field(formData, "uf") || null }, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(CAMPAIGNS);
  if (id === null) redirect(`${CAMPAIGNS}/${saved}`);
  return { error: null, notice: "Campanha gravada." };
}

/** The buttons of one campaign: "Enviar teste para mim", "Enviar campanha", "Cancelar envio" and "Remover". */
export async function campaignAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  if (!seesAllOrders(session)) return { error: ONLY_TEAM_LEAD };
  const conn = tenantDb(session.tenant.slug);
  const id = whole(field(formData, "id"));
  // "Remover" asks once more, and its confirmation is a plain submit: with no button named, it is the removal.
  const what = field(formData, "what") || "remover";
  if (id === null) return { error: "Campanha não encontrada." };
  let notice: string;
  try {
    if (what === "testar") {
      await sendCampaignTest(id, { email: session.email, name: session.name }, session.tenant, new Date(), { env: process.env, key: () => vaultKey(process.env.ERP_CERT_KEY), send: sendMail }, conn);
      notice = `Teste enviado para ${session.email}.`;
    } else if (what === "enviar") {
      const total = await startCampaign(id, session.email, new Date(), conn);
      notice = `Campanha iniciada para ${total} ${total === 1 ? "pessoa" : "pessoas"}. Os e-mails saem aos poucos.`;
    } else if (what === "cancelar") {
      await cancelCampaign(id, session.email, conn);
      notice = "Envio cancelado. Quem ainda não tinha recebido não recebe.";
    } else {
      await deleteCampaign(id, conn);
      notice = "";
    }
  } catch (error) {
    return problem(error);
  }
  revalidatePath(CAMPAIGNS);
  if (what === "remover") redirect(CAMPAIGNS);
  return { error: null, notice };
}

/** The list of who gets no automatic e-mail: "Adicionar" by hand and "Remover". */
export async function optoutAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  if (!seesAllOrders(session)) return { error: ONLY_TEAM_LEAD };
  const conn = tenantDb(session.tenant.slug);
  const remove = field(formData, "remove");
  try {
    if (remove !== "") await removeOptout(remove, conn);
    else await addOptout(field(formData, "email"), session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(CAMPAIGNS);
  return { error: null, notice: remove !== "" ? "E-mail voltou a receber." : "E-mail incluído: não recebe mais campanhas nem cadências." };
}

/** "Salvar" of how many campaign e-mails the company sends in a day. */
export async function marketingLimitAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  if (!seesAllOrders(session)) return { error: ONLY_TEAM_LEAD };
  const conn = tenantDb(session.tenant.slug);
  const typed = field(formData, "dailyLimit").trim();
  try {
    await saveMarketingSettings(/^\d{1,4}$/.test(typed) ? Number(typed) : Number.NaN, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(CAMPAIGNS);
  return { error: null, notice: "Limite gravado." };
}

/** "Criar formulário", "Salvar" and "Remover" of a capture form, by the button pressed. */
export async function captureFormAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  if (!seesAllOrders(session)) return { error: ONLY_TEAM_LEAD };
  const conn = tenantDb(session.tenant.slug);
  const id = whole(field(formData, "id"));
  const what = field(formData, "what") || "remover";
  try {
    if (what === "remover") {
      if (id === null) return { error: "Formulário não encontrado." };
      await deleteCaptureForm(id, conn);
    } else {
      await saveCaptureForm(id, { name: field(formData, "name"), title: field(formData, "title"), intro: field(formData, "intro") || null, ownerEmail: field(formData, "ownerEmail"), active: field(formData, "active") !== "nao" }, session.email, conn);
    }
  } catch (error) {
    return problem(error);
  }
  revalidatePath(FORMS);
  return { error: null, notice: what === "remover" ? "Formulário removido." : id === null ? "Formulário criado. O endereço da página aparece na lista." : "Formulário gravado." };
}

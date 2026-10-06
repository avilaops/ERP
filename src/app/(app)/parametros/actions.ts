"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { menuItem } from "@/lib/auth/permissions";
import { CompanyError, removeLogo, saveCommissionDay, saveLogo } from "@/lib/db/company";
import { loadParams, saveParams } from "@/lib/db/params";
import type { ActionState } from "@/lib/order-form";
import { listProductCosts } from "@/lib/db/products";
import { paramsToForm, parseParamsForm, rawFormValues } from "@/lib/params-form";
import type { FormKey, ParamsFormState } from "@/lib/params-form";
import { validateParams } from "@/lib/pricing/params";
import type { PricingParams } from "@/lib/pricing/params";
import { suggestedDownPayment } from "@/lib/pricing/results";
import { tableMultiplier } from "@/lib/pricing/table";

const PATH = menuItem("parametros").href;
const SAVE_FAILED = "Não foi possível gravar os parâmetros agora. Nada foi alterado; tente de novo.";

/** The engine's own message when the parameters make no sense; `null` when they are fine. */
function policyProblem(params: PricingParams): string | null {
  try {
    validateParams(params);
    tableMultiplier(params);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** A server action is a public endpoint: the permission is checked again, before reading anything. */
export async function saveParamsAction(_previous: ParamsFormState, formData: FormData): Promise<ParamsFormState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);

  const read = (key: FormKey) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : null;
  };
  const typed = rawFormValues(read);

  const parsed = parseParamsForm(read);
  if (!parsed.ok) return { status: "error", errors: parsed.errors, invalid: parsed.invalid, values: typed };

  const problem = policyProblem(parsed.params);
  if (problem) return { status: "error", errors: [problem], invalid: [], values: typed };

  try {
    await saveParams(parsed.params, session.email, conn);
  } catch (error) {
    console.error("[parametros] falha ao gravar:", error instanceof Error ? error.message : error);
    return { status: "error", errors: [SAVE_FAILED], invalid: [], values: typed };
  }

  revalidatePath(PATH);
  return { status: "saved", errors: [], invalid: [], values: paramsToForm(parsed.params) };
}

/** The "usar" button: adopts the suggested down payment as the policy. Same checks as saving. */
export async function adoptSuggestedDownPaymentAction(): Promise<void> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);

  const params = await loadParams(conn);
  const suggestion = suggestedDownPayment(await listProductCosts(conn), params);
  if (!suggestion) return;

  const next = { ...params, minDownPayment: suggestion.rate };
  // A suggestion of 100% or more is not a policy the system can hold: nothing is saved.
  if (policyProblem(next)) return;

  await saveParams(next, session.email, conn);
  revalidatePath(PATH);
}

export type LogoState = { status: "idle" | "saved" | "removed" | "error"; message: string | null };

const logoFailed = (error: unknown): LogoState => {
  if (error instanceof CompanyError) return { status: "error", message: error.message };
  console.error("[parametros] falha ao gravar a logo:", error instanceof Error ? error.message : error);
  return { status: "error", message: "Não foi possível gravar a logo agora. Nada foi alterado; tente de novo." };
};

/** Sends the company's logo. What the file is comes from its bytes, checked on the server. */
export async function saveLogoAction(_previous: LogoState, formData: FormData): Promise<LogoState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Escolha o arquivo da logo." };
  // Refused by its declared size before the bytes are read into memory.
  if (file.size > 512 * 1024) return { status: "error", message: "A logo passa de 512 KB. Envie uma imagem menor." };
  try {
    await saveLogo(new Uint8Array(await file.arrayBuffer()), session.email, conn);
  } catch (error) {
    return logoFailed(error);
  }
  revalidatePath("/", "layout");
  return { status: "saved", message: "Logo gravada. Ela já aparece no menu." };
}

export async function removeLogoAction(): Promise<LogoState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);

  try {
    await removeLogo(session.email, conn);
  } catch (error) {
    return logoFailed(error);
  }
  revalidatePath("/", "layout");
  return { status: "removed", message: "Logo removida. O menu voltou a mostrar o nome da empresa." };
}

/** "Dia do pagamento da comissão": a parameter of the company, valid for the commissions born from now on. */
export async function saveCommissionDayAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);

  const typed = formData.get("day");
  const text = typeof typed === "string" ? typed.trim() : "";
  try {
    // Anything that is not a whole number is refused by the database layer, with the message of the field.
    await saveCommissionDay(/^\d{1,2}$/.test(text) ? Number(text) : 0, session.email, conn);
  } catch (error) {
    if (error instanceof CompanyError) return { error: error.message };
    console.error("[parametros] falha ao gravar o dia da comissão:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
  }
  revalidatePath(menuItem("parametros").href);
  revalidatePath(menuItem("comissoes").href);
  return { error: null };
}

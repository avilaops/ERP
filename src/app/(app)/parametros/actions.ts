"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { menuItem } from "@/lib/auth/permissions";
import { loadParams, saveParams } from "@/lib/db/params";
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

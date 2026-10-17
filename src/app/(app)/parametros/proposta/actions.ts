"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { saveProposalDetails } from "@/lib/db/proposal-details";
import type { ActionState } from "@/lib/order-form";
import { COMPANY_PROPOSAL_STEPS, ProposalSettingsError } from "@/lib/quote/settings";
import type { ProposalDetails } from "@/lib/quote/settings";

export async function saveCompanyProposalAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const read = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
  const step = Number(read("step"));
  const group = COMPANY_PROPOSAL_STEPS[step];
  if (!Number.isInteger(step) || !group) return { error: "Recarregue a tela." };
  const values: ProposalDetails = Object.fromEntries(group.fields.map((key) => [key, read(key)]));
  try { await saveProposalDetails({ values, fields: group.fields, revision: read("revision"), actor: session.email }, tenantDb(session.tenant.slug)); }
  catch (error) { if (error instanceof ProposalSettingsError) return { error: error.message }; throw error; }
  revalidatePath("/parametros/proposta");
  const next = read("intent") === "back" ? Math.max(0, step - 1) : step + 1;
  redirect(next >= COMPANY_PROPOSAL_STEPS.length ? "/parametros/proposta?salvo=1" : `/parametros/proposta?etapa=${next}`);
}

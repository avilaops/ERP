"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { ContractError, saveContractSettings } from "@/lib/db/contracts";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/contrato";

/** "Salvar modelo": the text of the contract, for how long the link is good and the message that carries it. */
export async function saveContractSettingsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const days = text("linkDays").trim();
  try {
    await saveContractSettings(
      { title: text("title"), body: text("body"), linkDays: /^\d{1,2}$/.test(days) ? Number(days) : Number.NaN, mailSubject: text("mailSubject"), mailBody: text("mailBody") },
      session.email,
      conn,
    );
  } catch (error) {
    if (error instanceof ContractError) return { error: error.message };
    console.error("[contrato] falha ao gravar o modelo:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
  }
  console.info(`[contrato] ${session.email} alterou o modelo do contrato de ${session.tenant.slug}`);
  revalidatePath(HERE);
  return { error: null, notice: "Modelo gravado. Vale para os próximos contratos; os já enviados não mudam." };
}

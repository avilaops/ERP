"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { ContractFileError, modelText } from "@/lib/contract/docx";
import { ContractError, loadContractSettings, saveContractSettings } from "@/lib/db/contracts";
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
      {
        title: text("title"), body: text("body"), linkDays: /^\d{1,2}$/.test(days) ? Number(days) : Number.NaN, mailSubject: text("mailSubject"), mailBody: text("mailBody"),
        downloadDays: /^\d{1,3}$/.test(text("downloadDays").trim()) ? Number(text("downloadDays").trim()) : Number.NaN,
        seal: text("seal") === "sim",
        secondFactor: text("secondFactor") === "sim",
      },
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

/**
 * "Usar este arquivo como modelo": the contract the company already has, in
 * Word or plain text. Its text takes the place of the model's; the fields in
 * braces are then marked by hand on the screen. Title, validity of the link
 * and the message of the e-mail stay as they are.
 */
export async function importContractModelAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo do contrato (.docx ou .txt)." };
  if (file.size > 2 * 1024 * 1024) return { error: "Arquivo grande demais para um modelo de contrato: o limite é 2 MB." };
  let length = 0;
  try {
    const body = modelText(new Uint8Array(await file.arrayBuffer()), file.name);
    length = body.length;
    await saveContractSettings({ ...(await loadContractSettings(conn)), body }, session.email, conn);
  } catch (error) {
    if (error instanceof ContractFileError || error instanceof ContractError) return { error: error.message };
    console.error("[contrato] falha ao importar o modelo:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível ler o arquivo agora. Nada foi alterado; tente de novo." };
  }
  console.info(`[contrato] ${session.email} importou o modelo do contrato de ${session.tenant.slug} de um arquivo (${length} letras)`);
  revalidatePath(HERE);
  return { error: null, notice: "Texto importado para o modelo. Confira abaixo e ponha os campos entre chaves onde entram os dados do pedido." };
}

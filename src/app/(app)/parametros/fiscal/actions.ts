"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { FiscalError, removeCertificate, saveCertificate, saveFiscalSettings, saveProductFiscal } from "@/lib/db/fiscal";
import { tenantDb } from "@/lib/db/pool";
import { CertificateError, vaultKey } from "@/lib/fiscal/certificate";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/fiscal";
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";
const OK: ActionState = { error: null };

const reader = (formData: FormData) => (key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};
const whole = (text: string) => (/^\d{1,9}$/.test(text) ? Number(text) : 0);

function problem(action: string, error: unknown): ActionState {
  if (error instanceof FiscalError || error instanceof CertificateError) return { error: error.message };
  console.error(`[fiscal] falha ao ${action}:`, error instanceof Error ? error.message : error);
  return { error: FAILED };
}

/** "Salvar dados fiscais": what the invoice says about who issues it. */
export async function saveFiscalSettingsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const text = reader(formData);
  const regime = Number(text("taxRegime"));
  try {
    await saveFiscalSettings(
      {
        legalName: text("legalName") || null,
        cnpj: text("cnpj") || null,
        stateRegistration: text("stateRegistration") || null,
        taxRegime: text("taxRegime") === "" ? null : (regime as 1 | 2 | 3),
        street: text("street") || null,
        streetNumber: text("streetNumber") || null,
        district: text("district") || null,
        city: text("city") || null,
        cityCode: text("cityCode") || null,
        uf: text("uf") || null,
        cep: text("cep") || null,
        series: whole(text("series")),
        nextNumber: whole(text("nextNumber")),
        environment: text("environment") === "producao" ? "producao" : "homologacao",
      },
      session.email,
      conn,
    );
  } catch (error) {
    return problem("gravar os dados fiscais", error);
  }
  revalidatePath(HERE);
  return OK;
}

/**
 * "Enviar certificado". The file and its password are read here, checked and
 * sealed before anything is stored; neither is logged nor sent back. Without
 * the key of the vault on this server nothing is stored.
 */
export async function saveCertificateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);

  let key: Buffer;
  try {
    key = vaultKey(process.env.ERP_CERT_KEY);
  } catch {
    return { error: "O cofre do certificado não está configurado neste servidor. Avise o suporte: falta a chave ERP_CERT_KEY." };
  }
  const file = formData.get("certificate");
  const password = formData.get("password");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo do certificado (.pfx ou .p12)." };
  if (file.size > 32 * 1024) return { error: "Arquivo grande demais para ser um certificado A1." };
  if (typeof password !== "string" || password === "") return { error: "Informe a senha do certificado." };
  try {
    await saveCertificate(new Uint8Array(await file.arrayBuffer()), password, key, session.email, new Date(), conn);
    console.info(`[fiscal] ${session.email} enviou o certificado de ${session.tenant.slug}`);
  } catch (error) {
    return problem("guardar o certificado", error);
  }
  revalidatePath(HERE);
  return OK;
}

export async function removeCertificateAction(previous: ActionState): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  void previous;
  try {
    if (await removeCertificate(conn)) console.info(`[fiscal] ${session.email} removeu o certificado de ${session.tenant.slug}`);
  } catch (error) {
    return problem("remover o certificado", error);
  }
  revalidatePath(HERE);
  return OK;
}

/** "Salvar dados fiscais" of one equipment: who has Produtos e custos. */
export async function saveProductFiscalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);
  const text = reader(formData);
  try {
    await saveProductFiscal(
      Number(text("id")),
      { ncm: text("ncm") || null, origin: text("origin") === "" ? null : Number(text("origin")), cest: text("cest") || null, unit: text("unit") || "UN" },
      session.email,
      conn,
    );
  } catch (error) {
    return problem("gravar os dados fiscais do equipamento", error);
  }
  revalidatePath(`/produtos/${text("id")}`);
  return OK;
}

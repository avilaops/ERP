"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { FiscalError, loadFiscalSettings, removeCertificate, saveCertificate, saveDanfeReformDate, saveFiscalSettings, saveProductFiscal } from "@/lib/db/fiscal";
import { completeKnownPaymentCodes, completeSaleOperation, saveFiscalRules, savePaymentCode } from "@/lib/db/fiscal-rules";
import { CnpjError, lookupCnpj } from "@/lib/cnpj";
import { completeFiscalCompany, saleOperationCodes } from "@/lib/fiscal/setup";
import { IssueError, voidInvoiceNumbers } from "@/lib/db/issue-nfe";
import { tenantDb } from "@/lib/db/pool";
import { listLines } from "@/lib/db/product-lines";
import { sendToSefaz } from "@/lib/fiscal/channel";
import { cityCode } from "@/lib/fiscal/cities";
import { parsePercent } from "@/lib/format";
import { exactLine } from "@/lib/lines-view";
import { CertificateError, vaultKey, WrongPasswordError } from "@/lib/fiscal/certificate";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/fiscal";
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";
const OK: ActionState = { error: null };

const reader = (formData: FormData) => (key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};
const whole = (text: string) => (/^\d{1,9}$/.test(text) ? Number(text) : 0);

/** Completes the issuer from public data without replacing a filled-in register. */
export async function completeFiscalCompanyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const text = reader(formData);
  let notice: string;
  try {
    const before = await loadFiscalSettings(conn);
    const company = await lookupCnpj(before.cnpj || text("lookupCnpj"));
    const current = await loadFiscalSettings(conn);
    const filled = completeFiscalCompany(current, company, text("applyRegime") === "sim");
    await saveFiscalSettings(filled, session.email, conn, true);
    const tax = company.fiscal;
    notice = `${tax?.source ?? "Consulta pública"}${tax?.updatedAt ? ` · ${tax.updatedAt.slice(0, 10).split("-").reverse().join("/")}` : ""}: aplicado.`;
  } catch (error) {
    if (error instanceof CnpjError || error instanceof Error && /CNPJ consultado|empresa ativa/.test(error.message)) return { error: error.message };
    return problem("consultar o CNPJ", error);
  }
  revalidatePath(HERE);
  revalidatePath("/pedidos", "layout");
  return { error: null, notice };
}

/** Map only unambiguous standard methods whose code is still blank. */
export async function completePaymentCodesAction(): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  let count: number;
  try {
    count = await completeKnownPaymentCodes(session.email, conn);
  } catch (error) {
    return problem("mapear os pagamentos", error);
  }
  revalidatePath(HERE);
  revalidatePath("/pedidos", "layout");
  return { error: null, notice: `Códigos conferidos: ${count} preenchido(s).` };
}

/** Select the sale operation once per line, preserving accountant-supplied codes. */
export async function prepareSaleOperationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const text = reader(formData);
  if (text("operation") !== "revenda" && text("operation") !== "producao") return { error: "Escolha revenda ou produção própria conforme a operação desta linha." };
  try {
    const line = exactLine(await listLines(conn), text("lineId"));
    if (!line) return { error: "Escolha uma linha de produto válida." };
    const suggested = saleOperationCodes(text("operation") as "revenda" | "producao");
    await completeSaleOperation(line.id, suggested, session.email, conn);
  } catch (error) {
    return problem("preparar a operação de venda", error);
  }
  revalidatePath(HERE);
  revalidatePath("/pedidos", "layout");
  return { error: null, notice: "CFOPs comuns de venda completados. Regras existentes preservadas. Confira CST, alíquotas, benefícios e operações especiais com a contabilidade na aba Regras da nota." };
}

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
        // Left blank, the code is found by the name of the city and the state (IBGE list).
        cityCode: text("cityCode") || cityCode(text("city"), text("uf").toUpperCase()),
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
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      await saveCertificate(bytes, password, key, session.email, new Date(), conn);
    } catch (error) {
      // A space the keyboard of a phone left before or after the password is not part of it.
      if (!(error instanceof WrongPasswordError) || password.trim() === password) throw error;
      await saveCertificate(bytes, password.trim(), key, session.email, new Date(), conn);
    }
    console.info(`[fiscal] ${session.email} enviou o certificado de ${session.tenant.slug}`);
  } catch (error) {
    const refused = problem("guardar o certificado", error);
    // Which refusal it was, for who gives support: the reason shown on the screen, never what was typed or sent.
    console.info(`[fiscal] certificado de ${session.tenant.slug} recusado para ${session.email}: ${refused.error}`);
    return refused;
  }
  revalidatePath(HERE);
  return { error: null, notice: "Certificado guardado. Confira acima de quem é e até quando vale." };
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

/** "Salvar regras fiscais" of one product line: what the accountant defines for the invoice. */
export async function saveFiscalRulesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const text = reader(formData);
  const percent = (key: string, label: string) => {
    const value = text(key) === "" ? 0 : parsePercent(text(key).replace(/\s*%$/, ""));
    if (value === null) throw new FiscalError(`${label}: informe um percentual (ex.: 0,65).`);
    return value;
  };
  try {
    const line = exactLine(await listLines(conn), formData.get("lineId"));
    if (!line) return { error: "A linha de produto desta tela não existe mais. Recarregue a página." };
    await saveFiscalRules(
      line.id,
      {
        operationNature: text("operationNature") || null,
        cfopInternal: text("cfopInternal") || null,
        cfopInterstate: text("cfopInterstate") || null,
        cfopInterstateNonTaxpayer: text("cfopInterstateNonTaxpayer") || null,
        icmsCode: text("icmsCode") || null,
        ipiCst: text("ipiCst") || null,
        ipiFrameCode: text("ipiFrameCode") || "999",
        pisCst: text("pisCst") || null,
        pisRate: percent("pisRate", "Alíquota do PIS"),
        cofinsCst: text("cofinsCst") || null,
        cofinsRate: percent("cofinsRate", "Alíquota da COFINS"),
        finalConsumer: text("finalConsumer") !== "",
        ipiInIcmsBase: text("ipiInIcmsBase") !== "",
        icmsOutOfContributions: text("icmsOutOfContributions") !== "",
        additionalInfo: text("additionalInfo") || null,
        ibsCbsCst: text("ibsCbsCst") || null,
        ibsCbsClass: text("ibsCbsClass") || null,
        ibsStateRate: percent("ibsStateRate", "Alíquota do IBS estadual"),
        ibsCityRate: percent("ibsCityRate", "Alíquota do IBS municipal"),
        cbsRate: percent("cbsRate", "Alíquota da CBS"),
      },
      session.email,
      conn,
    );
  } catch (error) {
    return problem("gravar as regras fiscais", error);
  }
  revalidatePath(HERE);
  return OK;
}

/** How one form of payment of the company is named in the invoice. */
export async function savePaymentCodeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const text = reader(formData);
  try {
    await savePaymentCode(whole(text("id")), text("code") || null, session.email, conn);
  } catch (error) {
    return problem("gravar a forma de pagamento da nota", error);
  }
  revalidatePath(HERE);
  return OK;
}

/** "Inutilizar numeração": tells SEFAZ a range of numbers was skipped and will never be an invoice. There is no way back. */
export async function voidNumbersAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const text = reader(formData);
  try {
    await voidInvoiceNumbers(
      { series: whole(text("series")), first: whole(text("first")), last: whole(text("last")), reason: text("reason") },
      session.email,
      new Date(),
      vaultKey(process.env.ERP_CERT_KEY),
      sendToSefaz,
      conn,
    );
  } catch (error) {
    if (error instanceof IssueError) return { error: error.message };
    return problem("inutilizar a numeração", error);
  }
  revalidatePath(HERE);
  return OK;
}

/** "Salvar data": from when the DANFE is printed in the layout of the tax reform. */
export async function saveDanfeReformDateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await saveDanfeReformDate(reader(formData)("reformFrom"), session.email, conn);
  } catch (error) {
    return problem("gravar a data do DANFE", error);
  }
  revalidatePath(HERE);
  return OK;
}

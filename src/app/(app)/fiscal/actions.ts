"use server";

import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { importReceivedNfe } from "@/lib/db/received-nfes";
import { confirmReceivedNfePurchase, getReceivedNfe, linkReceivedNfeProduct, linkReceivedNfeSupplier, ReceivedNfeOperationError } from "@/lib/db/received-nfes";
import { loadFiscalSettings } from "@/lib/db/fiscal";
import { tenantDb } from "@/lib/db/pool";
import { validateReceivedNfe, ReceivedNfeError } from "@/lib/fiscal/received-nfe";
import { FiscalXmlError } from "@/lib/fiscal/local-layout";
import { createSupplier, SupplierError } from "@/lib/db/suppliers";
import { runNfeDistribution } from "@/lib/db/run-nfe-distribution";
import { vaultKey } from "@/lib/fiscal/certificate";
import { sendToSefaz } from "@/lib/fiscal/channel";
import { queueRecipientManifestation } from "@/lib/db/recipient-manifestations";
import type { RecipientManifestKind } from "@/lib/fiscal/recipient-manifest";

export async function queryReceivedNfesAction(): Promise<void> {
  const session = await requirePermission("fiscal");
  let message: string;
  try {
    const result = await runNfeDistribution(new Date(), () => vaultKey(process.env.ERP_CERT_KEY), sendToSefaz, tenantDb(session.tenant.slug));
    message = result.queried ? `Consulta concluída: ${result.imported} NF-e nova(s) completa(s); ${result.failed} documento(s) para revisão.` : "A próxima consulta ainda não está liberada ou falta certificado fiscal válido.";
  } catch (error) {
    redirect(`/fiscal?ver=recebidas&erro=${encodeURIComponent(error instanceof Error ? error.message : "Não foi possível consultar a SEFAZ.")}`);
  }
  redirect(`/fiscal?ver=recebidas&aviso=${encodeURIComponent(message)}`);
}

export async function importReceivedNfeAction(formData: FormData): Promise<void> {
  const session = await requirePermission("fiscal");
  const file = formData.get("xml");
  if (!(file instanceof File) || file.size === 0) redirect("/fiscal?ver=recebidas&erro=Escolha+o+XML+completo+da+NF-e.");
  if (file.size > 2_097_152) redirect("/fiscal?ver=recebidas&erro=O+XML+ultrapassa+2+MiB.");
  let notice: string;
  try {
    const note = await validateReceivedNfe(await file.text());
    const conn = tenantDb(session.tenant.slug);
    const settings = await loadFiscalSettings(conn);
    const ownDocument = (settings.cnpj ?? "").replace(/[^0-9A-Z]/gi, "").toUpperCase();
    if (!ownDocument || note.recipientDocument !== ownDocument) throw new ReceivedNfeError("A NF-e não foi emitida para o CNPJ desta empresa.");
    const result = await importReceivedNfe(note, session.email, conn);
    notice = result.created ? "NF-e completa importada." : "Esta NF-e já estava importada.";
  } catch (error) {
    const message = error instanceof ReceivedNfeError || error instanceof FiscalXmlError || error instanceof Error && /Já existe NF-e/.test(error.message) ? error.message : "Não foi possível importar o XML. Nada foi alterado.";
    redirect(`/fiscal?ver=recebidas&erro=${encodeURIComponent(message)}`);
  }
  redirect(`/fiscal?ver=recebidas&aviso=${encodeURIComponent(notice)}`);
}

const positiveId = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : Number.NaN;
};
const detail = (id: number, message: string, kind: "erro" | "aviso" = "erro") => `/fiscal/recebidas/${id}?${kind}=${encodeURIComponent(message)}`;

export async function linkReceivedSupplierAction(formData: FormData): Promise<void> {
  const session = await requirePermission("fiscal");
  const [nfeId, supplierId] = [positiveId(formData, "nfeId"), positiveId(formData, "supplierId")];
  try {
    await linkReceivedNfeSupplier(nfeId, supplierId, session.email, tenantDb(session.tenant.slug));
  } catch (error) {
    redirect(detail(nfeId, error instanceof ReceivedNfeOperationError ? error.message : "Não foi possível vincular o fornecedor."));
  }
  redirect(detail(nfeId, "Fornecedor vinculado.", "aviso"));
}

export async function createReceivedSupplierAction(formData: FormData): Promise<void> {
  const session = await requirePermission("fiscal");
  const nfeId = positiveId(formData, "nfeId");
  const conn = tenantDb(session.tenant.slug);
  try {
    const note = await getReceivedNfe(nfeId, conn);
    if (!note) throw new ReceivedNfeOperationError("NF-e não encontrada.");
    const supplier = await createSupplier({ kind: "PJ", document: note.issuerDocument, name: note.issuerName, tradeName: null, contactName: null, phone: null, email: null, country: null, bank: {}, notes: `Cadastrado pela NF-e ${note.number}.`, active: true }, session.email, conn);
    await linkReceivedNfeSupplier(nfeId, supplier.id, session.email, conn);
  } catch (error) {
    redirect(detail(nfeId, error instanceof ReceivedNfeOperationError || error instanceof SupplierError ? error.message : "Não foi possível cadastrar o fornecedor."));
  }
  redirect(detail(nfeId, "Fornecedor cadastrado e vinculado.", "aviso"));
}

export async function linkReceivedProductAction(formData: FormData): Promise<void> {
  const session = await requirePermission("fiscal");
  const [nfeId, lineNumber, productId] = [positiveId(formData, "nfeId"), positiveId(formData, "lineNumber"), positiveId(formData, "productId")];
  try {
    await linkReceivedNfeProduct(nfeId, lineNumber, productId, session.email, tenantDb(session.tenant.slug));
  } catch (error) {
    redirect(`/fiscal/recebidas/${nfeId}/itens/${lineNumber}?erro=${encodeURIComponent(error instanceof ReceivedNfeOperationError ? error.message : "Não foi possível vincular o produto.")}`);
  }
  redirect(detail(nfeId, `Item ${lineNumber} vinculado ao produto.`, "aviso"));
}

export async function confirmReceivedPurchaseAction(formData: FormData): Promise<void> {
  const session = await requirePermission("fiscal");
  const nfeId = positiveId(formData, "nfeId");
  let purchaseId: number;
  try {
    purchaseId = (await confirmReceivedNfePurchase(nfeId, session.email, tenantDb(session.tenant.slug))).purchaseId;
  } catch (error) {
    redirect(detail(nfeId, error instanceof ReceivedNfeOperationError ? error.message : "Não foi possível criar a compra. Nada foi alterado."));
  }
  redirect(`/compras/${purchaseId}`);
}

export async function queueRecipientManifestationAction(formData: FormData): Promise<void> {
  const session = await requirePermission("fiscal");
  const nfeId = positiveId(formData, "nfeId");
  const sent = formData.get("kind");
  const kinds: RecipientManifestKind[] = ["ciencia", "confirmacao", "desconhecimento", "nao_realizada"];
  if (typeof sent !== "string" || !kinds.includes(sent as RecipientManifestKind) || formData.get("confirm") !== "yes") redirect(detail(nfeId, "Confirme conscientemente o evento que será enviado à SEFAZ."));
  try {
    await queueRecipientManifestation(nfeId, sent as RecipientManifestKind, typeof formData.get("reason") === "string" ? String(formData.get("reason")) : null, session.email, tenantDb(session.tenant.slug));
  } catch (error) {
    redirect(detail(nfeId, error instanceof Error ? error.message : "Não foi possível enfileirar a manifestação."));
  }
  redirect(detail(nfeId, "Manifestação enfileirada para envio à SEFAZ.", "aviso"));
}


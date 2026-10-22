import { createHash } from "node:crypto";
import { assertPadesBaselineAttributes } from "@/lib/contract/pades-policy";
import type { SigningKey } from "@/lib/fiscal/sign";
import type { SealInfo } from "@/lib/contract/seal";

/**
 * Contract with an independently certified PAdES signing service.
 * The signing service must hold its own authorized key material in a vault/HSM.
 * NEVER send privateKeyPem, PFX or password over this API.
 * The old node-forge CMS builder is not a conformant ICP-Brasil PAdES signer.
 */
export async function signPadesViaService(
  pdf: Uint8Array, key: SigningKey, info: SealInfo,
): Promise<Uint8Array> {
  const endpoint = process.env.ERP_PADES_SIGNER_URL;
  const token = process.env.ERP_PADES_SIGNER_TOKEN;
  if (!endpoint || !token) throw new Error("Serviço PAdES ICP-Brasil não configurado.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Serviço PAdES deve usar HTTPS sem credenciais na URL.");
  }
  const certificate = Buffer.from(key.certificateBase64, "base64");
  const fingerprint = createHash("sha256").update(certificate).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: "ICP-BRASIL-PADES-AD-RB",
        certificateSha256: fingerprint,
        pdfBase64: Buffer.from(pdf).toString("base64"),
        reason: info.reason,
        signedAt: info.at.toISOString(),
      }),
    });
    if (!response.ok) throw new Error(`Serviço PAdES recusou a assinatura (HTTP ${response.status}).`);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("signedPdfBase64" in payload)
        || typeof payload.signedPdfBase64 !== "string"
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.signedPdfBase64)) {
      throw new Error("Resposta inválida do serviço PAdES.");
    }
    const signed = Buffer.from(payload.signedPdfBase64, "base64");
    if (signed.length > 25_000_000 || signed.length < pdf.length) {
      throw new Error("Tamanho inválido do PDF assinado.");
    }
    assertPadesBaselineAttributes(signed);
    return new Uint8Array(signed);
  } finally {
    clearTimeout(timeout);
  }
}

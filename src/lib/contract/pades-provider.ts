import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import forge from "node-forge";
import { sealOf } from "@/lib/contract/seal";
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
    const signature = sealOf(signed);
    if (!signature) throw new Error("Serviço PAdES não retornou assinatura.");
    const message = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(signature.signature.toString("binary"))),
    );
    if (!("certificates" in message) || !Array.isArray(message.certificates)) {
      throw new Error("Serviço PAdES não retornou certificados CMS.");
    }
    const matches = message.certificates.some((cert) => {
      const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
      return createHash("sha256").update(Buffer.from(der, "binary")).digest("hex") === fingerprint;
    });
    if (!matches) throw new Error("Certificado do PDF não corresponde ao A1 selecionado.");
    // Verify the actual CMS signature over PDF ByteRange using an independent
    // implementation. -noverify disables ONLY trust-chain checking; that must
    // be performed separately by the ICP-Brasil validator.
    if (signature.range[0] !== 0 ||
        signature.range[2] + signature.range[3] !== signed.length ||
        signature.range[1] < 0 || signature.range[2] <= signature.range[1]) {
      throw new Error("ByteRange da assinatura PDF inválido.");
    }
    const dir = mkdtempSync(join(tmpdir(), "erp-pades-verify-"));
    try {
      const cmsFile = join(dir, "signature.der");
      const bytesFile = join(dir, "signed-bytes.bin");
      const outputFile = join(dir, "verified.bin");
      writeFileSync(cmsFile, signature.signature, { mode: 0o600 });
      writeFileSync(bytesFile, signature.signed, { mode: 0o600 });
      try {
        execFileSync("openssl", [
          "cms", "-verify", "-binary", "-inform", "DER", "-in", cmsFile,
          "-content", bytesFile, "-noverify", "-out", outputFile,
        ], { timeout: 10_000, stdio: "ignore" });
      } catch {
        throw new Error("Assinatura CMS inválida: verificação criptográfica independente falhou.");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    return new Uint8Array(signed);
  } finally {
    clearTimeout(timeout);
  }
}

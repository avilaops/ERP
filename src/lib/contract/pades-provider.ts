import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PADES_PROFILE } from "@/lib/contract/icp/lpa";
import { assertPadesBaselineAttributes } from "@/lib/contract/pades-policy";
import { sealOf } from "@/lib/contract/seal";
import type { SealInfo } from "@/lib/contract/seal";
import { tenantSchema } from "@/lib/db/config";

/**
 * Cliente do assinador PAdES. A chave privada não entra neste pedido:
 * o assinador já a tem, separada por empresa. A resposta volta a ser
 * conferida aqui (atributos da PA, ByteRange, OpenSSL). O OpenSSL com
 * `-noverify` confere a criptografia do CMS, não a confiança ICP-Brasil.
 */

export type PadesIdentity = {
  tenantId: string;
  /** SHA-256 do certificado A1 desta empresa. */
  fingerprint: string;
  validFrom: Date;
  validUntil: Date;
};

const timeoutMs = (env: Record<string, string | undefined>): number => {
  const raw = env.ERP_PADES_SIGNER_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 20_000;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 100 || value > 60_000) throw new Error("Prazo do assinador inválido.");
  return value;
};

const KNOWN = new Set([
  "certificado-vencido",
  "certificado-revogado",
  "certificado-de-outra-empresa",
  "revogacao-ilegivel",
  "pedido-invalido",
  "nao-autorizado",
  "falha-interna",
  "segredo-recusado",
  "pdf-grande",
  "pdf-invalido",
  "json-invalido",
]);

/** Conferência criptográfica independente do CMS, sobre os bytes do ByteRange. */
export function verifyCmsIndependently(signedBytes: Uint8Array, signature: Uint8Array): void {
  const dir = mkdtempSync(join(tmpdir(), "erp-pades-verify-"));
  try {
    const cmsFile = join(dir, "signature.der");
    const bytesFile = join(dir, "signed-bytes.bin");
    const outputFile = join(dir, "verified.bin");
    writeFileSync(cmsFile, signature, { mode: 0o600 });
    writeFileSync(bytesFile, signedBytes, { mode: 0o600 });
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
}

type SignerResponse = { status: number; body: string };

/** POST JSON sobre TLS. A CA privada, quando existe, é a única raiz aceita. */
function postJson(
  url: URL,
  env: Record<string, string | undefined>,
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
  timeout: number,
): Promise<SignerResponse> {
  let ca: string | Buffer | undefined = env.ERP_PADES_TLS_CA;
  if (env.ERP_PADES_TLS_CA_FILE) {
    try {
      ca = readFileSync(env.ERP_PADES_TLS_CA_FILE);
    } catch {
      return Promise.reject(new Error("CA TLS do assinador não pôde ser lida."));
    }
  }
  return new Promise((resolve, reject) => {
    const servername = env.ERP_PADES_TLS_SERVERNAME;
    const req = httpsRequest({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
      ...(ca ? { ca } : {}),
      ...(servername ? { servername } : {}),
      rejectUnauthorized: true,
      timeout,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    const fail = (error: Error) => reject(error);
    req.on("error", fail);
    req.on("timeout", () => {
      req.destroy(Object.assign(new Error("prazo"), { name: "TimeoutError" }));
    });
    signal.addEventListener("abort", () => req.destroy(Object.assign(new Error("abortado"), { name: "AbortError" })), { once: true });
    req.end(body);
  });
}

const networkFailure = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  if (["ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN", "EHOSTUNREACH", "ETIMEDOUT"].includes(code)) return true;
  return /ECONNREFUSED|ENOTFOUND|ECONNRESET|socket hang up/i.test(error.message);
};

/**
 * Pede o PDF assinado e só devolve o que passou na política e no OpenSSL.
 * `env` existe para o teste apontar um assinador sem mexer no processo inteiro.
 */
export async function signPadesViaService(
  pdf: Uint8Array,
  identity: PadesIdentity,
  info: SealInfo,
  env: Record<string, string | undefined> = process.env,
): Promise<Uint8Array> {
  if ("privateKeyPem" in identity || "certificateBase64" in identity) {
    throw new Error("A chave privada não sai deste servidor.");
  }
  const endpoint = env.ERP_PADES_SIGNER_URL;
  const token = env.ERP_PADES_SIGNER_TOKEN;
  if (!endpoint || !token) throw new Error("Serviço PAdES ICP-Brasil não configurado.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Serviço PAdES deve usar HTTPS sem credenciais na URL.");
  }
  tenantSchema(identity.tenantId);
  if (!/^[0-9a-f]{64}$/.test(identity.fingerprint)) throw new Error("Impressão do certificado inválida.");
  const at = info.at.getTime();
  if (!Number.isFinite(at) || at < identity.validFrom.getTime() || at > identity.validUntil.getTime()) {
    throw new Error("Certificado A1 fora do período de validade na data da assinatura.");
  }
  if (pdf.length === 0 || pdf.length > 20_000_000) throw new Error("PDF de entrada excede o limite do assinador.");

  const controller = new AbortController();
  const limit = timeoutMs(env);
  const timeout = setTimeout(() => controller.abort(), limit);
  try {
    const response = await postJson(url, env, {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }, JSON.stringify({
      profile: PADES_PROFILE,
      tenantId: identity.tenantId,
      certificateSha256: identity.fingerprint,
      pdfBase64: Buffer.from(pdf).toString("base64"),
      reason: info.reason,
      signedAt: info.at.toISOString(),
    }), controller.signal, limit);
    if (response.status < 200 || response.status >= 300) {
      let code = "";
      try {
        const payload: unknown = JSON.parse(response.body);
        if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" && KNOWN.has(payload.error)) {
          code = payload.error;
        }
      } catch {
        code = "";
      }
      throw new Error(`Serviço PAdES recusou a assinatura (HTTP ${response.status}${code ? ` ${code}` : ""}).`);
    }
    const payload: unknown = JSON.parse(response.body);
    if (!payload || typeof payload !== "object" || !("signedPdfBase64" in payload)
        || typeof payload.signedPdfBase64 !== "string"
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.signedPdfBase64)) {
      throw new Error("Resposta inválida do serviço PAdES.");
    }
    const signed = Buffer.from(payload.signedPdfBase64, "base64");
    if (signed.length > 25_000_000 || signed.length < pdf.length) throw new Error("Tamanho inválido do PDF assinado.");
    await assertPadesBaselineAttributes(signed, identity.fingerprint);
    const signature = sealOf(signed);
    if (!signature) throw new Error("Serviço PAdES não retornou assinatura.");
    if (signature.range[0] !== 0
        || signature.range[2] + signature.range[3] > signed.length
        || signature.range[1] < 1
        || signature.range[2] <= signature.range[1]) {
      throw new Error("ByteRange da assinatura PDF inválido.");
    }
    verifyCmsIndependently(signature.signed, signature.signature);
    return new Uint8Array(signed);
  } catch (error) {
    if (networkFailure(error)) {
      const aborted = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
      throw new Error(aborted ? "O serviço de assinatura não respondeu a tempo." : "Não foi possível falar com o serviço de assinatura.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

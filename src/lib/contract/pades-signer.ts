import { createHash, createPrivateKey, timingSafeEqual, X509Certificate } from "node:crypto";
import { createServer } from "node:https";
import type { Server } from "node:https";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as pkijs from "pkijs";
import { PADES_PROFILE } from "@/lib/contract/icp/lpa";
import { sealPdf } from "@/lib/contract/seal";
import type { SealInfo } from "@/lib/contract/seal";

/**
 * Assinador PAdES AD-RB. A chave privada fica só neste processo.
 * O ERP manda o PDF, o tenant e a impressão do certificado. Nunca o PFX.
 *
 * Cada empresa tem a própria chave. O par (tenant, impressão) é a busca:
 * a impressão de uma não abre a chave de outra.
 */

export type TenantKey = {
  tenantId: string;
  /** SHA-256 do DER do certificado do signatário, em hex minúsculo. */
  fingerprint: string;
  /** PEM PKCS#8. Não entra em log nem em resposta. */
  privateKeyPem: string;
  certificateDer: Uint8Array;
  chainDer: Uint8Array[];
  crl: Uint8Array;
  ocsp: Uint8Array;
  validFrom: Date;
  validUntil: Date;
};

const registry = new Map<string, TenantKey>();

const slotOf = (tenantId: string, fingerprint: string) => `${tenantId}:${fingerprint.toLowerCase()}`;

export function registerTenantKey(key: TenantKey): void {
  registry.set(slotOf(key.tenantId, key.fingerprint), key);
}

export function clearTenantKeys(): void {
  registry.clear();
}

const derBuffer = (value: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
};

const holderOf = (der: Uint8Array): string => {
  const subject = new X509Certificate(der).subject;
  return /(?:^|,\s*)CN=([^,/]+)/.exec(subject)?.[1]?.trim() ?? "";
};

/** A CRL ou o OCSP desta chave acusam o certificado do signatário. */
export async function keyIsRevoked(key: TenantKey): Promise<boolean> {
  const certificate = pkijs.Certificate.fromBER(derBuffer(key.certificateDer));
  const crl = pkijs.CertificateRevocationList.fromBER(derBuffer(key.crl));
  if (crl.isCertificateRevoked(certificate)) return true;
  const ocsp = pkijs.BasicOCSPResponse.fromBER(derBuffer(key.ocsp));
  const issuer = ocsp.certs?.[0];
  if (!issuer) return true;
  const status = await ocsp.getCertificateStatus(certificate, issuer);
  return status.status === 1;
}

const logResult = (tenantId: string, fingerprint: string, result: string) => {
  console.info("[pades] assinatura tenant=%s certificado=%s resultado=%s", tenantId, fingerprint, result);
};

/**
 * Lê `/chaves/<tenant>/` montado só para leitura.
 * Arquivos: cert.pem, chain.pem, key.pem, crl.der, ocsp.der.
 * Senha de chave cifrada só por argumento, vindo de variável de ambiente. Não é registrada.
 * Devolve quantos tenants entraram. Um diretório sem CRL ou OCSP fica de fora.
 */
export function loadKeysFromDirectory(dir: string, password?: string): number {
  let loaded = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z][a-z0-9_]{1,30}$/.test(entry.name)) continue;
    const base = join(dir, entry.name);
    try {
      const leaf = new X509Certificate(readFileSync(join(base, "cert.pem")));
      const chainPem = readFileSync(join(base, "chain.pem"), "utf8");
      const keyPem = readFileSync(join(base, "key.pem"));
      const crl = readFileSync(join(base, "crl.der"));
      const ocsp = readFileSync(join(base, "ocsp.der"));
      const encrypted = keyPem.includes("ENCRYPTED");
      const opened = createPrivateKey(encrypted && password ? { key: keyPem, passphrase: password } : keyPem);
      const privateKeyPem = opened.export({ type: "pkcs8", format: "pem" });
      if (typeof privateKeyPem !== "string") throw new Error("pem");
      const fingerprint = createHash("sha256").update(leaf.raw).digest("hex");
      const chainDer = chainPem.split("-----END CERTIFICATE-----").flatMap((part) => {
        const body = part.replace(/-----BEGIN CERTIFICATE-----/g, "").replace(/\s+/g, "");
        if (body === "") return [];
        const der = Buffer.from(body, "base64");
        const print = createHash("sha256").update(der).digest("hex");
        return print === fingerprint ? [] : [der];
      });
      registerTenantKey({
        tenantId: entry.name,
        fingerprint,
        privateKeyPem,
        certificateDer: new Uint8Array(leaf.raw),
        chainDer,
        crl,
        ocsp,
        validFrom: new Date(leaf.validFrom),
        validUntil: new Date(leaf.validTo),
      });
      loaded += 1;
    } catch {
      console.error("[pades] chave ilegível tenant=%s", entry.name);
    }
  }
  return loaded;
}

const certificatesOf = (key: TenantKey) => ({
  privateKeyPem: key.privateKeyPem,
  certificateBase64: Buffer.from(key.certificateDer).toString("base64"),
  certificateChainBase64: key.chainDer.map((der) => Buffer.from(der).toString("base64")),
});

/** Assina com a chave já resolvida. Quem chama já conferiu tenant, prazo e revogação. */
export async function signWithMaterial(pdf: Uint8Array, key: TenantKey, info: SealInfo): Promise<Uint8Array> {
  return sealPdf(pdf, certificatesOf(key), info, { crl: key.crl, ocsp: key.ocsp });
}

type SignRequest = {
  profile?: unknown;
  tenantId?: unknown;
  certificateSha256?: unknown;
  pdfBase64?: unknown;
  reason?: unknown;
  signedAt?: unknown;
  privateKeyPem?: unknown;
  password?: unknown;
  pfx?: unknown;
};

const bearerOk = (header: string | undefined, token: string): boolean => {
  if (!header?.startsWith("Bearer ")) return false;
  const got = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return got.length === expected.length && timingSafeEqual(got, expected);
};

const json = (res: import("node:http").ServerResponse, status: number, body: Record<string, string>) => {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": payload.length });
  res.end(payload);
};

export type SignerHandle = { url: string; port: number; close: () => Promise<void> };

/**
 * HTTPS. O token vai no cabeçalho, comparado em tempo constante.
 * `port` 0 pede uma porta livre (os testes). Em produção o script fixa a porta.
 */
export function startPadesSigner(options: { token: string; cert: string | Buffer; key: string | Buffer; port?: number; host?: string }): Promise<SignerHandle> {
  if (options.token.length < 16) throw new Error("Token do assinador curto demais.");
  const host = options.host ?? "127.0.0.1";
  const server: Server = createServer({ cert: options.cert, key: options.key }, (req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (req.method === "GET" && path === "/health") {
      json(res, 200, { status: "ok" });
      return;
    }
    if (req.method !== "POST" || path !== "/assinar") {
      json(res, 404, { error: "nao-encontrado" });
      return;
    }
    if (!bearerOk(req.headers.authorization, options.token)) {
      logResult("-", "-", "recusado-token");
      json(res, 401, { error: "nao-autorizado" });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.setTimeout(15_000, () => {
      res.destroy();
    });
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 28_000_000) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      void (async () => {
        let body: SignRequest;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as SignRequest;
        } catch {
          json(res, 400, { error: "json-invalido" });
          return;
        }
        const tenantId = typeof body.tenantId === "string" ? body.tenantId : "-";
        const fingerprint = typeof body.certificateSha256 === "string" ? body.certificateSha256.toLowerCase() : "-";
        if (body.privateKeyPem !== undefined || body.password !== undefined || body.pfx !== undefined) {
          logResult(tenantId, fingerprint, "recusado-segredo");
          json(res, 400, { error: "segredo-recusado" });
          return;
        }
        if (body.profile !== PADES_PROFILE || !/^[a-z][a-z0-9_]{1,30}$/.test(tenantId) || !/^[0-9a-f]{64}$/.test(fingerprint)) {
          logResult(tenantId, fingerprint, "recusado-pedido");
          json(res, 400, { error: "pedido-invalido" });
          return;
        }
        if (typeof body.pdfBase64 !== "string" || typeof body.signedAt !== "string") {
          logResult(tenantId, fingerprint, "recusado-pedido");
          json(res, 400, { error: "pedido-invalido" });
          return;
        }
        const material = registry.get(slotOf(tenantId, fingerprint));
        if (!material) {
          logResult(tenantId, fingerprint, "recusado-tenant");
          json(res, 403, { error: "certificado-de-outra-empresa" });
          return;
        }
        const at = Date.parse(body.signedAt);
        if (!Number.isFinite(at) || at < material.validFrom.getTime() || at > material.validUntil.getTime()) {
          logResult(tenantId, fingerprint, "recusado-validade");
          json(res, 422, { error: "certificado-vencido" });
          return;
        }
        let revoked = false;
        try {
          revoked = await keyIsRevoked(material);
        } catch {
          logResult(tenantId, fingerprint, "recusado-revogacao");
          json(res, 422, { error: "revogacao-ilegivel" });
          return;
        }
        if (revoked) {
          logResult(tenantId, fingerprint, "recusado-revogado");
          json(res, 422, { error: "certificado-revogado" });
          return;
        }
        let pdf: Buffer;
        try {
          pdf = Buffer.from(body.pdfBase64, "base64");
        } catch {
          json(res, 400, { error: "pdf-invalido" });
          return;
        }
        if (pdf.length === 0 || pdf.length > 20_000_000) {
          logResult(tenantId, fingerprint, "recusado-tamanho");
          json(res, 413, { error: "pdf-grande" });
          return;
        }
        try {
          const reason = typeof body.reason === "string" && body.reason.trim() !== "" ? body.reason.slice(0, 200) : "Contrato";
          const signed = await signWithMaterial(pdf, material, { name: holderOf(material.certificateDer), reason, at: new Date(at) });
          logResult(tenantId, fingerprint, "assinado");
          json(res, 200, { signedPdfBase64: Buffer.from(signed).toString("base64") });
        } catch {
          logResult(tenantId, fingerprint, "falha");
          json(res, 500, { error: "falha-interna" });
        }
      })().catch(() => {
        if (!res.headersSent) json(res, 500, { error: "falha-interna" });
      });
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      resolve({
        url: `https://${host}:${port}/assinar`,
        port,
        close: () => new Promise((done, fail) => server.close((error) => (error ? fail(error) : done()))),
      });
    });
  });
}

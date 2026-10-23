import { createHash, randomBytes } from "node:crypto";
import forge from "node-forge";
import { buildCertificateRevocationList, buildOcspResponse } from "@/lib/contract/pades-revocation";
import { registerTenantKey, startPadesSigner } from "@/lib/contract/pades-signer";
import type { SignerHandle } from "@/lib/contract/pades-signer";
import { readCertificate } from "@/lib/fiscal/certificate";
import { signingKeyOf } from "@/lib/fiscal/sign";
import type { SigningKey } from "@/lib/fiscal/sign";
import { serverIdentity } from "./fiscal-helpers.ts";

/**
 * AC de teste criada no próprio teste: raiz, intermediária e folha.
 * Não é ICP-Brasil e não usa certificado de cliente nenhum.
 */

export type TestChain = {
  pfx: Uint8Array;
  password: string;
  fingerprint: string;
  validFrom: Date;
  validUntil: Date;
  key: SigningKey;
  certificateDer: Buffer;
  chainDer: Buffer[];
  crl: Uint8Array;
  ocsp: Uint8Array;
  revokedCrl: Uint8Array;
  revokedOcsp: Uint8Array;
};

const derOf = (certificate: forge.pki.Certificate): Buffer =>
  Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(), "binary");

export async function buildTestChain(options?: { cn?: string; from?: Date; until?: Date }): Promise<TestChain> {
  const from = options?.from ?? new Date("2026-01-01T00:00:00Z");
  const until = options?.until ?? new Date("2027-12-31T00:00:00Z");
  const cn = options?.cn ?? "EMPRESA DE TESTE LTDA:11222333000181";
  const password = "senha-de-teste";
  const rootKeys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const interKeys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const leafKeys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const serial = () => randomBytes(8).toString("hex");
  const issue = (
    keys: forge.pki.rsa.KeyPair,
    subject: string,
    issuer: forge.pki.Certificate | null,
    issuerKey: forge.pki.rsa.PrivateKey,
    ca: boolean,
  ) => {
    const certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey;
    certificate.serialNumber = serial();
    certificate.validity.notBefore = from;
    certificate.validity.notAfter = until;
    const name = [{ name: "commonName", value: subject }];
    certificate.setSubject(name);
    certificate.setIssuer(issuer ? issuer.subject.attributes : name);
    certificate.setExtensions([{ name: "basicConstraints", cA: ca }]);
    certificate.sign(issuerKey, forge.md.sha256.create());
    return certificate;
  };
  const root = issue(rootKeys, "AC Teste Raiz", null, rootKeys.privateKey, true);
  const intermediate = issue(interKeys, "AC Teste Intermediaria", root, rootKeys.privateKey, true);
  const leaf = issue(leafKeys, cn, intermediate, interKeys.privateKey, false);
  const leafDer = derOf(leaf);
  const interDer = derOf(intermediate);
  const rootDer = derOf(root);
  const interPem = forge.pki.privateKeyToPem(interKeys.privateKey);
  const pfx = new Uint8Array(Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(leafKeys.privateKey, [leaf, intermediate, root], password, { algorithm: "3des" })).getBytes(), "binary"));
  const key = signingKeyOf(pfx, password);
  const info = readCertificate(pfx, password);
  const fingerprint = createHash("sha256").update(Buffer.from(key.certificateBase64, "base64")).digest("hex");
  if (info.fingerprint !== fingerprint) throw new Error("A impressão do PFX de teste não fechou com a chave.");
  const [crl, revokedCrl, ocsp, revokedOcsp] = await Promise.all([
    buildCertificateRevocationList(interDer, interPem, []),
    buildCertificateRevocationList(interDer, interPem, [leafDer]),
    buildOcspResponse(interDer, interPem, leafDer, false),
    buildOcspResponse(interDer, interPem, leafDer, true),
  ]);
  return {
    pfx, password, fingerprint, validFrom: from, validUntil: until, key,
    certificateDer: Buffer.from(key.certificateBase64, "base64"),
    chainDer: [interDer, rootDer],
    crl, ocsp, revokedCrl, revokedOcsp,
  };
}

export type RunningSigner = SignerHandle & { env: Record<string, string> };

/** Sobe o assinador com as chaves pedidas. A CA TLS também é de teste. */
export async function startTestSigner(entries: { tenantId: string; chain: TestChain; revoked?: boolean }[]): Promise<RunningSigner> {
  const tls = serverIdentity();
  for (const entry of entries) {
    registerTenantKey({
      tenantId: entry.tenantId,
      fingerprint: entry.chain.fingerprint,
      privateKeyPem: entry.chain.key.privateKeyPem,
      certificateDer: entry.chain.certificateDer,
      chainDer: entry.chain.chainDer,
      crl: entry.revoked ? entry.chain.revokedCrl : entry.chain.crl,
      ocsp: entry.revoked ? entry.chain.revokedOcsp : entry.chain.ocsp,
      validFrom: entry.chain.validFrom,
      validUntil: entry.chain.validUntil,
    });
  }
  const handle = await startPadesSigner({ token: "token-de-teste-pades-32", cert: tls.cert, key: tls.key, host: "127.0.0.1" });
  return {
    ...handle,
    env: {
      ERP_PADES_SIGNER_URL: handle.url,
      ERP_PADES_SIGNER_TOKEN: "token-de-teste-pades-32",
      ERP_PADES_TLS_CA: tls.cert,
      ERP_PADES_TLS_SERVERNAME: "localhost",
    },
  };
}

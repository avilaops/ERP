import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { createPrivateKey } from "node:crypto";
import { padesAdRbPolicy } from "@/lib/contract/icp/lpa";

/**
 * CRL e OCSP de uma AC de teste, ou da AC que o assinador consulta.
 * O perfil AD-RB não embute revogação no CMS (DOC-ICP-15.03, tabela A.15, ND).
 * Ela vai no DSS do PDF. A política aceita LCR ou OCSP; o assinador grava o que
 * a autoridade certificadora disponibiliza.
 */

const derBuffer = (value: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
};

const rsaKey = async (pem: string): Promise<CryptoKey> => {
  const jwk = createPrivateKey(pem).export({ format: "jwk" });
  return crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
};

const bytesOf = (value: ArrayBuffer): Uint8Array => new Uint8Array(value);

export async function buildCertificateRevocationList(issuerDer: Uint8Array, issuerKeyPem: string, revoked: Uint8Array[]): Promise<Uint8Array> {
  const issuer = pkijs.Certificate.fromBER(derBuffer(issuerDer));
  const revokedCertificates = revoked.map((der) => {
    const certificate = pkijs.Certificate.fromBER(derBuffer(der));
    return new pkijs.RevokedCertificate({
      userCertificate: certificate.serialNumber,
      revocationDate: new pkijs.Time({ type: 0, value: new Date() }),
    });
  });
  const crl = new pkijs.CertificateRevocationList({
    version: 1,
    issuer: issuer.subject,
    thisUpdate: new pkijs.Time({ type: 0, value: new Date() }),
    nextUpdate: new pkijs.Time({ type: 0, value: new Date(Date.now() + 7 * 86_400_000) }),
    revokedCertificates,
  });
  await crl.sign(await rsaKey(issuerKeyPem), "SHA-256");
  return bytesOf(crl.toSchema(true).toBER(false));
}

export async function buildOcspResponse(issuerDer: Uint8Array, issuerKeyPem: string, subjectDer: Uint8Array, revoked: boolean): Promise<Uint8Array> {
  const issuer = pkijs.Certificate.fromBER(derBuffer(issuerDer));
  const subject = pkijs.Certificate.fromBER(derBuffer(subjectDer));
  const certID = await pkijs.CertID.create(subject, { issuerCertificate: issuer, hashAlgorithm: "SHA-256" });
  const good = new asn1js.Primitive({ idBlock: { tagClass: 3, tagNumber: 0 }, lenBlock: { length: 1 } });
  const revokedStatus = new asn1js.Constructed({
    idBlock: { tagClass: 3, tagNumber: 1 },
    value: [new asn1js.GeneralizedTime({ valueDate: new Date() })],
  });
  const response = new pkijs.BasicOCSPResponse({
    tbsResponseData: new pkijs.ResponseData({
      responderID: issuer.subject,
      producedAt: new Date(),
      responses: [
        new pkijs.SingleResponse({
          certID,
          certStatus: revoked ? revokedStatus : good,
          thisUpdate: new Date(),
        }),
      ],
    }),
    certs: [issuer],
  });
  await response.sign(await rsaKey(issuerKeyPem), "SHA-256");
  return bytesOf(response.toSchema().toBER(false));
}

const streams = (pdf: Uint8Array): Uint8Array[] => {
  const bytes = Buffer.from(pdf);
  const found: Uint8Array[] = [];
  const start = Buffer.from("stream\n");
  const end = Buffer.from("\nendstream");
  let at = 0;
  while (at < bytes.length) {
    const from = bytes.indexOf(start, at);
    if (from < 0) break;
    const to = bytes.indexOf(end, from + start.length);
    if (to < 0) break;
    found.push(bytes.subarray(from + start.length, to));
    at = to + end.length;
  }
  return found;
};

/** "revogado" quando a CRL ou o OCSP do DSS acusam o certificado; "ausente" quando não há nenhum dos dois. */
export async function revocationProblem(pdf: Uint8Array, signerDer: Uint8Array): Promise<string | null> {
  const certificate = pkijs.Certificate.fromBER(derBuffer(signerDer));
  let saw = false;
  for (const stream of streams(pdf)) {
    try {
      const crl = pkijs.CertificateRevocationList.fromBER(derBuffer(stream));
      saw = true;
      if (crl.isCertificateRevoked(certificate)) return "Certificado revogado na CRL do DSS.";
    } catch {
      // Não é uma CRL.
    }
    try {
      const ocsp = pkijs.BasicOCSPResponse.fromBER(derBuffer(stream));
      const issuer = ocsp.certs?.[0];
      if (!issuer) continue;
      saw = true;
      const status = await ocsp.getCertificateStatus(certificate, issuer);
      if (status.status === 1) return "Certificado revogado no OCSP do DSS.";
    } catch {
      // Não é um OCSP.
    }
  }
  return saw ? null : "DSS sem CRL nem OCSP verificável.";
}

/** O algoritmo de hash da política, só para o assinador citar a mesma fonte. */
export const policyHashOid = () => padesAdRbPolicy().hashAlgorithmOid;

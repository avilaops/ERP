import { createHash } from "node:crypto";
import {
  OID_SIGNATURE_TIME_STAMP_TOKEN, OID_SIGNING_TIME, padesAdRbPolicy,
} from "@/lib/contract/icp/lpa";
import { chainComplete, parsePadesCms } from "@/lib/contract/pades-cms";
import { dssProblems } from "@/lib/contract/pades-dss";
import { revocationProblem } from "@/lib/contract/pades-revocation";
import { sealOf } from "@/lib/contract/seal";

/**
 * Structural preflight of a PAdES AD-RB. It is not a VALIDAR/ITI verdict and
 * it does not replace the ICP-Brasil trust anchor. It checks what the PA and
 * DOC-ICP-15.03 require us to be able to see before the contract is kept:
 * the mandated signed attributes, the policy OID and the internal hash, the
 * absence of signingTime, a complete chain, CRL or OCSP in the DSS, and an
 * intact ByteRange. OpenSSL checks the cryptographic signature separately.
 */
export async function padesAttributeProblems(pdf: Uint8Array, expectedFingerprint?: string): Promise<string[]> {
  const seal = sealOf(pdf);
  if (!seal) return ["O PDF não contém assinatura digital reconhecível."];
  const policy = padesAdRbPolicy();
  if (seal.range[0] !== 0 || seal.range[1] < 1 || seal.range[2] <= seal.range[1] || seal.range[2] + seal.range[3] > pdf.length) {
    return ["ByteRange da assinatura PDF inválido."];
  }
  const text = Buffer.from(pdf).toString("latin1");
  if (!text.includes(`/Filter /${policy.pdfDictionary.Filter}`)) {
    return [`Filtro PDF diferente do exigido pela PA (${policy.pdfDictionary.Filter}).`];
  }
  if (!text.includes(`/SubFilter /${policy.pdfDictionary.SubFilter}`)) {
    return [`SubFilter PDF diferente do exigido pela PA (${policy.pdfDictionary.SubFilter}).`];
  }
  let parsed;
  try {
    parsed = parsePadesCms(seal.signature);
  } catch {
    return ["Não foi possível interpretar os atributos CMS/PAdES."];
  }
  const present = new Set(parsed.attributeOids);
  const names: Record<string, string> = {
    [policy.mandatedAttributeOids[0]]: "id-contentType",
    [policy.mandatedAttributeOids[1]]: "id-messageDigest",
    [policy.mandatedAttributeOids[2]]: "id-aa-signingCertificateV2",
    [policy.mandatedAttributeOids[3]]: "id-aa-ets-sigPolicyId",
  };
  const problems = policy.mandatedAttributeOids
    .filter((oid) => !present.has(oid))
    .map((oid) => `Atributo PAdES obrigatório ausente: ${names[oid]}.`);
  if (present.has(OID_SIGNING_TIME)) problems.push("Atributo id-signingTime proibido no PAdES ICP-Brasil.");
  if (present.has(OID_SIGNATURE_TIME_STAMP_TOKEN)) {
    problems.push("Carimbo do tempo incompatível com a PA AD-RB vigente, que não usa carimbo.");
  }
  if (parsed.policyOid !== policy.oid) problems.push("sigPolicyId não é o OID da PA PAdES AD-RB vigente.");
  if (parsed.policyHashHex !== policy.internalSha256) problems.push("Hash da política não é o hash interno da PA.");
  const fingerprint = expectedFingerprint ?? (parsed.certificateDers[0]
    ? createHash("sha256").update(parsed.certificateDers[0]).digest("hex")
    : "");
  if (expectedFingerprint && !parsed.certificateDers.some((der) => createHash("sha256").update(der).digest("hex") === expectedFingerprint)) {
    problems.push("Certificado do PDF não corresponde ao A1 da empresa.");
  }
  if (fingerprint && !chainComplete(parsed.certificateDers, fingerprint)) {
    problems.push("Cadeia de certificados incompleta no CMS.");
  }
  problems.push(...dssProblems(pdf, seal.signature, seal.range[2] + seal.range[3]));
  if (fingerprint) {
    const signer = parsed.certificateDers.find((der) => createHash("sha256").update(der).digest("hex") === fingerprint);
    if (signer) {
      const revoked = await revocationProblem(pdf, signer);
      if (revoked) problems.push(revoked);
    }
  }
  return problems;
}

export async function assertPadesBaselineAttributes(pdf: Uint8Array, expectedFingerprint?: string): Promise<void> {
  const problems = await padesAttributeProblems(pdf, expectedFingerprint);
  if (problems.length) throw new Error(
    `PDF não conforme aos atributos obrigatórios PAdES/ICP-Brasil: ${problems.join(" ")}`,
  );
}

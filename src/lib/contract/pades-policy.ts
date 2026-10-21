import forge from "node-forge";
import { sealOf } from "@/lib/contract/seal";

/**
 * Check the signed CMS attributes required by the ICP-Brasil PAdES baseline.
 * This is a structural preflight, NOT a trust-chain/revocation or ITI verdict.
 * OIDs: DOC-ICP-15.01 / 15.02 / 15.03.
 */
export function padesAttributeProblems(pdf: Uint8Array): string[] {
  const seal = sealOf(pdf);
  if (!seal) return ["O PDF não contém assinatura digital reconhecível."];
  const children = (node: forge.asn1.Asn1): forge.asn1.Asn1[] =>
    Array.isArray(node.value) ? node.value : [];
  try {
    const cms = forge.asn1.fromDer(forge.util.createBuffer(seal.signature.toString("binary")));
    const signedData = children(children(cms)[1])[0];
    if (!signedData) return ["CMS sem SignedData."];
    const signerInfos = children(signedData).at(-1);
    const signerInfo = signerInfos && children(signerInfos)[0];
    if (!signerInfo) return ["CMS sem SignerInfo."];
    const attrs = children(signerInfo).find(
      (item) => item.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && item.type === 0,
    );
    if (!attrs) return ["CMS sem atributos assinados."];
    const present = new Set(children(attrs).flatMap((attr) => {
      const oid = children(attr)[0];
      return oid && typeof oid.value === "string" ? [forge.asn1.derToOid(oid.value)] : [];
    }));
    const required = [
      ["1.2.840.113549.1.9.3", "id-contentType"],
      ["1.2.840.113549.1.9.4", "id-messageDigest"],
      ["1.2.840.113549.1.9.16.2.47", "id-aa-signingCertificateV2"],
      ["1.2.840.113549.1.9.16.2.15", "id-aa-ets-sigPolicyId"],
    ] as const;
    const problems = required
      .filter(([oid]) => !present.has(oid))
      .map(([, name]) => `Atributo PAdES obrigatório ausente: ${name}.`);
    if (present.has("1.2.840.113549.1.9.5")) {
      problems.push("Atributo id-signingTime proibido no PAdES ICP-Brasil.");
    }
    return problems;
  } catch {
    return ["Não foi possível interpretar os atributos CMS/PAdES."];
  }
}

export function assertPadesBaselineAttributes(pdf: Uint8Array): void {
  const problems = padesAttributeProblems(pdf);
  if (problems.length) throw new Error(
    `PDF não conforme aos atributos obrigatórios PAdES/ICP-Brasil: ${problems.join(" ")}`,
  );
}

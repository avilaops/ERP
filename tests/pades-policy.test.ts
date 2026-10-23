import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { padesAdRbPolicy } from "@/lib/contract/icp/lpa";
import { buildDetachedPades } from "@/lib/contract/pades-cms";
import { padesAttributeProblems } from "@/lib/contract/pades-policy";
import { sealOf, sealPdf } from "@/lib/contract/seal";
import { verifyCmsIndependently } from "@/lib/contract/pades-provider";
import { buildTestChain } from "./pades-ca.ts";
import type { TestChain } from "./pades-ca.ts";

let chain: TestChain;

before(async () => {
  chain = await buildTestChain();
});

const icpDir = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/contract/icp");

test("OIDs e hashes da PA AD-RB saem dos DER oficiais, não de constante digitada", () => {
  const pa = readFileSync(join(icpDir, "PA_PAdES_AD_RB_v1_3.der"));
  const lpa = readFileSync(join(icpDir, "LPA_PAdES.der"));
  const paSidecar = readFileSync(join(icpDir, "PA_PAdES_AD_RB_v1_3der-sha256.txt"), "utf8").slice(0, 64);
  const lpaSidecar = readFileSync(join(icpDir, "LPA_PAdES_der-sha256.txt"), "utf8").slice(0, 64);
  assert.equal(createHash("sha256").update(pa).digest("hex"), paSidecar);
  assert.equal(createHash("sha256").update(lpa).digest("hex"), lpaSidecar);
  const policy = padesAdRbPolicy();
  // Valores lidos do DER em 2026-10-22. Fontes:
  // http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3.der
  // http://politicas.icpbrasil.gov.br/LPA_PAdES.der
  // O hash do atributo é o OCTET STRING final da PA (DOC-ICP-15.03, nota 2), não o hash do arquivo.
  assert.equal(policy.oid, "2.16.76.1.7.1.11.1.3");
  assert.equal(policy.lpaSha256, paSidecar);
  assert.equal(policy.internalSha256, "23e4be4b9b362172e4ebb0e72b86a133ece5aad843d8651c6e38a0ba3f08fc60");
  assert.equal(policy.hashAlgorithmOid, "2.16.840.1.101.3.4.2.1");
  assert.deepEqual(policy.pdfDictionary, { Type: "Sig", Filter: "PBAD_PAdES", SubFilter: "PBAD.PAdES" });
  assert.deepEqual(policy.mandatedAttributeOids, [
    "1.2.840.113549.1.9.3",
    "1.2.840.113549.1.9.4",
    "1.2.840.113549.1.9.16.2.47",
    "1.2.840.113549.1.9.16.2.15",
  ]);
});

const sample = async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Contrato de homologacao");
  return pdf.save();
};

test("assinatura AD-RB de teste não tem problemas de atributo, cadeia, DSS nem ByteRange", async () => {
  const signed = await sealPdf(await sample(), chain.key, {
    name: "Empresa de teste", reason: "Teste PAdES", at: new Date("2026-10-21T12:00:00Z"),
  }, { crl: chain.crl, ocsp: chain.ocsp });
  assert.deepEqual(await padesAttributeProblems(signed, chain.fingerprint), []);
  const seal = sealOf(signed)!;
  assert.ok(seal.range[2] + seal.range[3] < signed.length);
  verifyCmsIndependently(seal.signed, seal.signature);
  const text = Buffer.from(signed).toString("latin1");
  assert.equal(text.includes("/Filter /PBAD_PAdES"), true);
  assert.equal(text.includes("/SubFilter /PBAD.PAdES"), true);
});

test("assinatura AD-RB aceita somente a CRL quando a autoridade não oferece OCSP", async () => {
  const signed = await sealPdf(await sample(), chain.key, {
    name: "Empresa de teste", reason: "Teste PAdES", at: new Date("2026-10-21T12:00:00Z"),
  }, { crl: chain.crl });
  assert.deepEqual(await padesAttributeProblems(signed, chain.fingerprint), []);
});

test("atributos incompatíveis com a PA AD-RB continuam reprovados", async () => {
  const at = new Date("2026-10-21T12:00:00Z");
  const info = { name: "Empresa de teste", reason: "Teste PAdES", at };
  const material = {
    privateKeyPem: chain.key.privateKeyPem,
    certificateDer: chain.certificateDer,
    chainDer: chain.chainDer,
  };
  const withCms = (flag: { includeSigningTime?: boolean; includeTimeStampToken?: boolean; policyHashHex?: string; omitSigningCertificate?: boolean }) =>
    sample().then((pdf) => sealPdf(pdf, chain.key, info, {
      crl: chain.crl,
      ocsp: chain.ocsp,
      cms: (content) => buildDetachedPades(content, { ...material, ...flag }),
    }));
  assert.match((await padesAttributeProblems(await withCms({ includeSigningTime: true }))).join(" "), /signingTime/);
  assert.match((await padesAttributeProblems(await withCms({ omitSigningCertificate: true }))).join(" "), /signingCertificateV2/);
  assert.match((await padesAttributeProblems(await withCms({ policyHashHex: "ab".repeat(32) }))).join(" "), /Hash da política/);
  assert.match((await padesAttributeProblems(await withCms({ includeTimeStampToken: true }))).join(" "), /Carimbo do tempo/);
});

test("certificado revogado na CRL do DSS é recusado", async () => {
  const signed = await sealPdf(await sample(), chain.key, {
    name: "Empresa de teste", reason: "Teste PAdES", at: new Date("2026-10-21T12:00:00Z"),
  }, { crl: chain.revokedCrl, ocsp: chain.ocsp });
  assert.match((await padesAttributeProblems(signed, chain.fingerprint)).join(" "), /revogad/);
});

test("impressão de outro certificado não é aceita como a da empresa", async () => {
  const signed = await sealPdf(await sample(), chain.key, {
    name: "Empresa de teste", reason: "Teste PAdES", at: new Date("2026-10-21T12:00:00Z"),
  }, { crl: chain.crl, ocsp: chain.ocsp });
  assert.match((await padesAttributeProblems(signed, "ab".repeat(32))).join(" "), /não corresponde/);
});

test("PDF sem assinatura é recusado", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  assert.match((await padesAttributeProblems(await pdf.save())).join(" "), /não contém assinatura/);
});

test("byte adulterado dentro do ByteRange quebra a verificação independente", async () => {
  const signed = await sealPdf(await sample(), chain.key, {
    name: "Empresa de teste", reason: "Teste PAdES", at: new Date("2026-10-21T12:00:00Z"),
  }, { crl: chain.crl, ocsp: chain.ocsp });
  const seal = sealOf(signed)!;
  const changed = Buffer.from(seal.signed);
  changed[20] ^= 1;
  assert.throws(() => verifyCmsIndependently(changed, seal.signature), /verificação criptográfica independente falhou/);
});

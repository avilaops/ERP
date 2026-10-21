import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { sealPdf } from "@/lib/contract/seal";
import { padesAttributeProblems } from "@/lib/contract/pades-policy";
import { testPfx } from "./fiscal-helpers";
import { signingKeyOf } from "@/lib/fiscal/sign";

test("ICP-Brasil PAdES preflight identifies forbidden and missing CMS attributes", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Contrato de homologacao");
  const key = signingKeyOf(testPfx({ bits: 2048 }), "senha-de-teste");
  const signed = await sealPdf(await pdf.save(), key, {
    name: "Empresa de teste", reason: "Teste PAdES", at: new Date("2026-10-21T12:00:00Z"),
  });
  const problems = padesAttributeProblems(signed).join(" ");
  assert.match(problems, /signingCertificateV2/);
  assert.match(problems, /sigPolicyId/);
  assert.match(problems, /signingTime/);
});

test("ICP-Brasil PAdES preflight rejects unsigned PDF", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  assert.match(padesAttributeProblems(await pdf.save()).join(" "), /não contém assinatura/);
});

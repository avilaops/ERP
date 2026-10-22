import assert from "node:assert/strict";
import { test } from "node:test";
import { signPadesViaService } from "@/lib/contract/pades-provider";
import type { SigningKey } from "@/lib/fiscal/sign";

const key: SigningKey = { privateKeyPem: "TEST-DO-NOT-TRANSMIT", certificateBase64: Buffer.from("cert").toString("base64") };
const info = { name: "Teste", reason: "Contrato", at: new Date("2026-10-22T12:00:00Z") };
test("PAdES fails closed without configured signing provider", async () => {
  const oldUrl = process.env.ERP_PADES_SIGNER_URL;
  const oldToken = process.env.ERP_PADES_SIGNER_TOKEN;
  delete process.env.ERP_PADES_SIGNER_URL;
  delete process.env.ERP_PADES_SIGNER_TOKEN;
  try {
    await assert.rejects(signPadesViaService(new Uint8Array([1, 2]), key, info), /não configurado/);
  } finally {
    if (oldUrl === undefined) delete process.env.ERP_PADES_SIGNER_URL;
    else process.env.ERP_PADES_SIGNER_URL = oldUrl;
    if (oldToken === undefined) delete process.env.ERP_PADES_SIGNER_TOKEN;
    else process.env.ERP_PADES_SIGNER_TOKEN = oldToken;
  }
});

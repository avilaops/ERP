import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:https";
import { after, before, test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildDetachedPades } from "@/lib/contract/pades-cms";
import { signPadesViaService } from "@/lib/contract/pades-provider";
import type { PadesIdentity } from "@/lib/contract/pades-provider";
import { sealOf, sealPdf } from "@/lib/contract/seal";
import { buildTestChain, startTestSigner } from "./pades-ca.ts";
import type { RunningSigner, TestChain } from "./pades-ca.ts";
import { serverIdentity } from "./fiscal-helpers.ts";

const info = { name: "Teste", reason: "Contrato", at: new Date("2026-10-22T12:00:00Z") };

const identityOf = (chain: TestChain, tenantId: string): PadesIdentity => ({
  tenantId, fingerprint: chain.fingerprint, validFrom: chain.validFrom, validUntil: chain.validUntil,
});

let chain: TestChain;
let revoked: TestChain;
let signer: RunningSigner;

before(async () => {
  chain = await buildTestChain();
  revoked = await buildTestChain({ cn: "OUTRA EMPRESA TESTE LTDA:99888777000155" });
  signer = await startTestSigner([
    { tenantId: "casa", chain },
    { tenantId: "revogada", chain: revoked, revoked: true },
  ]);
});

after(async () => {
  await signer?.close();
});

test("PAdES fails closed without configured signing provider", async () => {
  await assert.rejects(
    signPadesViaService(new Uint8Array([1, 2]), { tenantId: "casa", fingerprint: "ab".repeat(32), validFrom: info.at, validUntil: info.at }, info, {}),
    /não configurado/,
  );
});

test("PAdES refuses non-HTTPS signer without transmitting PDF or private key", async () => {
  await assert.rejects(
    signPadesViaService(new Uint8Array([1, 2]), { tenantId: "casa", fingerprint: "ab".repeat(32), validFrom: info.at, validUntil: info.at }, info, {
      ERP_PADES_SIGNER_URL: "http://example.invalid/assinar",
      ERP_PADES_SIGNER_TOKEN: "token-de-teste-pades-32",
    }),
    /HTTPS/,
  );
});

test("certificado vencido nem chega a abrir conexão", async () => {
  const calls = { n: 0 };
  const tls = serverIdentity();
  const server = createServer({ cert: tls.cert, key: tls.key }, (_req, res) => {
    calls.n += 1;
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  try {
    await assert.rejects(signPadesViaService(new Uint8Array([1, 2]), {
      tenantId: "casa",
      fingerprint: "ab".repeat(32),
      validFrom: new Date("2020-01-01T00:00:00Z"),
      validUntil: new Date("2020-02-01T00:00:00Z"),
    }, info, {
      ERP_PADES_SIGNER_URL: `https://127.0.0.1:${port}/assinar`,
      ERP_PADES_SIGNER_TOKEN: "token-de-teste-pades-32",
      ERP_PADES_TLS_CA: tls.cert,
      ERP_PADES_TLS_SERVERNAME: "localhost",
    }), /fora do período de validade/);
    assert.equal(calls.n, 0);
  } finally {
    server.close();
  }
});

test("serviço fora do ar e prazo estourado têm mensagem de rede, sem vazar segredo", async () => {
  const identity = identityOf(chain, "casa");
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Contrato");
  const bytes = await pdf.save();
  await assert.rejects(signPadesViaService(bytes, identity, info, {
    ERP_PADES_SIGNER_URL: "https://127.0.0.1:9/assinar",
    ERP_PADES_SIGNER_TOKEN: "token-de-teste-pades-32",
    ERP_PADES_TLS_CA: serverIdentity().cert,
    ERP_PADES_TLS_SERVERNAME: "localhost",
  }), /Não foi possível falar com o serviço de assinatura/);

  const tls = serverIdentity();
  const hanging = createServer({ cert: tls.cert, key: tls.key }, () => {});
  hanging.listen(0, "127.0.0.1");
  await once(hanging, "listening");
  const port = (hanging.address() as { port: number }).port;
  try {
    await assert.rejects(signPadesViaService(bytes, identity, info, {
      ERP_PADES_SIGNER_URL: `https://127.0.0.1:${port}/assinar`,
      ERP_PADES_SIGNER_TOKEN: "token-de-teste-pades-32",
      ERP_PADES_TLS_CA: tls.cert,
      ERP_PADES_TLS_SERVERNAME: "localhost",
      ERP_PADES_SIGNER_TIMEOUT_MS: "200",
    }), /não respondeu a tempo/);
  } finally {
    hanging.close();
  }
});

test("assinatura válida, isolamento de tenant, revogação e corpo sem chave privada", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Contrato de teste");
  const bytes = await pdf.save();
  const identity = identityOf(chain, "casa");
  const signed = await signPadesViaService(bytes, identity, info, signer.env);
  const seal = sealOf(signed)!;
  assert.equal(seal.range[2] + seal.range[3], signed.length);
  assert.equal(Buffer.from(signed).toString("latin1").includes("/Type /DSS"), false);
  assert.equal(Buffer.from(signed).includes("PRIVATE"), false);

  await assert.rejects(
    signPadesViaService(bytes, { ...identity, tenantId: "outra" }, info, signer.env),
    /certificado-de-outra-empresa/,
  );
  await assert.rejects(
    signPadesViaService(bytes, identityOf(revoked, "revogada"), info, signer.env),
    /certificado-revogado/,
  );

  const seen: string[] = [];
  const tls = serverIdentity();
  const spy = createServer({ cert: tls.cert, key: tls.key }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk as Buffer));
    req.on("end", () => {
      seen.push(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "falha-interna" }));
    });
  });
  spy.listen(0, "127.0.0.1");
  await once(spy, "listening");
  const port = (spy.address() as { port: number }).port;
  try {
    await assert.rejects(signPadesViaService(bytes, identity, info, {
      ...signer.env,
      ERP_PADES_SIGNER_URL: `https://127.0.0.1:${port}/assinar`,
      ERP_PADES_TLS_CA: tls.cert,
    }), /HTTP 500/);
  } finally {
    spy.close();
  }
  assert.equal(seen.length, 1);
  assert.equal(seen[0].includes("privateKey"), false);
  assert.equal(seen[0].includes(chain.key.privateKeyPem), false);
  assert.equal(seen[0].includes("\"tenantId\":\"casa\""), true);
});

test("PDF adulterado e atributo incompatível não passam da verificação do cliente", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("Contrato de teste");
  const bytes = await pdf.save();
  const at = info.at;
  const sealed = await sealPdf(bytes, chain.key, { name: "Empresa de teste", reason: "Contrato", at }, { crl: chain.crl, ocsp: chain.ocsp });
  const tampered = Buffer.from(sealed);
  tampered[20] ^= 1;
  const incompatible = await sealPdf(bytes, chain.key, { name: "Empresa de teste", reason: "Contrato", at }, {
    crl: chain.crl,
    ocsp: chain.ocsp,
    cms: (content) => buildDetachedPades(content, {
      privateKeyPem: chain.key.privateKeyPem,
      certificateDer: chain.certificateDer,
      chainDer: chain.chainDer,
      includeSigningTime: true,
    }),
  });
  const tls = serverIdentity();
  const serve = (body: Uint8Array) => new Promise<{ url: string; close: () => void }>((resolve) => {
    const server = createServer({ cert: tls.cert, key: tls.key }, (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", () => {
        void chunks;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ signedPdfBase64: Buffer.from(body).toString("base64") }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ url: `https://127.0.0.1:${port}/assinar`, close: () => server.close() });
    });
  });
  const envBase = {
    ERP_PADES_SIGNER_TOKEN: "token-de-teste-pades-32",
    ERP_PADES_TLS_CA: tls.cert,
    ERP_PADES_TLS_SERVERNAME: "localhost",
  };
  const bad = await serve(tampered);
  const odd = await serve(incompatible);
  try {
    await assert.rejects(signPadesViaService(bytes, identityOf(chain, "casa"), info, { ...envBase, ERP_PADES_SIGNER_URL: bad.url }), /verificação criptográfica independente falhou|não conforme/);
    await assert.rejects(signPadesViaService(bytes, identityOf(chain, "casa"), info, { ...envBase, ERP_PADES_SIGNER_URL: odd.url }), /signingTime/);
  } finally {
    bad.close();
    odd.close();
  }
});

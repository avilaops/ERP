import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { CertificateError, openCertificate, readCertificate, sealCertificate, vaultKey, WrongPasswordError } from "@/lib/fiscal/certificate";
import { testPfx } from "./fiscal-helpers.ts";

const PFX = testPfx();

test("certificado: lê de quem é, o CNPJ e a validade, só com a senha certa", () => {
  const info = readCertificate(PFX, "senha-de-teste");
  assert.equal(info.subject, "ACADEMIA TESTE LTDA:48240052000161");
  assert.equal(info.holderCnpj, "48240052000161");
  assert.deepEqual([info.validFrom.toISOString(), info.validUntil.toISOString()], ["2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"]);
  assert.match(info.fingerprint, /^[0-9a-f]{64}$/);
  // O mesmo arquivo dá sempre o mesmo resumo.
  assert.equal(readCertificate(PFX, "senha-de-teste").fingerprint, info.fingerprint);

  // Senha errada é dita como senha errada, e não como arquivo ruim: é o erro mais comum ao enviar pelo celular.
  assert.throws(() => readCertificate(PFX, "senha errada"), (error: unknown) => error instanceof WrongPasswordError && error instanceof CertificateError && /A senha não confere/.test(error.message));
  assert.throws(() => readCertificate(PFX, "senha-de-test"), WrongPasswordError);
  assert.throws(() => readCertificate(PFX, "senha-de-teste "), WrongPasswordError);
  assert.throws(() => readCertificate(new Uint8Array(), "x"), /Escolha o arquivo/);
  assert.throws(() => readCertificate(new TextEncoder().encode("isto não é um certificado"), "x"), (error: unknown) => error instanceof CertificateError && !(error instanceof WrongPasswordError) && /Não foi possível ler o arquivo como certificado/.test(error.message));
  assert.throws(() => readCertificate(new Uint8Array(40_000), "x"), /grande demais/);
  // Sem a chave privada não assina nada.
  assert.throws(() => readCertificate(testPfx({ withKey: false }), "senha-de-teste"), /não traz a chave privada/);
  // Nome sem CNPJ: o certificado abre, só não diz de qual empresa é.
  assert.equal(readCertificate(testPfx({ name: "Fulano de Tal" }), "senha-de-teste").holderCnpj, null);
});

test("cofre: o que é selado só abre com a mesma chave, e nada do certificado aparece no que é guardado", () => {
  const key = randomBytes(32);
  const sealed = sealCertificate(PFX, "senha-de-teste", key);
  assert.deepEqual([sealed.iv.length, sealed.authTag.length], [12, 16]);
  // Nem a senha nem os bytes do arquivo estão em claro.
  assert.ok(!sealed.ciphertext.includes(Buffer.from("senha-de-teste")));
  assert.ok(!sealed.ciphertext.includes(Buffer.from(PFX).subarray(0, 24)));

  const opened = openCertificate(sealed, key);
  assert.equal(opened.password, "senha-de-teste");
  assert.deepEqual(new Uint8Array(opened.pfx), PFX);
  assert.equal(readCertificate(opened.pfx, opened.password).holderCnpj, "48240052000161");

  // Cada selagem tem o seu IV: o mesmo certificado nunca gera o mesmo conteúdo.
  assert.notDeepEqual(sealCertificate(PFX, "senha-de-teste", key).ciphertext, sealed.ciphertext);
  // Chave errada ou um byte trocado: não abre, e não devolve nada pela metade.
  assert.throws(() => openCertificate(sealed, randomBytes(32)), /chave do cofre não é a que o selou/);
  const tampered = { ...sealed, ciphertext: Buffer.from(sealed.ciphertext) };
  tampered.ciphertext[5] ^= 1;
  assert.throws(() => openCertificate(tampered, key), /conteúdo foi alterado/);
});

test("chave do cofre: 32 bytes em base64, ou erro", () => {
  assert.equal(vaultKey(randomBytes(32).toString("base64")).length, 32);
  for (const text of [undefined, "", "curta", randomBytes(16).toString("base64"), randomBytes(64).toString("base64")]) {
    assert.throws(() => vaultKey(text), /ERP_CERT_KEY ausente ou inválida/, String(text));
  }
});

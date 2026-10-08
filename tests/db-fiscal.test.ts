import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { loadCertificateInfo, loadFiscalSettings, loadProductFiscal, missingFiscalData, removeCertificate, saveCertificate, saveFiscalSettings, saveProductFiscal } from "@/lib/db/fiscal";
import type { FiscalSettings } from "@/lib/db/fiscal";
import { createProduct } from "@/lib/db/products";
import { openCertificate } from "@/lib/fiscal/certificate";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";
import { testPfx } from "./fiscal-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const BOSS = "diretoria@teste.local";
const NOW = new Date("2026-10-07T12:00:00Z");
const KEY = randomBytes(32);
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("fiscal");
});
after(async () => {
  if (!skip) await db.close();
});

const FILLED: FiscalSettings = {
  legalName: " Academia Teste Ltda ", cnpj: "48.240.052/0001-61", stateRegistration: "123.456.789.110", taxRegime: 3,
  street: "Rua das Flores", streetNumber: "100", district: "Centro", city: "São José do Rio Preto", cityCode: "3549805", uf: "sp", cep: "15010-000",
  series: 1, nextNumber: 1, environment: "homologacao",
};

test("dados fiscais: começam em branco, em homologação; gravam só dígitos e recusam o que está errado", { skip }, async () => {
  const blank = await loadFiscalSettings(db.pool);
  assert.deepEqual([blank.cnpj, blank.taxRegime, blank.series, blank.nextNumber, blank.environment], [null, null, 1, 1, "homologacao"]);
  assert.equal(missingFiscalData(blank).length, 11);

  await saveFiscalSettings(FILLED, BOSS, db.pool);
  const saved = await loadFiscalSettings(db.pool);
  assert.deepEqual(
    [saved.legalName, saved.cnpj, saved.stateRegistration, saved.taxRegime, saved.cityCode, saved.uf, saved.cep],
    ["Academia Teste Ltda", "48240052000161", "123456789110", 3, "3549805", "SP", "15010000"],
  );
  assert.deepEqual(missingFiscalData(saved), []);

  const refuse = (change: Partial<FiscalSettings>, message: RegExp) => assert.rejects(() => saveFiscalSettings({ ...FILLED, ...change }, BOSS, db.pool), message);
  await refuse({ cnpj: "11.111.111/1111-11" }, /CNPJ inválido/);
  await refuse({ cityCode: "12345" }, /7 dígitos/);
  await refuse({ uf: "XX" }, /UF/);
  await refuse({ cep: "123" }, /8 dígitos/);
  await refuse({ series: 0 }, /Série/);
  await refuse({ nextNumber: 0 }, /Próximo número/);
  await refuse({ taxRegime: 9 as never }, /regime tributário/);
  await refuse({ environment: "teste" as never }, /ambiente/);
  assert.equal((await loadFiscalSettings(db.pool)).cnpj, "48240052000161");
});

test("certificado: guardado selado, mostrado sem o arquivo, e só o da própria empresa e em vigor", { skip }, async () => {
  assert.equal(await loadCertificateInfo(db.pool), null);
  const pfx = testPfx();
  const info = await saveCertificate(pfx, "senha-de-teste", KEY, BOSS, NOW, db.pool);
  assert.equal(info.holderCnpj, "48240052000161");

  const shown = await loadCertificateInfo(db.pool);
  assert.ok(shown);
  assert.deepEqual([shown.subject, shown.holderCnpj, shown.uploadedBy, shown.fingerprint], [info.subject, "48240052000161", BOSS, info.fingerprint]);
  // O que a tela recebe não tem o arquivo nem a senha.
  assert.doesNotMatch(JSON.stringify(shown), /senha-de-teste|ciphertext|pfx/);

  // No banco não há senha nem arquivo em claro; com a chave do cofre, abre igual ao que entrou.
  const { rows } = await db.pool.query("SELECT ciphertext, iv, auth_tag FROM fiscal_certificates");
  assert.equal(rows.length, 1);
  assert.ok(!(rows[0].ciphertext as Buffer).includes(Buffer.from("senha-de-teste")));
  const opened = openCertificate({ ciphertext: rows[0].ciphertext, iv: rows[0].iv, authTag: rows[0].auth_tag }, KEY);
  assert.deepEqual([opened.password, Buffer.compare(opened.pfx, Buffer.from(pfx))], ["senha-de-teste", 0]);

  await assert.rejects(() => saveCertificate(pfx, "errada", KEY, BOSS, NOW, db.pool), /Não foi possível abrir/);
  await assert.rejects(() => saveCertificate(testPfx({ until: new Date("2026-06-01T00:00:00Z") }), "senha-de-teste", KEY, BOSS, NOW, db.pool), /já venceu/);
  await assert.rejects(() => saveCertificate(testPfx({ from: new Date("2026-12-01T00:00:00Z") }), "senha-de-teste", KEY, BOSS, NOW, db.pool), /ainda não começou/);
  await assert.rejects(() => saveCertificate(testPfx({ name: "OUTRA EMPRESA:11222333000181" }), "senha-de-teste", KEY, BOSS, NOW, db.pool), /não é o da empresa/);
  // Nenhuma recusa mexeu no que estava guardado.
  assert.equal((await loadCertificateInfo(db.pool))?.fingerprint, info.fingerprint);

  // Enviar outro substitui: é um certificado por empresa.
  const renewed = await saveCertificate(testPfx({ until: new Date("2028-01-01T00:00:00Z") }), "senha-de-teste", KEY, BOSS, NOW, db.pool);
  assert.notEqual(renewed.fingerprint, info.fingerprint);
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM fiscal_certificates")).rows[0].count), 1);

  assert.equal(await removeCertificate(db.pool), true);
  assert.equal(await removeCertificate(db.pool), false);
  assert.equal(await loadCertificateInfo(db.pool), null);
});

test("dados fiscais do equipamento: NCM, origem, CEST e unidade", { skip }, async () => {
  const product = await createProduct({ name: "Supino" }, BOSS, db.pool);
  assert.deepEqual(await loadProductFiscal(product.id, db.pool), { ncm: null, origin: null, cest: null, unit: "UN" });
  await saveProductFiscal(product.id, { ncm: "9506.91.00", origin: 1, cest: null, unit: " pc " }, BOSS, db.pool);
  assert.deepEqual(await loadProductFiscal(product.id, db.pool), { ncm: "95069100", origin: 1, cest: null, unit: "PC" });
  const refuse = (change: object, message: RegExp) =>
    assert.rejects(() => saveProductFiscal(product.id, { ncm: "95069100", origin: 1, cest: null, unit: "UN", ...change }, BOSS, db.pool), message);
  await refuse({ ncm: "9506" }, /NCM: são 8 dígitos/);
  await refuse({ origin: 9 }, /Origem/);
  await refuse({ cest: "123" }, /CEST: são 7 dígitos/);
  await refuse({ unit: "unidade longa" }, /Unidade/);
  await assert.rejects(() => saveProductFiscal(999999, { ncm: null, origin: null, cest: null, unit: "UN" }, BOSS, db.pool), /não encontrado/);
  assert.equal(await loadProductFiscal(999999, db.pool), null);
});

test("DANFE da reforma: a data de virada nasce em 01/12/2026 e é da empresa; data inválida é recusada", { skip }, async () => {
  const { loadDanfeReformDate, saveDanfeReformDate } = await import("@/lib/db/fiscal");
  assert.equal(await loadDanfeReformDate(db.pool), "2026-12-01");
  for (const wrong of ["", "01/12/2026", "2026-02-30", "2025-12-31"]) {
    await assert.rejects(() => saveDanfeReformDate(wrong, BOSS, db.pool), /data válida/, wrong);
  }
  await saveDanfeReformDate("2026-10-08", BOSS, db.pool);
  assert.equal(await loadDanfeReformDate(db.pool), "2026-10-08");
});

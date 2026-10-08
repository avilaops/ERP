import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { loadParams, saveParams } from "@/lib/db/params";
import { DEFAULT_PARAMS } from "@/lib/pricing/params";
import type { PricingParams } from "@/lib/pricing/params";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("params");
});
after(async () => {
  if (!skip) await db.close();
});

const CHANGED: PricingParams = {
  ...DEFAULT_PARAMS,
  targetNetProfit: 0.12,
  minDownPayment: 0.7,
  proposalValidityDays: 10,
  pisCofins: 0.0925,
  ads: 0.00125,
  fixedMonthlyExpenses: 48750.5,
  // Uma reforma e um FCP: o que a diretoria altera na tela, sem mexer no código.
  stateRates: {
    ...DEFAULT_PARAMS.stateRates,
    RS: { internalIcms: 0.2, fcp: 0 },
    RJ: { internalIcms: 0.22, fcp: 0.02 },
  },
};

const count = async () => Number((await db.pool.query("SELECT count(*) FROM pricing_params")).rows[0].count);

test("parâmetros: a migração grava os valores do protótipo e é de lá que eles são lidos", { skip }, async () => {
  assert.equal(await count(), 1);
  // DEFAULT_PARAMS é o gabarito dos testes do motor: a linha inicial do banco tem de bater com ele.
  assert.deepEqual(await loadParams(db.pool), DEFAULT_PARAMS);
  assert.equal((await db.pool.query("SELECT updated_by FROM pricing_params")).rows[0].updated_by, "migracao-0002");
});

test("parâmetros: gravar e reler devolve os mesmos valores", { skip }, async () => {
  await saveParams(CHANGED, "diretoria@teste.local", db.pool);
  assert.deepEqual(await loadParams(db.pool), CHANGED);
  assert.equal(await count(), 1);
});

test("parâmetros: a segunda gravação atualiza a mesma linha e quem gravou", { skip }, async () => {
  await saveParams(DEFAULT_PARAMS, "outra@teste.local", db.pool);
  assert.equal(await count(), 1);
  assert.deepEqual(await loadParams(db.pool), DEFAULT_PARAMS);
  const { rows } = await db.pool.query("SELECT updated_by FROM pricing_params");
  assert.equal(rows[0].updated_by, "outra@teste.local");
});

test("parâmetros: taxa inválida ou sem preço possível dá erro e nada é gravado", { skip }, async () => {
  await saveParams(CHANGED, "diretoria@teste.local", db.pool);

  await assert.rejects(() => saveParams({ ...CHANGED, ipi: 1.3 }, "x@teste.local", db.pool), /Parâmetro inválido: "IPI/);
  await assert.rejects(
    () => saveParams({ ...CHANGED, targetNetProfit: 0.9 }, "x@teste.local", db.pool),
    /sem preço possível/,
  );
  await assert.rejects(() => saveParams(CHANGED, "  ", db.pool), /quem está gravando/);

  assert.deepEqual(await loadParams(db.pool), CHANGED);
  assert.equal((await db.pool.query("SELECT updated_by FROM pricing_params")).rows[0].updated_by, "diretoria@teste.local");
});

test("parâmetros: o banco recusa taxa fora de [0, 1) e uma segunda linha", { skip }, async () => {
  await saveParams(DEFAULT_PARAMS, "diretoria@teste.local", db.pool);
  await assert.rejects(() => db.pool.query("UPDATE pricing_params SET ipi = 1.3"), /check|numeric field overflow/i);
  await assert.rejects(() => db.pool.query("UPDATE pricing_params SET commission = -0.01"), /check/i);
  await assert.rejects(() => db.pool.query("UPDATE pricing_params SET proposal_validity_days = 0"), /check/i);
  // Uma linha de parâmetros por linha de produto, e só de linha que existe.
  await assert.rejects(() => db.pool.query("UPDATE pricing_params SET line_id = 99"), /fkey/i);
  assert.equal(await count(), 1);
});

test("parâmetros: linha inválida no banco é erro, não parâmetro torto", { skip }, async () => {
  // O CHECK impede a taxa inválida; um banco adulterado (restrição removida) ainda é barrado na leitura.
  await saveParams(DEFAULT_PARAMS, "diretoria@teste.local", db.pool);
  await db.pool.query("ALTER TABLE pricing_params DROP CONSTRAINT pricing_params_proposal_validity_days_check");
  await db.pool.query("UPDATE pricing_params SET proposal_validity_days = 0");
  await assert.rejects(() => loadParams(db.pool), /Validade da proposta/);
});

test("parâmetros: sem a linha no banco é erro, não valor tirado do código", { skip }, async () => {
  await db.pool.query("DELETE FROM pricing_params");
  await assert.rejects(() => loadParams(db.pool), /Parâmetros não cadastrados no banco/);
});

test("alíquotas por estado: a migração semeia as 27, gravar altera só as que mudaram, e o banco confere a taxa", { skip }, async () => {
  const other = await openTestDb("params_estados");
  try {
    const seeded = await other.pool.query("SELECT uf, internal_icms, fcp, updated_by FROM state_tax_rates ORDER BY uf");
    assert.equal(seeded.rows.length, 27);
    assert.ok(seeded.rows.every((row) => row.updated_by === "migracao-0006" && Number(row.fcp) === 0));
    assert.deepEqual((await loadParams(other.pool)).stateRates, DEFAULT_PARAMS.stateRates);

    await saveParams(CHANGED, "diretoria@teste.local", other.pool);
    assert.deepEqual((await loadParams(other.pool)).stateRates, CHANGED.stateRates);
    const touched = await other.pool.query("SELECT uf FROM state_tax_rates WHERE updated_by = 'diretoria@teste.local' ORDER BY uf");
    assert.deepEqual(touched.rows.map((row) => row.uf), ["RJ", "RS"]);

    // Tabela inválida não grava nada, nem a linha dos parâmetros.
    const bad = { ...CHANGED, ipi: 0.1, stateRates: { ...CHANGED.stateRates, MA: { internalIcms: 1.2, fcp: 0 } } };
    await assert.rejects(() => saveParams(bad, "x@teste.local", other.pool), /"ICMS interno de MA"/);
    assert.deepEqual(await loadParams(other.pool), CHANGED);

    await assert.rejects(() => other.pool.query("UPDATE state_tax_rates SET internal_icms = 1 WHERE uf = 'MA'"), /check/i);
    await assert.rejects(() => other.pool.query("UPDATE state_tax_rates SET fcp = -0.01 WHERE uf = 'MA'"), /check/i);
    await assert.rejects(
      () => other.pool.query("INSERT INTO state_tax_rates (line_id, uf, internal_icms, updated_by) VALUES (1, 'XX', 0.1, 'x')"),
      /check/i,
    );
    // Estado faltando no banco é erro na leitura, não conta com alíquota inventada.
    await other.pool.query("DELETE FROM state_tax_rates WHERE uf = 'TO'");
    await assert.rejects(() => loadParams(other.pool), /falta a alíquota do estado TO/);
  } finally {
    await other.close();
  }
});

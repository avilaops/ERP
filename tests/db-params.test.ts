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
};

const count = async () => Number((await db.pool.query("SELECT count(*) FROM pricing_params")).rows[0].count);

test("parâmetros: sem linha gravada valem os padrões do motor", { skip }, async () => {
  assert.equal(await count(), 0);
  assert.deepEqual(await loadParams(db.pool), DEFAULT_PARAMS);
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
  await assert.rejects(() => db.pool.query("UPDATE pricing_params SET id = false"), /check/i);
  assert.equal(await count(), 1);
});

test("parâmetros: linha inválida no banco é erro, não parâmetro torto", { skip }, async () => {
  // O CHECK impede a taxa inválida; um banco adulterado (restrição removida) ainda é barrado na leitura.
  await saveParams(DEFAULT_PARAMS, "diretoria@teste.local", db.pool);
  await db.pool.query("ALTER TABLE pricing_params DROP CONSTRAINT pricing_params_proposal_validity_days_check");
  await db.pool.query("UPDATE pricing_params SET proposal_validity_days = 0");
  await assert.rejects(() => loadParams(db.pool), /Validade da proposta/);
});

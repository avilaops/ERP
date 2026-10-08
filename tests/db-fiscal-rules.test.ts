import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { FiscalError } from "@/lib/db/fiscal";
import { EMPTY_FISCAL_RULES, listPaymentCodes, loadFiscalRules, missingFiscalRules, saveFiscalRules, savePaymentCode } from "@/lib/db/fiscal-rules";
import type { FiscalRules } from "@/lib/db/fiscal-rules";
import { createLine, deleteLine } from "@/lib/db/product-lines";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("fiscalrules");
});
after(async () => {
  if (!skip) await db.close();
});

const NATIONAL: FiscalRules = {
  operationNature: "Venda de mercadoria", cfopInternal: "5102", cfopInterstate: "6102", cfopInterstateNonTaxpayer: "6108", icmsCode: "00",
  ipiCst: null, ipiFrameCode: "999", pisCst: "01", pisRate: 0.0065, cofinsCst: "01", cofinsRate: 0.03, finalConsumer: true, ipiInIcmsBase: false,
  additionalInfo: "Texto fixo", ibsCbsCst: "000", ibsCbsClass: "000001", ibsStateRate: 0.001, ibsCityRate: 0, cbsRate: 0.009,
};

test("regras fiscais: nascem em branco, sem código vindo do programa; cada linha guarda as suas", { skip }, async () => {
  assert.deepEqual(await loadFiscalRules(1, db.pool), EMPTY_FISCAL_RULES);
  assert.equal(missingFiscalRules(EMPTY_FISCAL_RULES).length, 7);
  const line = await createLine("Nacional", 1, WHO, db.pool);
  await saveFiscalRules(line.id, NATIONAL, WHO, db.pool);
  assert.deepEqual(await loadFiscalRules(line.id, db.pool), NATIONAL);
  assert.deepEqual(missingFiscalRules(NATIONAL), []);
  assert.deepEqual(await loadFiscalRules(1, db.pool), EMPTY_FISCAL_RULES);
  await saveFiscalRules(line.id, { ...NATIONAL, cfopInternal: " 5101 ", ipiCst: "50" }, WHO, db.pool);
  const changed = await loadFiscalRules(line.id, db.pool);
  assert.deepEqual([changed.cfopInternal, changed.ipiCst], ["5101", "50"]);
});

test("regras fiscais: código fora do formato e linha que não existe são recusados, e nada muda", { skip }, async () => {
  for (const wrong of [{ cfopInternal: "6102" }, { cfopInterstate: "5102" }, { icmsCode: "0" }, { pisCst: "1" }, { ipiCst: "500" }, { pisRate: 1.2 }, { cofinsRate: -0.01 }]) {
    await assert.rejects(() => saveFiscalRules(1, { ...NATIONAL, ...wrong }, WHO, db.pool), FiscalError, JSON.stringify(wrong));
  }
  await assert.rejects(() => saveFiscalRules(99, NATIONAL, WHO, db.pool), /Linha de produto não encontrada/);
  assert.deepEqual(await loadFiscalRules(1, db.pool), EMPTY_FISCAL_RULES);
});

test("linha com regras fiscais e sem equipamento sai inteira; forma de pagamento da nota vem com palpite pelo nome e se edita", { skip }, async () => {
  const spare = await createLine("Acessórios", 1, WHO, db.pool);
  await saveFiscalRules(spare.id, NATIONAL, WHO, db.pool);
  await deleteLine(spare.id, db.pool);
  assert.deepEqual(await loadFiscalRules(spare.id, db.pool), EMPTY_FISCAL_RULES);

  const codes = new Map((await listPaymentCodes(db.pool)).map((method) => [method.label, method]));
  assert.deepEqual(
    ["PIX", "Boleto", "Transferência", "Cartão de crédito", "Cartão de débito", "Cheque", "Dinheiro", "Financiamento"].map((label) => codes.get(label)?.code),
    ["17", "15", "18", "03", "04", "02", "01", null],
  );
  const financing = codes.get("Financiamento")!;
  await savePaymentCode(financing.id, "99", WHO, db.pool);
  assert.equal((await listPaymentCodes(db.pool)).find((method) => method.id === financing.id)?.code, "99");
  await assert.rejects(() => savePaymentCode(financing.id, "77", WHO, db.pool), FiscalError);
  await assert.rejects(() => savePaymentCode(999999, "17", WHO, db.pool), /não encontrada/);
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { FiscalError } from "@/lib/db/fiscal";
import { completeKnownPaymentCodes, completeSaleOperation, EMPTY_FISCAL_RULES, listPaymentCodes, loadFiscalRules, missingFiscalRules, saveFiscalRules, savePaymentCode } from "@/lib/db/fiscal-rules";
import type { FiscalRules } from "@/lib/db/fiscal-rules";
import { createLine, deleteLine } from "@/lib/db/product-lines";
import { createPaymentMethod, updatePaymentMethod } from "@/lib/db/payment-methods";
import { saleOperationCodes } from "@/lib/fiscal/setup";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";
import type { Queryable } from "@/lib/db/pool";

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
  ipiCst: null, ipiFrameCode: "999", pisCst: "01", pisRate: 0.0065, cofinsCst: "01", cofinsRate: 0.03, finalConsumer: true, ipiInIcmsBase: false, icmsOutOfContributions: false,
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
  assert.equal(await completeKnownPaymentCodes(WHO, db.pool), 0);
  assert.equal((await listPaymentCodes(db.pool)).find((method) => method.id === financing.id)?.code, "99");
  const deposit = await createPaymentMethod("Depósito bancário", WHO, db.pool);
  const ambiguous = await createPaymentMethod("PIX ou cartão", WHO, db.pool);
  const afterCreate = await listPaymentCodes(db.pool);
  assert.equal(afterCreate.find((method) => method.id === deposit.id)?.code, "16");
  assert.equal(afterCreate.find((method) => method.id === ambiguous.id)?.code, null);
  await updatePaymentMethod(deposit.id, { ...deposit, label: "Permuta" }, WHO, db.pool);
  assert.equal((await listPaymentCodes(db.pool)).find((method) => method.id === deposit.id)?.code, null);
  const transfer = await updatePaymentMethod(deposit.id, { ...deposit, label: "Transferência bancária" }, WHO, db.pool);
  assert.equal((await listPaymentCodes(db.pool)).find((method) => method.id === deposit.id)?.code, "18");
  await savePaymentCode(transfer.id, "99", WHO, db.pool);
  await updatePaymentMethod(transfer.id, { ...transfer, position: 99 }, WHO, db.pool);
  assert.equal((await listPaymentCodes(db.pool)).find((method) => method.id === transfer.id)?.code, "99");
  await assert.rejects(() => savePaymentCode(financing.id, "77", WHO, db.pool), FiscalError);
  await assert.rejects(() => savePaymentCode(999999, "17", WHO, db.pool), /não encontrada/);
  const delivery = codes.get("Na entrega")!;
  await assert.rejects(() => savePaymentCode(delivery.id, "99", WHO, db.pool), /prazo na entrega/);
  await db.pool.query("UPDATE payment_methods SET nfe_code = '99' WHERE id = $1", [delivery.id]);
  assert.equal((await listPaymentCodes(db.pool)).find((method) => method.id === delivery.id)?.code, null);
});

test("pagamentos em lote: uma falha reverte todas as alterações e o retorno conta apenas gravações efetivas", { skip }, async () => {
  const deposit = await createPaymentMethod("Depósito bancário", WHO, db.pool);
  const bankSlip = await createPaymentMethod("Boleto bancário", WHO, db.pool);
  await savePaymentCode(deposit.id, null, WHO, db.pool);
  await savePaymentCode(bankSlip.id, null, WHO, db.pool);
  await db.pool.query("ALTER TABLE payment_methods ADD CONSTRAINT refuse_test_mapping CHECK (label <> 'Depósito bancário' OR nfe_code IS NULL)");
  await assert.rejects(() => completeKnownPaymentCodes(WHO, db.pool), /refuse_test_mapping/);
  let methods = await listPaymentCodes(db.pool);
  assert.equal(methods.find((method) => method.id === deposit.id)?.code, null);
  assert.equal(methods.find((method) => method.id === bankSlip.id)?.code, null);
  await db.pool.query("ALTER TABLE payment_methods DROP CONSTRAINT refuse_test_mapping");
  assert.equal(await completeKnownPaymentCodes(WHO, db.pool), 2);
  methods = await listPaymentCodes(db.pool);
  assert.equal(methods.find((method) => method.id === deposit.id)?.code, "16");
  assert.equal(methods.find((method) => method.id === bankSlip.id)?.code, "15");
  assert.equal(await completeKnownPaymentCodes(WHO, db.pool), 0);
});

test("pagamentos em lote: exclusão, renomeação e escolha manual durante a leitura são preservadas", { skip }, async () => {
  const methods = await listPaymentCodes(db.pool);
  const pix = methods.find((method) => method.label === "PIX")!;
  const boleto = methods.find((method) => method.label === "Boleto")!;
  const cheque = methods.find((method) => method.label === "Cheque")!;
  const cash = methods.find((method) => method.label === "Dinheiro")!;
  for (const method of [pix, boleto, cheque, cash]) await savePaymentCode(method.id, null, WHO, db.pool);
  let changed = false;
  const racing: Queryable = {
    async query(sql, values) {
      const result = await db.pool.query(sql, values);
      if (!changed && sql.startsWith("SELECT id, label, active, nfe_code")) {
        changed = true;
        await db.pool.query("DELETE FROM payment_methods WHERE id = $1", [boleto.id]);
        await db.pool.query("UPDATE payment_methods SET label = 'Pagamento combinado' WHERE id = $1", [cheque.id]);
        await savePaymentCode(pix.id, "99", WHO, db.pool);
      }
      return result;
    },
  };
  assert.equal(await completeKnownPaymentCodes(WHO, racing), 1);
  const after = await listPaymentCodes(db.pool);
  assert.equal(after.find((method) => method.id === pix.id)?.code, "99");
  assert.equal(after.find((method) => method.id === cheque.id)?.code, null);
  assert.equal(after.some((method) => method.id === boleto.id), false);
  assert.equal(after.find((method) => method.id === cash.id)?.code, "01");
});

test("QR da empresa: adesão explícita, independente do rótulo do provedor", {skip}, async()=>{
  const provider=await createPaymentMethod("Mercado Pago - PIX",WHO,db.pool);
  await savePaymentCode(provider.id,"17",WHO,db.pool);
  assert.equal((await listPaymentCodes(db.pool)).find(m=>m.id===provider.id)?.companyPix,false);
  await savePaymentCode(provider.id,"17",WHO,db.pool,true);
  assert.equal((await listPaymentCodes(db.pool)).find(m=>m.id===provider.id)?.companyPix,true);
  await assert.rejects(()=>savePaymentCode(provider.id,"03",WHO,db.pool,true),/exige meio PIX/);
  await updatePaymentMethod(provider.id,{label:"Cartão de teste",position:20,active:true},WHO,db.pool);
  assert.equal((await listPaymentCodes(db.pool)).find(m=>m.id===provider.id)?.companyPix,false);
});

test("operação de venda: cria somente os CFOPs; completar vazios preserva impostos e escolhas atuais do contador", { skip }, async () => {
  const line = await createLine("Operação automática", 1, WHO, db.pool);
  await completeSaleOperation(line.id, saleOperationCodes("revenda"), WHO, db.pool);
  assert.deepEqual(await loadFiscalRules(line.id, db.pool), { ...EMPTY_FISCAL_RULES, ...saleOperationCodes("revenda") });
  await saveFiscalRules(line.id, { ...NATIONAL, operationNature: null, cfopInternal: null }, WHO, db.pool);
  await db.pool.query("UPDATE fiscal_rules SET icms_code = '40', pis_rate = 0.0165, final_consumer = false WHERE line_id = $1", [line.id]);
  const accountant = await loadFiscalRules(line.id, db.pool);
  await completeSaleOperation(line.id, saleOperationCodes("producao"), WHO, db.pool);
  const expected = { ...accountant, operationNature: saleOperationCodes("producao").operationNature, cfopInternal: "5101" };
  assert.deepEqual(await loadFiscalRules(line.id, db.pool), expected);
  await completeSaleOperation(line.id, saleOperationCodes("revenda"), WHO, db.pool);
  assert.deepEqual(await loadFiscalRules(line.id, db.pool), expected);
});

test("pagamentos em lote: uma falha reverte todas as alterações e o retorno conta apenas gravações efetivas", { skip }, async () => {
  const deposit = await createPaymentMethod("Depósito bancário", WHO, db.pool);
  const bankSlip = await createPaymentMethod("Boleto bancário", WHO, db.pool);
  await savePaymentCode(deposit.id, null, WHO, db.pool);
  await savePaymentCode(bankSlip.id, null, WHO, db.pool);
  await db.pool.query("ALTER TABLE payment_methods ADD CONSTRAINT refuse_test_mapping CHECK (label <> 'Depósito bancário' OR nfe_code IS NULL)");
  await assert.rejects(() => completeKnownPaymentCodes(WHO, db.pool), /refuse_test_mapping/);
  let methods = await listPaymentCodes(db.pool);
  assert.equal(methods.find((method) => method.id === deposit.id)?.code, null);
  assert.equal(methods.find((method) => method.id === bankSlip.id)?.code, null);
  await db.pool.query("ALTER TABLE payment_methods DROP CONSTRAINT refuse_test_mapping");
  assert.equal(await completeKnownPaymentCodes(WHO, db.pool), 2);
  methods = await listPaymentCodes(db.pool);
  assert.equal(methods.find((method) => method.id === deposit.id)?.code, "16");
  assert.equal(methods.find((method) => method.id === bankSlip.id)?.code, "15");
  assert.equal(await completeKnownPaymentCodes(WHO, db.pool), 0);
});

test("pagamentos em lote: exclusão, renomeação e escolha manual durante a leitura são preservadas", { skip }, async () => {
  const methods = await listPaymentCodes(db.pool);
  const pix = methods.find((method) => method.label === "PIX")!;
  const boleto = methods.find((method) => method.label === "Boleto")!;
  const cheque = methods.find((method) => method.label === "Cheque")!;
  const cash = methods.find((method) => method.label === "Dinheiro")!;
  for (const method of [pix, boleto, cheque, cash]) await savePaymentCode(method.id, null, WHO, db.pool);
  let changed = false;
  const racing: Queryable = {
    async query(sql, values) {
      const result = await db.pool.query(sql, values);
      if (!changed && sql.startsWith("SELECT id, label, active, nfe_code")) {
        changed = true;
        await db.pool.query("DELETE FROM payment_methods WHERE id = $1", [boleto.id]);
        await db.pool.query("UPDATE payment_methods SET label = 'Pagamento combinado' WHERE id = $1", [cheque.id]);
        await savePaymentCode(pix.id, "99", WHO, db.pool);
      }
      return result;
    },
  };
  assert.equal(await completeKnownPaymentCodes(WHO, racing), 1);
  const after = await listPaymentCodes(db.pool);
  assert.equal(after.find((method) => method.id === pix.id)?.code, "99");
  assert.equal(after.find((method) => method.id === cheque.id)?.code, null);
  assert.equal(after.some((method) => method.id === boleto.id), false);
  assert.equal(after.find((method) => method.id === cash.id)?.code, "01");
});

test("operação de venda: cria somente os CFOPs; completar vazios preserva impostos e escolhas atuais do contador", { skip }, async () => {
  const line = await createLine("Operação automática", 1, WHO, db.pool);
  await completeSaleOperation(line.id, saleOperationCodes("revenda"), WHO, db.pool);
  assert.deepEqual(await loadFiscalRules(line.id, db.pool), { ...EMPTY_FISCAL_RULES, ...saleOperationCodes("revenda") });
  await saveFiscalRules(line.id, { ...NATIONAL, operationNature: null, cfopInternal: null }, WHO, db.pool);
  await db.pool.query("UPDATE fiscal_rules SET icms_code = '40', pis_rate = 0.0165, final_consumer = false WHERE line_id = $1", [line.id]);
  const accountant = await loadFiscalRules(line.id, db.pool);
  await completeSaleOperation(line.id, saleOperationCodes("producao"), WHO, db.pool);
  const expected = { ...accountant, operationNature: saleOperationCodes("producao").operationNature, cfopInternal: "5101" };
  assert.deepEqual(await loadFiscalRules(line.id, db.pool), expected);
  await completeSaleOperation(line.id, saleOperationCodes("revenda"), WHO, db.pool);
  assert.deepEqual(await loadFiscalRules(line.id, db.pool), expected);
});

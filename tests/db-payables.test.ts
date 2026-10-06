import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createPayableCategory, listAllPayableCategories, listPayableCategories, updatePayableCategory } from "@/lib/db/payable-categories";
import { createPayable, deletePayable, listCommissionsDue, listPayables, payPayable, unpayPayable, updatePayable } from "@/lib/db/payables";
import type { PayableInput } from "@/lib/db/payables";
import { createSupplier, getSupplier, listSuppliers, updateSupplier } from "@/lib/db/suppliers";
import type { SupplierInput } from "@/lib/db/suppliers";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "financeiro@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("payables");
});
after(async () => {
  if (!skip) await db.close();
});

const BLANK: SupplierInput = {
  kind: "PJ", document: null, name: "", tradeName: null, contactName: null, phone: null, email: null, country: null, bank: {}, notes: null, active: true,
};
let factory = 0;

test("fornecedores: empresa com CNPJ válido, pessoa com CPF, e exterior com país", { skip }, async () => {
  const company = await createSupplier({ ...BLANK, document: "48.240.052/0001-61", name: " Transportadora ", tradeName: "Trans", bank: { pix: " 48240052000161 ", bank: "" } }, WHO, db.pool);
  assert.deepEqual([company.document, company.name, company.tradeName, company.bank, company.country, company.active], ["48240052000161", "Transportadora", "Trans", { pix: "48240052000161" }, null, true]);
  const abroad = await createSupplier({ ...BLANK, kind: "EX", name: "Fábrica", country: "China", document: "91310000MA1", bank: { swift: "ABCDCNBJ" } }, WHO, db.pool);
  factory = abroad.id;
  assert.deepEqual([abroad.kind, abroad.country, abroad.document, abroad.bank], ["EX", "China", "91310000MA1", { swift: "ABCDCNBJ" }]);
  await createSupplier({ ...BLANK, kind: "PF", document: "529.982.247-25", name: "Maria" }, WHO, db.pool);

  await assert.rejects(() => createSupplier({ ...BLANK, document: "11.111.111/1111-11", name: "X" }, WHO, db.pool), /CNPJ inválido/);
  await assert.rejects(() => createSupplier({ ...BLANK, kind: "PF", document: "123", name: "X" }, WHO, db.pool), /CPF inválido/);
  await assert.rejects(() => createSupplier({ ...BLANK, kind: "EX", name: "X" }, WHO, db.pool), /informe o país/);
  await assert.rejects(() => createSupplier({ ...BLANK, document: "48240052000161", name: " " }, WHO, db.pool), /Informe o nome/);
  await assert.rejects(() => createSupplier({ ...BLANK, document: "48240052000161", name: "Outra" }, WHO, db.pool), /Já existe fornecedor com este documento/);

  // Alterar e desligar: nada se apaga, o desligado vai para o fim.
  const off = await updateSupplier(company.id, { ...company, contactName: "João", active: false }, WHO, db.pool);
  assert.deepEqual([off.contactName, off.active], ["João", false]);
  assert.deepEqual((await listSuppliers(db.pool)).map((item) => [item.name, item.active]), [["Fábrica", true], ["Maria", true], ["Transportadora", false]]);
  assert.equal((await getSupplier(abroad.id, db.pool))?.name, "Fábrica");
  assert.equal(await getSupplier(999999, db.pool), null);
  await assert.rejects(() => updateSupplier(999999, { ...abroad }, WHO, db.pool), /não encontrado/);
});

test("categorias: lista da empresa, editável; a desligada sai da lista de lançamento", { skip }, async () => {
  const initial = await listPayableCategories(db.pool);
  assert.equal(initial.length, 15);
  assert.deepEqual([initial[0], initial[7], initial[14]], ["Importação / China", "Comissões", "Outros"]);
  const added = await createPayableCategory(" Seguros ", WHO, db.pool);
  assert.deepEqual([added.label, added.position], ["Seguros", 16]);
  await assert.rejects(() => createPayableCategory("Marketing", WHO, db.pool), /Já existe uma categoria/);
  const vehicles = (await listAllPayableCategories(db.pool)).find((item) => item.label === "Veículos");
  assert.ok(vehicles);
  await updatePayableCategory(vehicles.id, { ...vehicles, active: false }, WHO, db.pool);
  assert.ok(!(await listPayableCategories(db.pool)).includes("Veículos"));
  assert.equal((await listAllPayableCategories(db.pool)).length, 16);
});

const BILL: PayableInput = { description: "Aluguel de outubro", supplierId: null, category: "Aluguel e condomínio", amount: 3500, dueDate: "2026-10-10", method: "Boleto" };

test("contas: lançar, alterar, pagar com o valor que saiu, desfazer e excluir", { skip }, async () => {
  const rent = await createPayable(BILL, WHO, db.pool);
  const china = await createPayable({ ...BILL, description: " Sinal da fábrica ", supplierId: factory, category: "Importação / China", amount: 17729.68, dueDate: "2026-10-03", method: null }, WHO, db.pool);
  assert.deepEqual([china.description, china.supplierName, china.status, china.paidOn, china.paidAmount], ["Sinal da fábrica", "Fábrica", "aberta", null, null]);

  await assert.rejects(() => createPayable({ ...BILL, description: " " }, WHO, db.pool), /Informe a descrição/);
  await assert.rejects(() => createPayable({ ...BILL, amount: 0 }, WHO, db.pool), /maior que zero/);
  await assert.rejects(() => createPayable({ ...BILL, dueDate: "10/10/2026" }, WHO, db.pool), /Vencimento: informe uma data válida/);

  const changed = await updatePayable(rent.id, { ...BILL, amount: 3600 }, WHO, db.pool);
  assert.equal(changed.amount, 3600);
  // Abertas pela data de vencimento.
  assert.deepEqual((await listPayables(db.pool)).map((item) => item.description), ["Sinal da fábrica", "Aluguel de outubro"]);

  await assert.rejects(() => payPayable(rent.id, { paidOn: "2026-10-07", paidAmount: 3600, method: null }, WHO, "2026-10-06", db.pool), /não pode ser no futuro/);
  await assert.rejects(() => payPayable(rent.id, { paidOn: "2026-10-06", paidAmount: 0, method: null }, WHO, "2026-10-06", db.pool), /maior que zero/);
  // Pago com juros, por PIX em vez do boleto previsto.
  await payPayable(rent.id, { paidOn: "2026-10-06", paidAmount: 3636, method: "PIX" }, WHO, "2026-10-06", db.pool);
  const paid = (await listPayables(db.pool)).find((item) => item.id === rent.id);
  assert.deepEqual([paid?.status, paid?.paidOn, paid?.paidAmount, paid?.amount, paid?.method], ["paga", "2026-10-06", 3636, 3600, "PIX"]);
  assert.deepEqual((await listPayables(db.pool)).map((item) => item.status), ["aberta", "paga"]);

  // Paga não se altera, não se paga de novo e não se exclui.
  await assert.rejects(() => updatePayable(rent.id, BILL, WHO, db.pool), /já paga/);
  await assert.rejects(() => payPayable(rent.id, { paidOn: "2026-10-06", paidAmount: 1, method: null }, WHO, "2026-10-06", db.pool), /já paga/);
  await assert.rejects(() => deletePayable(rent.id, db.pool), /conta paga não se exclui/);

  await unpayPayable(rent.id, WHO, db.pool);
  await assert.rejects(() => unpayPayable(rent.id, WHO, db.pool), /ainda não paga/);
  assert.deepEqual(await deletePayable(rent.id, db.pool), { description: "Aluguel de outubro" });
  assert.equal((await listPayables(db.pool)).length, 1);
  // Sem comissão em aberto, não há linha automática.
  assert.deepEqual(await listCommissionsDue(db.pool), []);
});

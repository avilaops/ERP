import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { listPaymentMethods } from "@/lib/db/orders";
import { createPaymentMethod, deletePaymentMethod, listAllPaymentMethods, updatePaymentMethod } from "@/lib/db/payment-methods";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("paymethods");
});
after(async () => {
  if (!skip) await db.close();
});

test("formas de pagamento: a diretoria acrescenta, renomeia, reordena e desliga; nada se apaga", { skip }, async () => {
  const initial = await listAllPaymentMethods(db.pool);
  assert.deepEqual(initial.map((item) => item.label).slice(0, 2), ["PIX", "Boleto"]);
  assert.equal(initial.length, 9);
  // "Na entrega" nasce marcada como saldo na entrega; as outras, não. A marca é da empresa: muda na tela.
  assert.deepEqual(initial.filter((item) => item.onDelivery).map((item) => item.label), ["Na entrega"]);

  // Nova forma entra no fim da lista do pedido.
  const added = await createPaymentMethod("  Consórcio ", WHO, db.pool);
  assert.deepEqual([added.label, added.position, added.active], ["Consórcio", 10, true]);
  assert.equal((await listPaymentMethods(db.pool)).at(-1), "Consórcio");
  await assert.rejects(() => createPaymentMethod("PIX", WHO, db.pool), /Já existe uma forma de pagamento com este nome/);
  await assert.rejects(() => createPaymentMethod("  ", WHO, db.pool), /Informe o nome/);
  await assert.rejects(() => createPaymentMethod("x".repeat(61), WHO, db.pool), /no máximo 60/);

  // Renomear e levar para o começo.
  const first = await updatePaymentMethod(added.id, { label: "Carta de consórcio", position: 0, active: true }, WHO, db.pool);
  assert.deepEqual([first.label, first.position], ["Carta de consórcio", 0]);
  assert.equal((await listPaymentMethods(db.pool))[0], "Carta de consórcio");
  await assert.rejects(() => updatePaymentMethod(added.id, { label: "Boleto", position: 0, active: true }, WHO, db.pool), /Já existe/);
  await assert.rejects(() => updatePaymentMethod(added.id, { label: "X", position: -1, active: true }, WHO, db.pool), /Ordem/);
  await assert.rejects(() => updatePaymentMethod(999999, { label: "X", position: 1, active: true }, WHO, db.pool), /não encontrada/);

  // Desligada: sai da lista do pedido e continua no cadastro.
  const cheque = initial.find((item) => item.label === "Cheque");
  assert.ok(cheque);
  await updatePaymentMethod(cheque.id, { ...cheque, active: false }, WHO, db.pool);
  assert.ok(!(await listPaymentMethods(db.pool)).includes("Cheque"));
  assert.deepEqual((await listAllPaymentMethods(db.pool)).find((item) => item.label === "Cheque")?.active, false);
  assert.equal((await listAllPaymentMethods(db.pool)).length, 10);
});

test("formas de pagamento: remover tira da lista, e só existe uma vez", { skip }, async () => {
  const extra = await createPaymentMethod("Permuta", WHO, db.pool);
  await deletePaymentMethod(extra.id, db.pool);
  assert.ok(!(await listAllPaymentMethods(db.pool)).some((item) => item.label === "Permuta"));
  await assert.rejects(() => deletePaymentMethod(extra.id, db.pool), /não encontrada/);
});

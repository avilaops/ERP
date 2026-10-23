import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { loadParams } from "@/lib/db/params";
import { latestVersion, publishPriceTable } from "@/lib/db/price-table";
import { createProduct, listProducts } from "@/lib/db/products";
import {
  addPurchaseCost, createPurchase, deletePurchase, getPurchase, landedCosts, listPurchases, movePurchase, PurchaseError, receivePurchase, removePurchaseCost,
  removePurchaseItem, savePurchaseItem, unreceivePurchase, updatePurchase,
} from "@/lib/db/purchases";
import type { PurchaseInput } from "@/lib/db/purchases";
import { countStock, listOrdersToShip, listProductMoves, listStock, shipOrder, StockError, unshipOrder } from "@/lib/db/stock";
import { draftPriceTable } from "@/lib/price-table";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const WHO = "diretoria@teste.local";
let db: TestDb;
let leg = 0;
let bench = 0;
let supplier = 0;
let purchase = 0;

before(async () => {
  if (!skip) db = await openTestDb("stock");
});
after(async () => {
  if (!skip) await db.close();
});

const of = async (productId: number) => (await listStock(db.pool)).find((row) => row.productId === productId)!;
const INPUT = (): PurchaseInput => ({ supplierId: supplier, kind: "importacao", reference: " PI-2026-041 ", orderedOn: "2026-09-01", expectedOn: "2026-11-15", currency: "USD", exchangeRate: 5.5, invoiceNumber: null, invoiceKey: null, notes: null });

test("compra: itens na moeda do fornecedor, custos em reais e o custo de cada peça posto no estoque", { skip }, async () => {
  leg = (await createProduct({ name: "Leg Press", code: "T-LEG", advisoryCost: 5000 }, WHO, db.pool)).id;
  bench = (await createProduct({ name: "Banco", code: "T-BAN", advisoryCost: 800 }, WHO, db.pool)).id;
  supplier = Number((await db.pool.query("INSERT INTO suppliers (kind, name, updated_by) VALUES ('PJ', 'Fábrica Teste', $1) RETURNING id", [WHO])).rows[0].id);

  await assert.rejects(() => createPurchase({ ...INPUT(), supplierId: 999_999 }, WHO, db.pool), /Fornecedor não encontrado/);
  await assert.rejects(() => createPurchase({ ...INPUT(), exchangeRate: 0 }, WHO, db.pool), (error: Error) => error instanceof PurchaseError && /Câmbio/.test(error.message));
  purchase = (await createPurchase(INPUT(), WHO, db.pool)).id;
  await savePurchaseItem(purchase, { productId: leg, quantity: 2, unitPrice: 900 }, WHO, db.pool);
  await savePurchaseItem(purchase, { productId: bench, quantity: 10, unitPrice: 20 }, WHO, db.pool);
  // De novo o mesmo equipamento: troca quantidade e preço, não duplica.
  await savePurchaseItem(purchase, { productId: bench, quantity: 5, unitPrice: 40 }, WHO, db.pool);
  await addPurchaseCost(purchase, "Frete internacional", 1000, WHO, db.pool);
  await addPurchaseCost(purchase, "Despachante", 100.01, WHO, db.pool);
  await assert.rejects(() => addPurchaseCost(purchase, " ", 10, WHO, db.pool), /Diga o que é o custo/);

  const saved = (await getPurchase(purchase, db.pool))!;
  assert.deepEqual([saved.reference, saved.status, saved.currency, saved.exchangeRate, saved.supplier], ["PI-2026-041", "pedido", "USD", 5.5, "Fábrica Teste"]);
  // 2 × 900 × 5,5 = 9.900 e 5 × 40 × 5,5 = 1.100: os custos se dividem 90% e 10%, e o centavo que sobra vai para o maior.
  assert.deepEqual(saved.items.map((item) => [item.code, item.quantity, item.goods, item.share, item.landedUnit]), [["T-BAN", 5, 1100, 110, 242], ["T-LEG", 2, 9900, 990.01, 5445.01]]);
  assert.deepEqual([saved.goods, saved.extra, saved.total], [11000, 1100.01, 12100.01]);
  assert.deepEqual((await listPurchases(db.pool)).map((row) => [row.id, row.pieces, row.total, row.status]), [[purchase, 7, 12100.01, "pedido"]]);

  // Em real o câmbio é sempre 1, qualquer que seja o digitado.
  await updatePurchase(purchase, { ...INPUT(), currency: "BRL", exchangeRate: 7 }, WHO, db.pool);
  assert.equal((await getPurchase(purchase, db.pool))!.exchangeRate, 1);
  await updatePurchase(purchase, INPUT(), WHO, db.pool);
  assert.deepEqual(landedCosts([], 50), []);
  assert.deepEqual(landedCosts([{ quantity: 3, goods: 0 }], 50), [{ share: 0, landedUnit: 0 }]);
});

test("compra e estoque preservam quantidades fracionadas em até quatro casas", { skip }, async () => {
  const material = (await createProduct({ name: "Cabo por metro", code: "T-CABO", advisoryCost: 10 }, WHO, db.pool)).id;
  const source = Number((await db.pool.query("INSERT INTO suppliers (kind, name, country, updated_by) VALUES ('EX', 'Fornecedor fracionado', 'China', $1) RETURNING id", [WHO])).rows[0].id);
  const order = (await createPurchase({ ...INPUT(), supplierId: source, currency: "BRL", exchangeRate: 1 }, WHO, db.pool)).id;
  await assert.rejects(() => savePurchaseItem(order, { productId: material, quantity: 1.23456, unitPrice: 8 }, WHO, db.pool), /quatro casas/);
  await savePurchaseItem(order, { productId: material, quantity: 12.3456, unitPrice: 8 }, WHO, db.pool);
  assert.equal((await getPurchase(order, db.pool))?.items[0].quantity, 12.3456);
  await receivePurchase(order, "2026-10-18", WHO, db.pool);
  assert.equal((await of(material)).physical, 12.3456);
  assert.deepEqual(await countStock(material, 10.5, "Contagem fracionada", WHO, db.pool), { difference: -1.8456 });
  assert.equal((await of(material)).physical, 10.5);
});

test("estoque: a compra a caminho aparece como a chegar; recebida, entra; desfeita, sai", { skip }, async () => {
  assert.deepEqual([(await of(leg)).physical, (await of(leg)).incoming], [0, 2]);
  await movePurchase(purchase, "em_transito", WHO, db.pool);
  assert.equal((await of(bench)).incoming, 5);

  assert.deepEqual(await receivePurchase(purchase, "2026-10-12", WHO, db.pool), { items: 2 });
  assert.deepEqual([(await of(leg)).physical, (await of(leg)).incoming, (await of(bench)).physical], [2, 0, 5]);
  assert.deepEqual([(await getPurchase(purchase, db.pool))!.status, (await getPurchase(purchase, db.pool))!.receivedOn], ["recebida", "2026-10-12"]);
  // Recebida: não recebe de novo, não muda item, não é removida; o custo que chega depois ainda entra.
  await assert.rejects(() => receivePurchase(purchase, "2026-10-12", WHO, db.pool), /já recebida/);
  await assert.rejects(() => savePurchaseItem(purchase, { productId: leg, quantity: 9, unitPrice: 1 }, WHO, db.pool), /desfaça o recebimento/);
  await assert.rejects(() => removePurchaseItem(purchase, leg, WHO, db.pool), /desfaça o recebimento/);
  await assert.rejects(() => deletePurchase(purchase, db.pool), /nunca entrou no estoque/);
  await addPurchaseCost(purchase, "Armazenagem", 50, WHO, db.pool);
  const { costs } = (await getPurchase(purchase, db.pool))!;
  await removePurchaseCost(purchase, costs[costs.length - 1].id, db.pool);

  await unreceivePurchase(purchase, WHO, db.pool);
  assert.deepEqual([(await of(leg)).physical, (await of(leg)).incoming, (await getPurchase(purchase, db.pool))!.status], [0, 2, "em_transito"]);
  await receivePurchase(purchase, "2026-10-13", WHO, db.pool);
  assert.equal((await of(leg)).physical, 2);
  assert.deepEqual((await listProductMoves(leg, 10, db.pool)).map((move) => [move.kind, move.quantity]), [["compra", 2], ["estorno", -2], ["compra", 2]]);

  // Uma compra que nunca entrou no estoque some inteira, com itens e custos.
  const other = (await createPurchase({ ...INPUT(), kind: "nacional", currency: "BRL", exchangeRate: 1 }, WHO, db.pool)).id;
  await savePurchaseItem(other, { productId: leg, quantity: 1, unitPrice: 4000 }, WHO, db.pool);
  await addPurchaseCost(other, "Frete", 300, WHO, db.pool);
  await assert.rejects(() => receivePurchase(other, "12/10/2026", WHO, db.pool), /data em que a mercadoria chegou/);
  await movePurchase(other, "cancelada", WHO, db.pool);
  await assert.rejects(() => movePurchase(other, "pedido", WHO, db.pool), /já recebida ou cancelada/);
  await deletePurchase(other, db.pool);
  assert.equal(await getPurchase(other, db.pool), null);
});

test("estoque: a contagem grava só a diferença; o pedido fechado compromete e a expedição dá a saída uma vez", { skip }, async () => {
  assert.deepEqual(await countStock(bench, 5, "", WHO, db.pool), { difference: 0 });
  assert.deepEqual(await countStock(bench, 3, "Duas peças avariadas", WHO, db.pool), { difference: -2 });
  assert.equal((await of(bench)).physical, 3);
  await assert.rejects(() => countStock(bench, -1, "", WHO, db.pool), (error: Error) => error instanceof StockError);
  await assert.rejects(() => countStock(999_999, 1, "", WHO, db.pool), /Equipamento não encontrado/);

  const draft = draftPriceTable(await loadParams(db.pool), await listProducts({ active: true }, db.pool));
  const version = ((await latestVersion(db.pool))?.version ?? 0) + 1;
  await publishPriceTable(draft, version, WHO, db.pool);
  const customer = Number((await db.pool.query("INSERT INTO customers (kind, document, name, updated_by) VALUES ('PJ', '48240052000161', 'Academia Teste', $1) RETURNING id", [WHO])).rows[0].id);
  const order = Number(
    (await db.pool.query(
      `INSERT INTO orders (number, seller_email, seller_name, price_table_version, updated_by, status, closed_at, customer_id, delivery_uf, production_days)
       VALUES ('261012-TEST', 'vendedor@teste.local', 'Vendedor', $1, $2, 'fechado', now(), $3, 'SP', 30) RETURNING id`,
      [version, WHO, customer],
    )).rows[0].id,
  );
  await db.pool.query("INSERT INTO order_items (order_id, price_table_version, product_id, quantity) VALUES ($1, $2, $3, 1), ($1, $2, $4, 4)", [order, version, leg, bench]);

  // Fechado e ainda no galpão: compromete. O banco fica com menos do que foi prometido.
  assert.deepEqual([(await of(leg)).committed, (await of(leg)).available, (await of(bench)).committed, (await of(bench)).available], [1, 1, 4, -1]);
  const waiting = await listOrdersToShip(false, db.pool);
  assert.deepEqual(waiting.map((item) => [item.number, item.customer, item.items.map((line) => [line.code, line.quantity, line.physical])]), [["261012-TEST", "Academia Teste", [["T-BAN", 4, 3], ["T-LEG", 1, 2]]]]);

  assert.deepEqual(await shipOrder("261012-TEST", WHO, db.pool), { items: 2 });
  assert.deepEqual([(await of(leg)).physical, (await of(leg)).committed, (await of(bench)).physical, (await of(bench)).available], [1, 0, -1, -1]);
  await assert.rejects(() => shipOrder("261012-TEST", WHO, db.pool), /já expedido/);
  assert.deepEqual([(await listOrdersToShip(false, db.pool)).length, (await listOrdersToShip(true, db.pool)).map((item) => item.number)], [0, ["261012-TEST"]]);

  assert.deepEqual(await unshipOrder("261012-TEST", WHO, db.pool), { items: 2 });
  assert.deepEqual([(await of(leg)).physical, (await of(leg)).committed, (await of(bench)).physical], [2, 1, 3]);
  await assert.rejects(() => unshipOrder("261012-TEST", WHO, db.pool), /sem saída para desfazer/);
  // Depois de desfeita, pode sair de novo.
  assert.deepEqual(await shipOrder("261012-TEST", WHO, db.pool), { items: 2 });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { createCustomer } from "@/lib/db/customers";
import {
  addOrderItem,
  createOrder,
  getOrder,
  linkOrderCustomer,
  loadOrderStanding,
  removeOrderItem,
  saveOrderTerms,
  setOrderItemQuantity,
} from "@/lib/db/orders";
import type { OrderScope, OrderTerms } from "@/lib/db/orders";
import { loadParams, saveParams } from "@/lib/db/params";
import { latestVersion, loadPublishedSnapshot, loadPublishedTable, publishPriceTable } from "@/lib/db/price-table";
import { createProduct, listProducts, updateProduct } from "@/lib/db/products";
import { directorOf, dueDates, saleOf } from "@/lib/order-quote";
import { draftPriceTable } from "@/lib/price-table";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const DIRECTOR = "diretoria@teste.local";
const SELLER = { email: "vendedor@teste.local", name: "Vendedor (teste)" };
const OTHER_SELLER = { email: "outro@teste.local", name: "Outro vendedor" };
const ALL: OrderScope = { sellerEmail: null };
const MINE: OrderScope = { sellerEmail: SELLER.email };
const THEIRS: OrderScope = { sellerEmail: OTHER_SELLER.email };
let db: TestDb;

/** Product ids by code, filled by the first test. */
const ID: Record<string, number> = {};
let customerMa = 0;
let customerSp = 0;

before(async () => {
  if (!skip) db = await openTestDb("orders");
});
after(async () => {
  if (!skip) await db.close();
});

const publish = async () => {
  const draft = draftPriceTable(await loadParams(db.pool), await listProducts({ active: true }, db.pool));
  const next = ((await latestVersion(db.pool))?.version ?? 0) + 1;
  return publishPriceTable(draft, next, DIRECTOR, db.pool);
};

/** The message comes in the language of the server; the code does not change. */
const FOREIGN_KEY = (error: unknown) => (error as { code?: string }).code === "23503";

/** A fixed sequence of numbers, so a test can force a repeated one. */
const numbers = (...list: string[]) => {
  let index = 0;
  return () => list[Math.min(index++, list.length - 1)];
};

const order = async (number: string, scope: OrderScope = ALL) => {
  const found = await getOrder(number, scope, db.pool);
  assert.ok(found, `pedido ${number}`);
  return found;
};

const TERMS: OrderTerms = { discount: 0, deliveryUf: "MA", taxpayer: false, productionDays: 90, freight: 0, notes: null };

const company = (document: string, uf: "MA" | "SP", stateRegistration: string | null) => ({
  kind: "PJ" as const,
  document,
  name: `Academia ${uf}`,
  tradeName: null,
  contactName: "Fulano",
  stateRegistration,
  rg: null,
  phone: "99999999999",
  email: "a@b.c",
  cep: "99999999",
  street: "Rua",
  streetNumber: "1",
  complement: null,
  district: "Centro",
  city: "Cidade",
  uf,
});

test("preparo: os equipamentos do print na v1, e dois clientes", { skip }, async () => {
  const print: [string, number, number][] = [
    ["LD-B001", 8146.64, 0.2811565],
    ["LD-B002", 8738.77, 0.2735316],
    ["LD-B003", 11571.09, 0.2766628],
  ];
  for (const [code, advisoryCost, taxCredit] of print) {
    ID[code] = (await createProduct({ name: `Equipamento ${code}`, code, advisoryCost, taxCredit }, DIRECTOR, db.pool)).id;
  }
  // Cadastrado, mas fora da v1: ainda sem custo.
  ID["LD-B009"] = (await createProduct({ name: "Fora da v1", code: "LD-B009" }, DIRECTOR, db.pool)).id;
  assert.equal((await publish()).version, 1);

  customerMa = (await createCustomer(company("48240052000161", "MA", "ISENTO"), SELLER.email, db.pool)).id;
  customerSp = (await createCustomer(company("11222333000181", "SP", "123456789110"), SELLER.email, db.pool)).id;
});

test("a equipe lê as condições comerciais da versão, e nada de custo", { skip }, async () => {
  const table = await loadPublishedTable(1, db.pool);
  assert.ok(table);
  assert.deepEqual(Object.keys(table), [
    "version",
    "publishedAt",
    "freeDiscount",
    "ipi",
    "minDownPayment",
    "proposalValidityDays",
    "commission",
    "items",
  ]);
  assert.deepEqual([table.ipi, table.minDownPayment, table.proposalValidityDays, table.commission], [0.13, 0.65, 7, 0.02]);
  assert.deepEqual(Object.keys(table.items[0]), ["productId", "code", "name", "table", "tableWithIpi"]);
});

test("criar: o pedido nasce em negociação, na versão pedida, com o primeiro item", { skip }, async () => {
  const number = await createOrder(
    { seller: SELLER, version: 1, productId: ID["LD-B001"], quantity: 1 },
    numbers("260930-BBMN"),
    db.pool,
  );
  assert.equal(number, "260930-BBMN");

  const created = await order(number);
  assert.deepEqual(
    {
      number: created.number,
      status: created.status,
      sellerEmail: created.sellerEmail,
      sellerName: created.sellerName,
      customer: created.customer,
      priceTableVersion: created.priceTableVersion,
      discount: created.discount,
      deliveryUf: created.deliveryUf,
      taxpayer: created.taxpayer,
      productionDays: created.productionDays,
      freight: created.freight,
      notes: created.notes,
      downPayment: created.downPayment,
      downPaymentDate: created.downPaymentDate,
      closedAt: created.closedAt,
      items: created.items,
    },
    {
      number: "260930-BBMN",
      status: "em_negociacao",
      sellerEmail: SELLER.email,
      sellerName: SELLER.name,
      customer: null,
      priceTableVersion: 1,
      discount: 0,
      deliveryUf: null,
      taxpayer: false,
      productionDays: null,
      freight: 0,
      notes: null,
      downPayment: 0,
      downPaymentDate: null,
      closedAt: null,
      items: [{ productId: ID["LD-B001"], quantity: 1 }],
    },
  );
  assert.ok(created.updatedAt instanceof Date);
});

test("criar: número repetido sorteia outro; equipamento fora da versão é recusado e nada fica", { skip }, async () => {
  const number = await createOrder(
    { seller: OTHER_SELLER, version: 1, productId: ID["LD-B002"], quantity: 2 },
    numbers("260930-BBMN", "260930-BBMN", "260930-536F"),
    db.pool,
  );
  assert.equal(number, "260930-536F");

  const count = async () => Number((await db.pool.query("SELECT count(*) FROM orders")).rows[0].count);
  const before = await count();
  // Cinco sorteios repetidos: desiste, com o erro do banco.
  await assert.rejects(
    () => createOrder({ seller: SELLER, version: 1, productId: ID["LD-B001"], quantity: 1 }, numbers("260930-BBMN"), db.pool),
    /orders_number_key/,
  );
  const create = (productId: number, version = 1, quantity = 1, number = "260930-K62T") =>
    createOrder({ seller: SELLER, version, productId, quantity }, numbers(number), db.pool);
  await assert.rejects(() => create(ID["LD-B009"]), /Este equipamento não está na tabela v1\./);
  await assert.rejects(() => create(ID["LD-B001"], 7), /não está na tabela v7/);
  await assert.rejects(() => create(ID["LD-B001"], 1, 0), /Quantidade precisa ser/);
  await assert.rejects(() => create(ID["LD-B001"], 1, 1.5), /Quantidade precisa ser/);
  await assert.rejects(() => create(ID["LD-B001"], 1, 1, "bbmn"), /fora do formato/);
  assert.equal(await count(), before);
});

test("itens: adicionar soma no que já está, alterar quantidade, e o último não sai", { skip }, async () => {
  const N = "260930-BBMN";
  await addOrderItem(N, ID["LD-B002"], 1, SELLER.email, MINE, db.pool);
  await addOrderItem(N, ID["LD-B001"], 2, SELLER.email, MINE, db.pool);
  assert.deepEqual((await order(N)).items, [
    { productId: ID["LD-B001"], quantity: 3 },
    { productId: ID["LD-B002"], quantity: 1 },
  ]);

  await setOrderItemQuantity(N, ID["LD-B001"], 1, SELLER.email, MINE, db.pool);
  assert.equal((await order(N)).items[0].quantity, 1);

  await assert.rejects(() => addOrderItem(N, ID["LD-B009"], 1, SELLER.email, MINE, db.pool), /não está na tabela v1/);
  await assert.rejects(() => addOrderItem(N, ID["LD-B002"], 0, SELLER.email, MINE, db.pool), /Quantidade precisa ser/);
  await assert.rejects(() => setOrderItemQuantity(N, ID["LD-B003"], 2, SELLER.email, MINE, db.pool), /não está no pedido/);
  await assert.rejects(() => setOrderItemQuantity(N, ID["LD-B001"], -1, SELLER.email, MINE, db.pool), /Quantidade precisa ser/);
  await assert.rejects(() => removeOrderItem(N, ID["LD-B003"], SELLER.email, MINE, db.pool), /não está no pedido/);

  await addOrderItem(N, ID["LD-B003"], 5, SELLER.email, MINE, db.pool);
  await removeOrderItem(N, ID["LD-B003"], SELLER.email, MINE, db.pool);
  assert.equal((await order(N)).items.length, 2);

  const single = "260930-536F";
  await assert.rejects(
    () => removeOrderItem(single, ID["LD-B002"], OTHER_SELLER.email, THEIRS, db.pool),
    /O pedido precisa de pelo menos um equipamento\./,
  );
  assert.equal((await order(single)).items.length, 1);
});

test("cliente: a UF de entrega e o contribuinte seguem o cadastro; UF já escolhida fica", { skip }, async () => {
  const N = "260930-BBMN";
  await linkOrderCustomer(N, customerMa, SELLER.email, MINE, db.pool);
  let linked = await order(N);
  assert.equal(linked.customer?.id, customerMa);
  assert.equal(linked.customer?.stateRegistration, "ISENTO");
  assert.deepEqual([linked.deliveryUf, linked.taxpayer], ["MA", false]);

  // Trocar para o cliente de SP com inscrição: contribuinte, mas a entrega continua no MA.
  await linkOrderCustomer(N, customerSp, SELLER.email, MINE, db.pool);
  linked = await order(N);
  assert.deepEqual([linked.customer?.id, linked.deliveryUf, linked.taxpayer], [customerSp, "MA", true]);

  await linkOrderCustomer(N, customerMa, SELLER.email, MINE, db.pool);
  await assert.rejects(() => linkOrderCustomer(N, 2_000_000_000, SELLER.email, MINE, db.pool), /Cliente não encontrado/);
  assert.equal((await order(N)).customer?.id, customerMa);
});

test("condições: gravam; contribuinte só vale para empresa com inscrição em número", { skip }, async () => {
  const N = "260930-BBMN";
  await saveOrderTerms(N, { ...TERMS, taxpayer: true, freight: 350.5, notes: "  entrega em novembro  " }, SELLER.email, MINE, db.pool);
  let saved = await order(N);
  // Cliente ISENTO: o "Sim" enviado é gravado como não.
  assert.deepEqual(
    [saved.discount, saved.deliveryUf, saved.taxpayer, saved.productionDays, saved.freight, saved.notes],
    [0, "MA", false, 90, 350.5, "entrega em novembro"],
  );

  await linkOrderCustomer(N, customerSp, SELLER.email, MINE, db.pool);
  await saveOrderTerms(N, { ...TERMS, taxpayer: true, discount: 0.125 }, SELLER.email, MINE, db.pool);
  saved = await order(N);
  assert.deepEqual([saved.taxpayer, saved.discount, saved.freight, saved.notes], [true, 0.125, 0, null]);

  const bad: Partial<OrderTerms>[] = [
    { discount: 1 },
    { discount: -0.1 },
    { discount: Number.NaN },
    { deliveryUf: "XX" as OrderTerms["deliveryUf"] },
    { productionDays: 0 },
    { productionDays: 1.5 },
    { freight: -1 },
  ];
  for (const change of bad) {
    await assert.rejects(() => saveOrderTerms(N, { ...TERMS, ...change }, SELLER.email, MINE, db.pool), Error, JSON.stringify(change));
  }
  assert.equal((await order(N)).discount, 0.125);

  // De volta ao pedido do print: cliente do MA, sem desconto nem frete.
  await linkOrderCustomer(N, customerMa, SELLER.email, MINE, db.pool);
  await saveOrderTerms(N, TERMS, SELLER.email, MINE, db.pool);
});

test("gabarito do print pelo banco: resumo, quadro do diretor e faixa", { skip }, async () => {
  const printed = await order("260930-BBMN");
  const table = await loadPublishedTable(1, db.pool);
  const snapshot = await loadPublishedSnapshot(1, db.pool);
  assert.ok(table && snapshot);

  const sale = saleOf(printed, table);
  assert.deepEqual([sale.tableTotal, sale.netSale, sale.ipi, sale.invoiceTotal], [40023.6, 40023.6, 5203.07, 45226.67]);
  assert.deepEqual(sale.lines.map((line) => line.unitWithIpi), [21701.21, 23525.46]);

  const board = directorOf(printed, snapshot);
  assert.ok(board);
  const { quote, max } = board;
  assert.deepEqual(
    {
      taxes: quote.taxes,
      difal: quote.difal,
      equipmentCost: quote.equipmentCost,
      profitBeforeIncomeTax: quote.profitBeforeIncomeTax,
      incomeTax: quote.incomeTax,
      netProfit: quote.netProfit,
      chinaPayment: quote.chinaPayment,
      targetNetProfit: quote.targetNetProfit,
      downPaymentCommission: quote.downPaymentCommission,
      requiredDownPayment: quote.requiredDownPayment,
    },
    {
      taxes: 7304.31,
      difal: 7604.48,
      equipmentCost: 12814.83,
      profitBeforeIncomeTax: 12299.98,
      incomeTax: 4181.99,
      netProfit: 8117.99,
      chinaPayment: 17729.68,
      targetNetProfit: 6003.54,
      downPaymentCommission: 427.63,
      requiredDownPayment: 24160.85,
    },
  );
  assert.equal((quote.netProfitRate * 100).toFixed(1), "20.3");
  assert.equal((quote.requiredDownPaymentRate * 100).toFixed(0), "53");
  assert.equal((max.atTarget * 100).toFixed(1), "20.0");
  assert.equal((max.noLoss * 100).toFixed(1), "49.0");
  assert.equal(board.targetNetProfit, 0.15);
  // A conta da equipe e a do diretor concordam no que as duas mostram.
  assert.deepEqual([quote.tableTotal, quote.invoiceTotal, quote.lines], [sale.tableTotal, sale.invoiceTotal, sale.lines]);

  // Para a equipe, só o nome da faixa sai da leitura de custo.
  assert.deepEqual(await loadOrderStanding(printed, db.pool), { band: "na-meta" });
});

test("faixa: sem estado de entrega não há; com desconto alto muda", { skip }, async () => {
  const fresh = await order("260930-536F");
  assert.deepEqual(await loadOrderStanding(fresh, db.pool), { band: null });
  const snapshot = await loadPublishedSnapshot(1, db.pool);
  assert.ok(snapshot);
  assert.equal(directorOf(fresh, snapshot), null);

  const printed = await order("260930-BBMN");
  assert.deepEqual(await loadOrderStanding({ ...printed, discount: 0.3 }, db.pool), { band: "abaixo-da-meta" });
  assert.deepEqual(await loadOrderStanding({ ...printed, discount: 0.6 }, db.pool), { band: "prejuizo" });
  // 20% é o limite da meta no MA sem inscrição: ainda está nela.
  assert.deepEqual(await loadOrderStanding({ ...printed, discount: 0.2 }, db.pool), { band: "na-meta" });
});

test("datas: validade conta da última alteração; fabricação, da entrada, do fechamento ou de hoje", { skip }, async () => {
  const printed = await order("260930-BBMN");
  const table = await loadPublishedTable(1, db.pool);
  assert.ok(table);
  const at = (iso: string) => new Date(iso);

  const base = { ...printed, updatedAt: at("2026-09-30T13:06:00Z"), productionDays: 90 };
  assert.deepEqual(dueDates({ ...base, downPaymentDate: "2026-09-30" }, table, "2026-10-05"), {
    proposalValidUntil: "2026-10-07",
    completion: "2026-12-29",
  });
  // Sem data de entrada: do fechamento; sem ele, de hoje.
  assert.equal(dueDates({ ...base, closedAt: at("2026-10-01T15:00:00Z") }, table, "2026-10-05").completion, "2026-12-30");
  assert.equal(dueDates(base, table, "2026-10-05").completion, "2027-01-03");
  assert.equal(dueDates({ ...base, productionDays: null }, table, "2026-10-05").completion, null);
  // 01:30 UTC ainda é o dia anterior em São Paulo.
  assert.equal(dueDates({ ...base, updatedAt: at("2026-10-01T01:30:00Z") }, table, "2026-10-05").proposalValidUntil, "2026-10-07");
});

test("escopo: pedido de outro vendedor é pedido que não existe, para ler e para gravar", { skip }, async () => {
  const N = "260930-BBMN";
  assert.equal(await getOrder(N, THEIRS, db.pool), null);
  assert.equal((await getOrder(N, MINE, db.pool))?.number, N);
  assert.equal((await getOrder(N, ALL, db.pool))?.number, N);
  assert.equal(await getOrder("260930-ZZZZ", ALL, db.pool), null);
  assert.equal(await getOrder("'; DROP TABLE orders; --", ALL, db.pool), null);

  const before = await order(N);
  const who = OTHER_SELLER.email;
  const refused = /Pedido não encontrado ou já fechado/;
  await assert.rejects(() => addOrderItem(N, ID["LD-B003"], 1, who, THEIRS, db.pool), refused);
  await assert.rejects(() => setOrderItemQuantity(N, ID["LD-B001"], 9, who, THEIRS, db.pool), refused);
  await assert.rejects(() => removeOrderItem(N, ID["LD-B001"], who, THEIRS, db.pool), refused);
  await assert.rejects(() => saveOrderTerms(N, { ...TERMS, discount: 0.5 }, who, THEIRS, db.pool), refused);
  await assert.rejects(() => linkOrderCustomer(N, customerSp, who, THEIRS, db.pool), refused);
  assert.deepEqual(await order(N), before);

  // Gerente e Diretoria (escopo nulo) alteram, e fica quem alterou.
  await setOrderItemQuantity(N, ID["LD-B001"], 1, DIRECTOR, ALL, db.pool);
  const { rows } = await db.pool.query("SELECT updated_by, seller_email FROM orders WHERE number = $1", [N]);
  assert.deepEqual(rows[0], { updated_by: DIRECTOR, seller_email: SELLER.email });
});

test("pedido fora de negociação não se altera", { skip }, async () => {
  const N = await createOrder({ seller: SELLER, version: 1, productId: ID["LD-B001"], quantity: 1 }, numbers("261001-FECH"), db.pool);
  await linkOrderCustomer(N, customerMa, SELLER.email, MINE, db.pool);
  await saveOrderTerms(N, TERMS, SELLER.email, MINE, db.pool);
  await db.pool.query("UPDATE orders SET status = 'fechado', closed_at = now() WHERE number = $1", [N]);

  const refused = /Pedido não encontrado ou já fechado\. Reabra o pedido para alterar\./;
  await assert.rejects(() => addOrderItem(N, ID["LD-B002"], 1, SELLER.email, MINE, db.pool), refused);
  await assert.rejects(() => setOrderItemQuantity(N, ID["LD-B001"], 2, SELLER.email, MINE, db.pool), refused);
  await assert.rejects(() => removeOrderItem(N, ID["LD-B001"], SELLER.email, MINE, db.pool), refused);
  await assert.rejects(() => saveOrderTerms(N, { ...TERMS, discount: 0.1 }, SELLER.email, MINE, db.pool), refused);
  await assert.rejects(() => linkOrderCustomer(N, customerSp, SELLER.email, MINE, db.pool), refused);
  const closed = await order(N);
  assert.deepEqual([closed.status, closed.discount, closed.items.length, closed.customer?.id], ["fechado", 0, 1, customerMa]);
  assert.ok(closed.closedAt instanceof Date);
});

test("o pedido guarda o preço da versão em que foi feito", { skip }, async () => {
  const table1 = await loadPublishedTable(1, db.pool);
  assert.ok(table1);
  const before = saleOf(await order("260930-BBMN"), table1);

  // O rascunho muda inteiro e sai a v2.
  await updateProduct(ID["LD-B001"], { advisoryCost: 9000 }, DIRECTOR, db.pool);
  await updateProduct(ID["LD-B009"], { advisoryCost: 500 }, DIRECTOR, db.pool);
  await saveParams({ ...(await loadParams(db.pool)), ipi: 0.1, targetNetProfit: 0.2 }, DIRECTOR, db.pool);
  assert.equal((await publish()).version, 2);

  const kept = await order("260930-BBMN");
  assert.equal(kept.priceTableVersion, 1);
  const table = await loadPublishedTable(kept.priceTableVersion, db.pool);
  assert.ok(table);
  const after = saleOf(kept, table);
  assert.deepEqual(after, before);
  assert.deepEqual(after.lines.map((line) => line.unitPrice), [19204.61, 20818.99]);
  assert.equal(after.invoiceTotal, 45226.67);
  assert.deepEqual(await loadOrderStanding(kept, db.pool), { band: "na-meta" });

  // Pedido novo sai na v2, com o preço novo e o equipamento que só existe nela.
  const fresh = await createOrder({ seller: SELLER, version: 2, productId: ID["LD-B001"], quantity: 1 }, numbers("261002-NOVA"), db.pool);
  await addOrderItem(fresh, ID["LD-B009"], 1, SELLER.email, MINE, db.pool);
  const table2 = await loadPublishedTable(2, db.pool);
  assert.ok(table2);
  const sale2 = saleOf(await order(fresh), table2);
  assert.notEqual(sale2.lines[0].unitPrice, 19204.61);
  assert.equal(table2.ipi, 0.1);
  // E o pedido da v1 continua sem poder receber o que só entrou na v2.
  await assert.rejects(() => addOrderItem("260930-BBMN", ID["LD-B009"], 1, SELLER.email, MINE, db.pool), /não está na tabela v1/);
});

test("o banco prende o pedido à versão e não deixa apagar o que ele usa", { skip }, async () => {
  const { rows } = await db.pool.query("SELECT id FROM orders WHERE number = '260930-BBMN'");
  const id = rows[0].id;
  const item = (version: number, productId: number) =>
    db.pool.query("INSERT INTO order_items (order_id, price_table_version, product_id, quantity) VALUES ($1, $2, $3, 1)", [
      id,
      version,
      productId,
    ]);
  // Equipamento ausente da versão do pedido; e item com versão diferente da do pedido.
  await assert.rejects(() => item(1, ID["LD-B009"]), /order_items_price_table_version_product_id_fkey/);
  await assert.rejects(() => item(2, ID["LD-B009"]), /order_items_order_id_price_table_version_fkey/);
  await assert.rejects(() => db.pool.query("UPDATE order_items SET quantity = 0 WHERE order_id = $1", [id]), /check/i);
  await assert.rejects(() => db.pool.query("UPDATE orders SET number = 'bbmn' WHERE id = $1", [id]), /check/i);

  // Fora de negociação precisa de cliente, UF e prazo; e fechado precisa da data.
  const fresh = (await db.pool.query("SELECT id FROM orders WHERE number = '260930-536F'")).rows[0].id;
  await assert.rejects(() => db.pool.query("UPDATE orders SET status = 'aguardando_aprovacao' WHERE id = $1", [fresh]), /check/i);
  await assert.rejects(() => db.pool.query("UPDATE orders SET status = 'fechado' WHERE id = $1", [id]), /check/i);
  await assert.rejects(() => db.pool.query("UPDATE orders SET closed_at = now() WHERE id = $1", [id]), /check/i);
  await assert.rejects(() => db.pool.query("UPDATE orders SET status = 'arquivado' WHERE id = $1", [id]), /check/i);

  // Nada do que o pedido usa se apaga.
  await assert.rejects(() => db.pool.query("DELETE FROM price_table_items WHERE version = 1"), FOREIGN_KEY);
  await assert.rejects(() => db.pool.query("DELETE FROM price_table_versions WHERE version = 1"), FOREIGN_KEY);
  await assert.rejects(() => db.pool.query("DELETE FROM products WHERE id = $1", [ID["LD-B001"]]), FOREIGN_KEY);
  await assert.rejects(() => db.pool.query("DELETE FROM customers WHERE id = $1", [customerMa]), FOREIGN_KEY);
  await assert.rejects(() => db.pool.query("DELETE FROM orders WHERE id = $1", [id]), FOREIGN_KEY);
});

test("a migração dos pedidos não tem cascata nem coluna de preço, custo ou total", () => {
  const migration = readFileSync(new URL("../db/migrations/0005_pedidos.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /ON DELETE/i);
  const columns = [...migration.matchAll(/^ {4}([a-z_]+) +(integer|text|numeric|boolean|date|timestamptz)/gm)].map((match) => match[1]);
  assert.ok(columns.length >= 28, `só ${columns.length} colunas lidas`);
  for (const column of columns) {
    if (column === "price_table_version") continue;
    assert.doesNotMatch(column, /price|cost|total/, column);
  }
});

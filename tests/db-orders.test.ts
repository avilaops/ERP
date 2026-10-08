import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { decideApproval, lastDecision, listPastDecisions, listPendingApprovals } from "@/lib/db/approvals";
import { createCustomer, deleteCustomer } from "@/lib/db/customers";
import { listDashboardOrders, ordersProfit } from "@/lib/db/dashboard";
import {
  addOrderItem,
  closeOrder,
  createOrder,
  deleteOrder,
  getOrder,
  linkOrderCustomer,
  listOrders,
  listPaymentMethods,
  loadOrderStanding,
  removeOrderItem,
  reopenOrder,
  saveOrderTerms,
  savePayment,
  setOrderItemQuantity,
  simulationBand,
} from "@/lib/db/orders";
import type { OrderPayment, OrderScope, OrderTerms } from "@/lib/db/orders";
import { loadParams, saveParams } from "@/lib/db/params";
import { listCommissionsDue } from "@/lib/db/payables";
import { listCarriedBalances, listCommissionMonths, listCommissions, payCommissions } from "@/lib/db/commissions";
import { loadApprovalPolicy, loadCommissionDay, saveApprovalPolicy, saveCommissionDay } from "@/lib/db/company";
import { decideRefund, listOpenReceivables, listPendingRefunds, listReceipts, recordReceipt, requestRefund } from "@/lib/db/receivables";
import { latestVersion, loadPublishedSnapshot, loadPublishedTable, publishPriceTable } from "@/lib/db/price-table";
import { createProduct, listProducts, updateProduct } from "@/lib/db/products";
import { closingProblems, directorOf, dueDates, paymentOf, saleOf } from "@/lib/order-quote";
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
    "lineId",
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
  assert.equal((await loadOrderStanding(printed, db.pool)).band, "na-meta");
});

test("faixa: sem estado de entrega não há; com desconto alto muda", { skip }, async () => {
  const fresh = await order("260930-536F");
  assert.deepEqual(await loadOrderStanding(fresh, db.pool), { band: null, policy: null });
  const snapshot = await loadPublishedSnapshot(1, db.pool);
  assert.ok(snapshot);
  assert.equal(directorOf(fresh, snapshot), null);

  const printed = await order("260930-BBMN");
  assert.equal((await loadOrderStanding({ ...printed, discount: 0.3 }, db.pool)).band, "abaixo-da-meta");
  assert.equal((await loadOrderStanding({ ...printed, discount: 0.6 }, db.pool)).band, "prejuizo");
  // 20% é o limite da meta no MA sem inscrição: ainda está nela.
  assert.equal((await loadOrderStanding({ ...printed, discount: 0.2 }, db.pool)).band, "na-meta");
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
  assert.equal((await loadOrderStanding(kept, db.pool)).band, "na-meta");

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

const PAYMENT: OrderPayment = {
  downPayment: 25000,
  downPaymentMethod: "PIX",
  downPaymentDate: "2026-09-30",
  balanceMethod: "Boleto",
  installmentCount: 2,
  firstInstallmentDays: 30,
  installmentIntervalDays: 30,
  paymentNotes: null,
};

test("formas de pagamento vêm do banco da empresa", { skip }, async () => {
  const methods = await listPaymentMethods(db.pool);
  assert.deepEqual(methods.slice(0, 3), ["PIX", "Boleto", "Transferência"]);
  assert.equal(methods.length, 8);
  await db.pool.query("UPDATE payment_methods SET active = false WHERE label = 'Cheque'");
  await db.pool.query("INSERT INTO payment_methods (label, position, updated_by) VALUES ('Consórcio', 0, 'x')");
  const changed = await listPaymentMethods(db.pool);
  assert.equal(changed[0], "Consórcio");
  assert.ok(!changed.includes("Cheque"));
});

test("pagamento do print: entrada de 25.000 fica abaixo da política e manda o pedido para aprovação", { skip }, async () => {
  const N = "260930-BBMN";
  await savePayment(N, PAYMENT, SELLER.email, MINE, db.pool);
  const saved = await order(N);
  assert.deepEqual(
    [saved.downPayment, saved.downPaymentMethod, saved.downPaymentDate, saved.balanceMethod, saved.installmentCount, saved.firstInstallmentDays, saved.installmentIntervalDays],
    [25000, "PIX", "2026-09-30", "Boleto", 2, 30, 30],
  );

  const table = await loadPublishedTable(1, db.pool);
  assert.ok(table);
  const sale = saleOf(saved, table);
  const plan = paymentOf(saved, sale, table, "2026-10-06");
  assert.equal((plan.downPaymentRate * 100).toFixed(1), "55.3");
  assert.deepEqual([plan.downPayment, plan.balance, plan.policyDownPayment, plan.meetsPolicy], [25000, 20226.67, 29397.34, false]);
  assert.deepEqual(
    plan.receipts.map(({ label, dueDate, method, amount }) => [label, dueDate, method, amount]),
    [
      ["Entrada", "2026-09-30", "PIX", 25000],
      ["1/2", "2026-10-30", "Boleto", 10113.33],
      ["2/2", "2026-11-29", "Boleto", 10113.34],
    ],
  );
  assert.equal(plan.installmentsTotal, plan.balance);
  assert.deepEqual(closingProblems(saved, sale), []);

  const standing = await loadOrderStanding(saved, db.pool);
  assert.deepEqual(standing, { band: "na-meta", policy: { needsApproval: true, reasons: ["entrada-abaixo-da-politica"] } });

  assert.deepEqual(await closeOrder(N, SELLER.email, MINE, db.pool), {
    status: "aguardando_aprovacao",
    reasons: ["entrada-abaixo-da-politica"],
    missing: [],
  });
  const waiting = await order(N);
  assert.deepEqual([waiting.status, waiting.closedAt], ["aguardando_aprovacao", null]);
  const asked = await db.pool.query("SELECT requested_by, reasons, status, revision_hash FROM order_approvals");
  assert.deepEqual(
    asked.rows.map((row) => [row.requested_by, row.reasons, row.status, /^[0-9a-f]{64}$/.test(row.revision_hash)]),
    [[SELLER.email, ["entrada-abaixo-da-politica"], "pendente", true]],
  );
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM order_closings")).rows[0].count), 0);
  // Aguardando aprovação não se altera; volta para negociação por quem vê o pedido.
  await assert.rejects(() => savePayment(N, { ...PAYMENT, downPayment: 30000 }, SELLER.email, MINE, db.pool), /Pedido não encontrado ou já fechado/);
  await assert.rejects(() => reopenOrder(N, OTHER_SELLER.email, THEIRS, db.pool), /não está fechado nem aguardando/);
  await reopenOrder(N, SELLER.email, MINE, db.pool);
  assert.equal((await order(N)).status, "em_negociacao");
  // O pedido de aprovação que ninguém decidiu sai junto.
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM order_approvals")).rows[0].count), 0);
});

test("com entrada de 30.000 o pedido do print fecha, com data e registro do fechamento", { skip }, async () => {
  const N = "260930-BBMN";
  await savePayment(N, { ...PAYMENT, downPayment: 30000 }, SELLER.email, MINE, db.pool);
  assert.deepEqual(await closeOrder(N, SELLER.email, MINE, db.pool), { status: "fechado", reasons: [], missing: [] });
  const closed = await order(N);
  assert.equal(closed.status, "fechado");
  assert.ok(closed.closedAt instanceof Date);
  assert.equal(closed.priceTableVersion, 1);
  const { rows } = await db.pool.query(
    "SELECT closed_by, invoice_total::float AS total, reopened_at FROM order_closings WHERE order_id = $1",
    [closed.id],
  );
  assert.deepEqual(rows, [{ closed_by: SELLER.email, total: 45226.67, reopened_at: null }]);

  // Fechado não se altera nem se exclui.
  const refused = /Pedido não encontrado ou já fechado/;
  await assert.rejects(() => saveOrderTerms(N, TERMS, SELLER.email, MINE, db.pool), refused);
  await assert.rejects(() => addOrderItem(N, ID["LD-B003"], 1, SELLER.email, MINE, db.pool), refused);
  await assert.rejects(() => savePayment(N, PAYMENT, SELLER.email, MINE, db.pool), refused);
  await assert.rejects(() => closeOrder(N, SELLER.email, MINE, db.pool), refused);
  await assert.rejects(() => deleteOrder(N, MINE, db.pool), /só pedido em negociação pode ser excluído/);

  // Reabrir: volta para negociação, sem data, na mesma versão; o fechamento anterior fica guardado.
  await reopenOrder(N, DIRECTOR, ALL, db.pool);
  const reopened = await order(N);
  assert.deepEqual([reopened.status, reopened.closedAt, reopened.priceTableVersion], ["em_negociacao", null, 1]);
  const history = await db.pool.query("SELECT reopened_by, reopened_at IS NOT NULL AS reopened FROM order_closings WHERE order_id = $1", [closed.id]);
  assert.deepEqual(history.rows, [{ reopened_by: DIRECTOR, reopened: true }]);
  // Pedido que já foi fechado tem histórico: não se exclui mais, nem em negociação.
  await assert.rejects(() => deleteOrder(N, MINE, db.pool), /tem histórico \(fechamento ou aprovação\)/);
  assert.equal((await order(N)).items.length, 2);
  // Fecha de novo: são dois fechamentos na história.
  assert.equal((await closeOrder(N, SELLER.email, MINE, db.pool)).status, "fechado");
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM order_closings WHERE order_id = $1", [closed.id])).rows[0].count), 2);
});

test("fechar: faltando cliente, prazo ou parcelas, nada muda e a resposta diz o que falta", { skip }, async () => {
  const N = "260930-536F";
  const result = await closeOrder(N, OTHER_SELLER.email, THEIRS, db.pool);
  assert.equal(result.status, "em_negociacao");
  assert.deepEqual(result.missing, [
    "Informe o cliente.",
    "Informe o estado de entrega.",
    "Informe o prazo de fabricação.",
    "Informe em quantas parcelas o saldo será pago.",
    "Informe a forma de pagamento do saldo.",
  ]);
  assert.equal((await order(N)).status, "em_negociacao");

  // Cliente com cadastro incompleto também segura o fechamento.
  const blank = { tradeName: null, contactName: null, stateRegistration: null, rg: null, phone: null, email: null, cep: null, street: null, streetNumber: null, complement: null, district: null, city: null, uf: null };
  const incomplete = await createCustomer({ ...blank, kind: "PF", document: "52998224725", name: "Maria" }, SELLER.email, db.pool);
  await linkOrderCustomer(N, incomplete.id, OTHER_SELLER.email, THEIRS, db.pool);
  const second = await closeOrder(N, OTHER_SELLER.email, THEIRS, db.pool);
  assert.match(second.missing[0], /^Faltam 8 campos no cadastro do cliente: Celular, E-mail, CEP/);

  // Entrada maior que a nota é recusada ao gravar.
  await assert.rejects(() => savePayment(N, { ...PAYMENT, downPayment: 999999 }, OTHER_SELLER.email, THEIRS, db.pool), /não pode ser maior que o total da nota/);
  await assert.rejects(() => savePayment(N, { ...PAYMENT, downPayment: -1 }, OTHER_SELLER.email, THEIRS, db.pool), /Entrada/);
  await assert.rejects(() => savePayment(N, { ...PAYMENT, installmentCount: 0 }, OTHER_SELLER.email, THEIRS, db.pool), /Parcelas/);
  await assert.rejects(() => savePayment(N, { ...PAYMENT, downPaymentDate: "30/09/2026" }, OTHER_SELLER.email, THEIRS, db.pool), /Data inválida/);
});

test("fechar: se o pedido mudou entre a leitura e a gravação, nada é gravado", { skip }, async () => {
  const N = await createOrder({ seller: SELLER, version: 1, productId: ID["LD-B001"], quantity: 1 }, numbers("261003-CORR"), db.pool);
  await linkOrderCustomer(N, customerMa, SELLER.email, MINE, db.pool);
  await saveOrderTerms(N, TERMS, SELLER.email, MINE, db.pool);
  await savePayment(N, { ...PAYMENT, downPayment: 20000 }, SELLER.email, MINE, db.pool);

  // Outra pessoa altera o pedido logo antes da gravação do fechamento.
  const racing = {
    query: async (text: string, values?: unknown[]) => {
      if (text.includes("WITH closed AS")) {
        await db.pool.query("UPDATE orders SET discount = 0.5, updated_at = now() + interval '1 second' WHERE number = $1", [N]);
      }
      return db.pool.query(text, values);
    },
  } as typeof db.pool;
  await assert.rejects(() => closeOrder(N, SELLER.email, MINE, racing), /foi alterado por outra pessoa/);
  const after = await order(N);
  assert.deepEqual([after.status, after.closedAt, after.discount], ["em_negociacao", null, 0.5]);
});

test("excluir: pedido em negociação sai com os itens, e a tabela publicada fica como estava", { skip }, async () => {
  const before = Number((await db.pool.query("SELECT count(*) FROM price_table_items")).rows[0].count);
  const N = "261002-NOVA";
  await assert.rejects(() => deleteOrder(N, THEIRS, db.pool), /Pedido não encontrado/);
  assert.deepEqual(await deleteOrder(N, MINE, db.pool), { sellerEmail: SELLER.email });
  assert.equal(await getOrder(N, ALL, db.pool), null);
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.number = $1", [N])).rows[0].count), 0);
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM price_table_items")).rows[0].count), before);
  await assert.rejects(() => deleteOrder(N, MINE, db.pool), /Pedido não encontrado/);
});

test("lista: cada pedido com o preço da própria versão; o vendedor só recebe os dele", { skip }, async () => {
  const all = await listOrders(ALL, db.pool);
  const mine = await listOrders(MINE, db.pool);
  const theirs = await listOrders(THEIRS, db.pool);
  assert.ok(all.length >= 4);
  assert.ok(mine.every((item) => item.sellerEmail === SELLER.email));
  assert.deepEqual(theirs.map((item) => item.number), ["260930-536F"]);
  assert.equal(all.length, mine.length + theirs.length);

  const printed = all.find((item) => item.number === "260930-BBMN");
  assert.ok(printed);
  assert.deepEqual(
    [printed.status, printed.customerName, printed.customerDocument, printed.deliveryUf, printed.taxpayer, printed.discount, printed.ipi],
    ["fechado", "Academia MA", "48240052000161", "MA", false, 0, 0.13],
  );
  assert.deepEqual(printed.items, [
    { quantity: 1, tableUnitPrice: 19204.61 },
    { quantity: 1, tableUnitPrice: 20818.99 },
  ]);
  assert.ok(printed.closedAt instanceof Date);
  // Da mais recente para a mais antiga.
  const stamps = all.map((item) => item.updatedAt.getTime());
  assert.deepEqual(stamps, [...stamps].sort((a, b) => b - a));
});

const MANAGER = { email: "gerente@teste.local", role: "GERENTE_COMERCIAL", approvesAtLoss: false } as const;
const BOSS = { email: DIRECTOR, role: "DIRETORIA", approvesAtLoss: true } as const;

/** A new order of the print, complete, with the given discount and down payment, sent to closing. */
const sendToClosing = async (number: string, discount: number, downPayment: number) => {
  const N = await createOrder({ seller: SELLER, version: 1, productId: ID["LD-B001"], quantity: 1 }, numbers(number), db.pool);
  await linkOrderCustomer(N, customerMa, SELLER.email, MINE, db.pool);
  await saveOrderTerms(N, { ...TERMS, discount }, SELLER.email, MINE, db.pool);
  await savePayment(N, { ...PAYMENT, downPayment }, SELLER.email, MINE, db.pool);
  return closeOrder(N, SELLER.email, MINE, db.pool);
};

test("aprovação: a fila traz o pedido com os motivos; o gerente aprova e o pedido fecha", { skip }, async () => {
  const sent = await sendToClosing("261004-APRV", 0, 5000);
  assert.deepEqual([sent.status, sent.reasons], ["aguardando_aprovacao", ["entrada-abaixo-da-politica"]]);

  const queue = await listPendingApprovals(db.pool);
  const item = queue.find((entry) => entry.order.number === "261004-APRV");
  assert.ok(item);
  assert.deepEqual(
    [item.requestedBy, item.reasons, item.band, item.directorOnly, item.order.customerName],
    [SELLER.email, ["entrada-abaixo-da-politica"], "na-meta", false, "Academia MA"],
  );
  // Nada de custo na fila.
  assert.doesNotMatch(JSON.stringify(queue), /cost|profit|china/i);

  await decideApproval("261004-APRV", { approve: true, comment: " cliente antigo " }, MANAGER, db.pool);
  const closed = await order("261004-APRV");
  assert.equal(closed.status, "fechado");
  assert.ok(closed.closedAt instanceof Date);
  const { rows } = await db.pool.query(
    `SELECT a.status, a.decided_by, a.decided_role, a.comment, (SELECT count(*)::int FROM order_closings c WHERE c.order_id = a.order_id) AS closings
       FROM order_approvals a WHERE a.order_id = $1`,
    [closed.id],
  );
  assert.deepEqual(rows, [{ status: "aprovado", decided_by: MANAGER.email, decided_role: "GERENTE_COMERCIAL", comment: "cliente antigo", closings: 1 }]);
  assert.ok(!(await listPendingApprovals(db.pool)).some((entry) => entry.order.number === "261004-APRV"));
  // Decidido, não se decide de novo.
  await assert.rejects(() => decideApproval("261004-APRV", { approve: false, comment: "x" }, BOSS, db.pool), /não está mais aguardando/);
});

test("aprovação: recusar exige motivo, devolve o pedido à negociação e o vendedor lê o motivo", { skip }, async () => {
  await sendToClosing("261004-RECU", 0, 5000);
  await assert.rejects(() => decideApproval("261004-RECU", { approve: false, comment: "  " }, MANAGER, db.pool), /escreva o motivo/);
  assert.equal((await order("261004-RECU")).status, "aguardando_aprovacao");

  await decideApproval("261004-RECU", { approve: false, comment: "Entrada muito baixa: peça 65%." }, MANAGER, db.pool);
  const back = await order("261004-RECU");
  assert.deepEqual([back.status, back.closedAt], ["em_negociacao", null]);
  const mine = await lastDecision("261004-RECU", MINE, db.pool);
  assert.ok(mine);
  assert.deepEqual([mine.approved, mine.decidedBy, mine.comment], [false, MANAGER.email, "Entrada muito baixa: peça 65%."]);
  assert.equal(await lastDecision("261004-RECU", THEIRS, db.pool), null);
  assert.equal(await lastDecision("261002-NADA", ALL, db.pool), null);
  // Pedido recusado tem histórico: não se exclui. Pode ser corrigido e enviado de novo.
  await assert.rejects(() => deleteOrder("261004-RECU", MINE, db.pool), /tem histórico/);
  await savePayment("261004-RECU", { ...PAYMENT, downPayment: 5500 }, SELLER.email, MINE, db.pool);
  assert.equal((await closeOrder("261004-RECU", SELLER.email, MINE, db.pool)).status, "aguardando_aprovacao");
  const past = await listPastDecisions(10, db.pool);
  assert.deepEqual(past.slice(0, 2).map((entry) => [entry.number, entry.approved]), [["261004-RECU", false], ["261004-APRV", true]]);
});

test("aprovação: pedido com prejuízo só a diretoria aprova; o gerente pode recusar", { skip }, async () => {
  const sent = await sendToClosing("261004-PREJ", 0.6, 8000);
  assert.equal(sent.status, "aguardando_aprovacao");
  assert.ok(sent.reasons.includes("fora-da-meta"));
  const item = (await listPendingApprovals(db.pool)).find((entry) => entry.order.number === "261004-PREJ");
  assert.deepEqual([item?.band, item?.directorOnly], ["prejuizo", true]);

  await assert.rejects(() => decideApproval("261004-PREJ", { approve: true, comment: null }, MANAGER, db.pool), /só a diretoria pode aprovar/);
  assert.equal((await order("261004-PREJ")).status, "aguardando_aprovacao");
  await decideApproval("261004-PREJ", { approve: true, comment: null }, BOSS, db.pool);
  assert.equal((await order("261004-PREJ")).status, "fechado");
});

test("aprovação: se o pedido mudou entre a leitura e a decisão, nada é gravado", { skip }, async () => {
  const racing = {
    query: async (text: string, values?: unknown[]) => {
      if (text.includes("WITH target AS")) {
        await db.pool.query("UPDATE orders SET updated_at = now() + interval '1 second' WHERE number = '261004-RECU'");
      }
      return db.pool.query(text, values);
    },
  } as typeof db.pool;
  await assert.rejects(() => decideApproval("261004-RECU", { approve: true, comment: null }, BOSS, racing), /não está mais aguardando/);
  assert.equal((await order("261004-RECU")).status, "aguardando_aprovacao");
  const { rows } = await db.pool.query(
    "SELECT count(*)::int AS pending FROM order_approvals a JOIN orders o ON o.id = a.order_id WHERE o.number = '261004-RECU' AND a.status = 'pendente'",
  );
  assert.equal(rows[0].pending, 1);
});

test("recebimentos: o pedido fechado gera a entrada e as parcelas; a baixa grava o recebimento e a comissão", { skip }, async () => {
  // O pedido do print, fechado com entrada de 30.000 e saldo em 2 parcelas.
  const N = "260930-BBMN";
  const open = (await listOpenReceivables(db.pool)).filter((item) => item.orderNumber === N);
  assert.deepEqual(
    open.map(({ label, dueDate, amount, method, customerName, sellerName }) => [label, dueDate, amount, method, customerName, sellerName]),
    [
      ["Entrada", "2026-09-30", 30000, "PIX", "Academia MA", SELLER.name],
      ["1/2", "2026-10-30", 7613.33, "Boleto", "Academia MA", SELLER.name],
      ["2/2", "2026-11-29", 7613.34, "Boleto", "Academia MA", SELLER.name],
    ],
  );
  // O fechamento anterior, reaberto, não deixou sobra: são só estas três em aberto.
  const all = await db.pool.query("SELECT r.status, count(*)::int AS n FROM receivables r JOIN orders o ON o.id = r.order_id WHERE o.number = $1 GROUP BY r.status", [N]);
  assert.deepEqual(all.rows, [{ status: "aberta", n: 3 }]);

  const [down, first] = open;
  await assert.rejects(() => recordReceipt(down.id, { receivedOn: "2026-10-07", method: "PIX", note: null }, "financeiro@teste.local", "2026-10-06", db.pool), /não pode ser no futuro/);
  await assert.rejects(() => recordReceipt(down.id, { receivedOn: "06/10/2026", method: "PIX", note: null }, "financeiro@teste.local", "2026-10-06", db.pool), /Informe a data/);

  // Comissão: 30.000 ÷ 1,13 × 2% = 530,97, do mês de setembro, para pagar em 05/10.
  assert.deepEqual(await recordReceipt(down.id, { receivedOn: "2026-09-30", method: " PIX ", note: " comprovante 123 " }, "financeiro@teste.local", "2026-10-06", db.pool), { commission: 530.97 });
  const { rows } = await db.pool.query(
    `SELECT p.amount::float AS amount, p.amount_without_ipi::float AS base, p.method, p.note, p.recorded_by,
            to_char(p.received_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS received,
            m.seller_email, m.amount::float AS commission, m.rate::float AS rate, m.base_amount::float AS commission_base,
            to_char(m.competence, 'YYYY-MM-DD') AS competence, to_char(m.payment_due, 'YYYY-MM-DD') AS due, m.paid_at
       FROM receipts p JOIN commissions m ON m.receipt_id = p.id WHERE p.receivable_id = $1`,
    [down.id],
  );
  assert.deepEqual(rows, [
    {
      amount: 30000, base: 26548.67, method: "PIX", note: "comprovante 123", recorded_by: "financeiro@teste.local", received: "2026-09-30 12:00",
      seller_email: SELLER.email, commission: 530.97, rate: 0.02, commission_base: 26548.67, competence: "2026-09-01", due: "2026-10-05", paid_at: null,
    },
  ]);
  // Baixa não se repete, e o que foi recebido sai da lista.
  await assert.rejects(() => recordReceipt(down.id, { receivedOn: "2026-09-30", method: null, note: null }, "financeiro@teste.local", "2026-10-06", db.pool), /não está mais em aberto/);
  await assert.rejects(() => recordReceipt(999999, { receivedOn: "2026-09-30", method: null, note: null }, "financeiro@teste.local", "2026-10-06", db.pool), /não está mais em aberto/);
  assert.deepEqual((await listOpenReceivables(db.pool)).filter((item) => item.orderNumber === N).map((item) => item.label), ["1/2", "2/2"]);

  const past = await listReceipts(5, db.pool);
  assert.deepEqual(
    [past[0].orderNumber, past[0].receivedOn, past[0].amount, past[0].method, past[0].commission, past[0].recordedBy],
    [N, "2026-09-30", 30000, "PIX", 530.97, "financeiro@teste.local"],
  );

  // Com valor recebido, o pedido não volta para negociação.
  await assert.rejects(() => reopenOrder(N, DIRECTOR, ALL, db.pool), /já tem valor recebido e não pode ser reaberto/);
  assert.equal((await order(N)).status, "fechado");
  assert.equal(first.label, "1/2");
});

test("recebimentos: aprovado gera a receber; reaberto cancela o que estava em aberto; pedido em aprovação não gera nada", { skip }, async () => {
  // 261004-APRV foi aprovado pelo gerente: entrada de 5.000 e saldo em 2 parcelas.
  const approved = (await listOpenReceivables(db.pool)).filter((item) => item.orderNumber === "261004-APRV");
  assert.deepEqual(approved.map((item) => [item.label, item.amount]), [["Entrada", 5000], ["1/2", 8350.6], ["2/2", 8350.61]]);
  // 261004-RECU aguarda aprovação: nada a receber ainda.
  assert.equal((await listOpenReceivables(db.pool)).filter((item) => item.orderNumber === "261004-RECU").length, 0);

  await reopenOrder("261004-APRV", DIRECTOR, ALL, db.pool);
  assert.equal((await listOpenReceivables(db.pool)).filter((item) => item.orderNumber === "261004-APRV").length, 0);
  const cancelled = await db.pool.query("SELECT DISTINCT r.status FROM receivables r JOIN orders o ON o.id = r.order_id WHERE o.number = '261004-APRV'");
  assert.deepEqual(cancelled.rows, [{ status: "cancelada" }]);

  // Fechado de novo com outra condição: à vista. Fica só a entrada; as parcelas antigas seguem canceladas.
  await savePayment("261004-APRV", { ...PAYMENT, downPayment: 21701.21, installmentCount: null, balanceMethod: null }, SELLER.email, MINE, db.pool);
  assert.equal((await closeOrder("261004-APRV", SELLER.email, MINE, db.pool)).status, "fechado");
  assert.deepEqual(
    (await listOpenReceivables(db.pool)).filter((item) => item.orderNumber === "261004-APRV").map((item) => [item.label, item.amount]),
    [["Entrada", 21701.21]],
  );
});

const FINANCE = "financeiro@teste.local";

test("comissões: o dia do pagamento é da empresa; cada vendedor só recebe as suas linhas", { skip }, async () => {
  assert.equal(await loadCommissionDay(db.pool), 5);
  await saveCommissionDay(10, DIRECTOR, db.pool);
  for (const day of [0, 29, 1.5]) await assert.rejects(() => saveCommissionDay(day, DIRECTOR, db.pool), /de 1 a 28/);

  // Parcela 1/2 do pedido do print, recebida em outubro: comissão de outubro, a pagar no dia 10 de novembro.
  const [first] = (await listOpenReceivables(db.pool)).filter((item) => item.orderNumber === "260930-BBMN");
  assert.deepEqual(await recordReceipt(first.id, { receivedOn: "2026-10-02", method: "Boleto", note: null }, FINANCE, "2026-10-06", db.pool), { commission: 134.75 });

  assert.deepEqual(await listCommissionMonths(null, db.pool), ["2026-10", "2026-09"]);
  assert.deepEqual(await listCommissionMonths(OTHER_SELLER.email, db.pool), []);
  const september = await listCommissions("2026-09", null, db.pool);
  assert.deepEqual(
    september.map(({ sellerEmail, sellerName, orderNumber, customerName, refund, happenedOn, base, rate, amount, paymentDue, paidAt }) =>
      [sellerEmail, sellerName, orderNumber, customerName, refund, happenedOn, base, rate, amount, paymentDue, paidAt]),
    [[SELLER.email, SELLER.name, "260930-BBMN", "Academia MA", false, "2026-09-30", 26548.67, 0.02, 530.97, "2026-10-05", null]],
  );
  const october = await listCommissions("2026-10", SELLER.email, db.pool);
  assert.deepEqual(october.map((entry) => [entry.happenedOn, entry.amount, entry.paymentDue]), [["2026-10-02", 134.75, "2026-11-10"]]);
  assert.deepEqual(await listCommissions("2026-10", OTHER_SELLER.email, db.pool), []);
  await assert.rejects(() => listCommissions("10/2026", null, db.pool), /Mês inválido/);
  await assert.rejects(() => listCommissions("2026-13", null, db.pool), /Mês inválido/);
});

test("comissões: marcar como paga fecha o que está em aberto do vendedor até aquele mês", { skip }, async () => {
  await assert.rejects(() => payCommissions(OTHER_SELLER.email, "2026-09", FINANCE, db.pool), /Não há comissão em aberto/);
  assert.deepEqual(await payCommissions(SELLER.email, "2026-09", FINANCE, db.pool), { paid: 530.97, entries: 1 });
  const [paid] = await listCommissions("2026-09", null, db.pool);
  assert.ok(paid.paidAt instanceof Date);
  assert.equal(paid.paidBy, FINANCE);
  // Paga uma vez só; outubro continua em aberto.
  await assert.rejects(() => payCommissions(SELLER.email, "2026-09", FINANCE, db.pool), /Não há comissão em aberto/);
  assert.equal((await listCommissions("2026-10", null, db.pool))[0].paidAt, null);
});

test("estorno: pedido com motivo, confirmado pela diretoria; o valor volta a receber e a comissão é devolvida", { skip }, async () => {
  const N = "260930-BBMN";
  const receipts = (await listReceipts(10, db.pool)).filter((item) => item.orderNumber === N);
  assert.deepEqual(receipts.map((item) => [item.label, item.amount, item.state]), [["Parcela 1", 7613.33, "valido"], ["Entrada", 30000, "valido"]]);
  const down = receipts[1];

  await assert.rejects(() => requestRefund(down.id, "  ", FINANCE, db.pool), /Escreva o motivo/);
  await assert.rejects(() => requestRefund(999999, "x", FINANCE, db.pool), /não encontrado, ou já estornado/);
  await requestRefund(down.id, " PIX devolvido pelo banco ", FINANCE, db.pool);
  await assert.rejects(() => requestRefund(down.id, "de novo", FINANCE, db.pool), /já tem estorno pedido ou confirmado/);

  // Pedido não muda nada ainda.
  const [pending] = await listPendingRefunds(db.pool);
  assert.deepEqual(
    [pending.orderNumber, pending.label, pending.receivedOn, pending.amount, pending.reason, pending.requestedBy, pending.customerName],
    [N, "Entrada", "2026-09-30", 30000, "PIX devolvido pelo banco", FINANCE, "Academia MA"],
  );
  assert.equal((await listReceipts(10, db.pool)).find((item) => item.id === down.id)?.state, "estorno-pedido");
  assert.ok(!(await listOpenReceivables(db.pool)).some((item) => item.orderNumber === N && item.label === "Entrada"));

  // Recusado: só o pedido muda, e pode ser pedido de novo.
  await decideRefund(pending.id, false, DIRECTOR, "2026-10-06", db.pool);
  assert.deepEqual(await listPendingRefunds(db.pool), []);
  assert.equal((await listReceipts(10, db.pool)).find((item) => item.id === down.id)?.state, "valido");
  await assert.rejects(() => decideRefund(pending.id, true, DIRECTOR, "2026-10-06", db.pool), /já foi decidido/);

  await requestRefund(down.id, "PIX devolvido pelo banco", FINANCE, db.pool);
  const [again] = await listPendingRefunds(db.pool);
  await decideRefund(again.id, true, DIRECTOR, "2026-10-06", db.pool);
  await assert.rejects(() => decideRefund(again.id, false, DIRECTOR, "2026-10-06", db.pool), /já foi decidido/);

  // O recebimento continua lá, marcado; a entrada volta para a lista a receber.
  assert.equal((await listReceipts(10, db.pool)).find((item) => item.id === down.id)?.state, "estornado");
  assert.deepEqual(
    (await listOpenReceivables(db.pool)).filter((item) => item.orderNumber === N).map((item) => [item.label, item.amount]),
    [["Entrada", 30000], ["2/2", 7613.34]],
  );
  const { rows } = await db.pool.query(
    "SELECT amount::float AS amount, amount_without_ipi::float AS base, reason, requested_by, confirmed_by FROM refunds",
  );
  assert.deepEqual(rows, [{ amount: -30000, base: -26548.67, reason: "PIX devolvido pelo banco", requested_by: FINANCE, confirmed_by: DIRECTOR }]);
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM receipts")).rows[0].count), 2);

  // A comissão de setembro já tinha sido paga: a devolução entra em outubro, negativa, e desconta do próximo pagamento.
  const october = await listCommissions("2026-10", SELLER.email, db.pool);
  assert.deepEqual(
    october.map((entry) => [entry.refund, entry.happenedOn.slice(0, 7), entry.base, entry.amount, entry.paymentDue]),
    [[false, "2026-10", 6737.46, 134.75, "2026-11-10"], [true, "2026-10", -26548.67, -530.97, "2026-11-10"]],
  );
  await assert.rejects(() => payCommissions(SELLER.email, "2026-10", FINANCE, db.pool), /saldo em aberto não é positivo/);
  assert.ok((await listCommissions("2026-10", null, db.pool)).every((entry) => entry.paidAt === null));
  // Em Contas a pagar a comissão devida aparece por vendedor e mês: aqui, o saldo negativo de outubro.
  assert.deepEqual(await listCommissionsDue(db.pool), [
    { sellerEmail: SELLER.email, sellerName: SELLER.name, month: "2026-10", dueDate: "2026-11-10", amount: -396.22 },
  ]);
  // Em novembro, o saldo negativo de outubro aparece como pendência.
  assert.deepEqual([...(await listCarriedBalances("2026-11", null, db.pool))], [[SELLER.email, -396.22]]);
  assert.deepEqual([...(await listCarriedBalances("2026-10", null, db.pool))], []);

  // A entrada é recebida de novo em novembro: o pagamento de novembro já vem com o desconto.
  const [entrada] = (await listOpenReceivables(db.pool)).filter((item) => item.orderNumber === N);
  await recordReceipt(entrada.id, { receivedOn: "2026-11-03", method: "PIX", note: null }, FINANCE, "2026-11-04", db.pool);
  assert.deepEqual(await payCommissions(SELLER.email, "2026-11", FINANCE, db.pool), { paid: 134.75, entries: 3 });
  assert.deepEqual([...(await listCarriedBalances("2026-12", null, db.pool))], []);
});

test("dashboard: cada pedido com datas, vendedor, destino e itens; o lucro soma os fechados com o custo da versão de cada um", { skip }, async () => {
  const all = await listDashboardOrders(ALL, db.pool);
  const printed = all.find((item) => item.number === "260930-BBMN");
  assert.ok(printed);
  assert.deepEqual(
    [printed.status, printed.sellerName, printed.deliveryUf, printed.discount, printed.ipi, /^\d{4}-\d{2}-\d{2}$/.test(printed.createdOn), printed.closedOn === printed.createdOn],
    ["fechado", SELLER.name, "MA", 0, 0.13, true, true],
  );
  assert.deepEqual(printed.items, [
    { name: "Equipamento LD-B001", quantity: 1, tableUnitPrice: 19204.61 },
    { name: "Equipamento LD-B002", quantity: 1, tableUnitPrice: 20818.99 },
  ]);
  assert.ok((await listDashboardOrders(THEIRS, db.pool)).every((item) => item.sellerEmail === OTHER_SELLER.email));
  // Nada de custo na leitura do dashboard.
  assert.doesNotMatch(JSON.stringify(all), /cost|profit|china/i);

  // O lucro do pedido do print é o do quadro do diretor: 8.117,99 sobre 40.023,60.
  const profit = await ordersProfit(["260930-BBMN", "999999-NADA"], db.pool);
  assert.deepEqual([profit.netSale.toFixed(2), profit.netProfit.toFixed(2)], ["40023.60", "8117.99"]);
  assert.deepEqual(await ordersProfit([], db.pool), { netSale: 0, netProfit: 0 });
});

test("simulador: a equipe recebe só o nome da faixa, calculado no servidor", { skip }, async () => {
  const base = { productId: ID["LD-B001"], quantity: 1, deliveryUf: "MA" as const, taxpayer: false, freight: 0 };
  assert.equal(await simulationBand(1, { ...base, discount: 0 }, db.pool), "na-meta");
  assert.equal(await simulationBand(1, { ...base, discount: 0.3 }, db.pool), "abaixo-da-meta");
  assert.equal(await simulationBand(1, { ...base, discount: 0.6 }, db.pool), "prejuizo");
  // Frete por nossa conta pesa na faixa; sem estado não há faixa.
  assert.equal(await simulationBand(1, { ...base, discount: 0.15 }, db.pool), "na-meta");
  assert.equal(await simulationBand(1, { ...base, discount: 0.15, freight: 5000 }, db.pool), "prejuizo");
  assert.equal(await simulationBand(1, { ...base, discount: 0, deliveryUf: null }, db.pool), null);
  await assert.rejects(() => simulationBand(1, { ...base, productId: ID["LD-B009"], discount: 0 }, db.pool), /não está na tabela v1/);
});

test("regras de aprovação da empresa: alçada do gerente, frete e diretoria que já aprova ao fechar", { skip }, async () => {
  const initial = await loadApprovalPolicy(db.pool);
  assert.deepEqual(initial, { belowTarget: true, freight: false, managerLimit: "lucro", directorSelfApproves: false });

  // Gerente só até a meta: um pedido abaixo da meta passa a ser só da diretoria.
  const sent = await sendToClosing("261005-ALCA", 0.3, 12000);
  assert.equal(sent.status, "aguardando_aprovacao");
  const queued = async () => (await listPendingApprovals(db.pool)).find((entry) => entry.order.number === "261005-ALCA");
  assert.deepEqual([(await queued())?.band, (await queued())?.directorOnly], ["abaixo-da-meta", false]);
  await saveApprovalPolicy({ ...initial, managerLimit: "meta" }, DIRECTOR, db.pool);
  assert.equal((await queued())?.directorOnly, true);
  await assert.rejects(() => decideApproval("261005-ALCA", { approve: true, comment: null }, MANAGER, db.pool), /passa da sua alçada/);
  await decideApproval("261005-ALCA", { approve: true, comment: null }, BOSS, db.pool);

  // Frete por nossa conta vira motivo; lucro abaixo da meta deixa de ser.
  await saveApprovalPolicy({ belowTarget: false, freight: true, managerLimit: "lucro", directorSelfApproves: true }, DIRECTOR, db.pool);
  const N = await createOrder({ seller: SELLER, version: 1, productId: ID["LD-B001"], quantity: 1 }, numbers("261005-FRET"), db.pool);
  await linkOrderCustomer(N, customerMa, SELLER.email, MINE, db.pool);
  await saveOrderTerms(N, { ...TERMS, freight: 300 }, SELLER.email, MINE, db.pool);
  await savePayment(N, { ...PAYMENT, downPayment: 20000 }, SELLER.email, MINE, db.pool);
  assert.deepEqual((await loadOrderStanding(await order(N), db.pool)).policy, { needsApproval: true, reasons: ["frete-por-nossa-conta"] });

  // O vendedor fechando: vai para aprovação. A diretoria fechando: já fica aprovado, com registro.
  assert.equal((await closeOrder(N, SELLER.email, MINE, db.pool)).status, "aguardando_aprovacao");
  await reopenOrder(N, SELLER.email, MINE, db.pool);
  assert.deepEqual(await closeOrder(N, DIRECTOR, ALL, db.pool, { isDirector: true }), { status: "fechado", reasons: ["frete-por-nossa-conta"], missing: [] });
  const { rows } = await db.pool.query(
    "SELECT a.status, a.decided_by, a.decided_role, a.reasons FROM order_approvals a JOIN orders o ON o.id = a.order_id WHERE o.number = $1",
    [N],
  );
  assert.deepEqual(rows, [{ status: "aprovado", decided_by: DIRECTOR, decided_role: "DIRETORIA", reasons: ["frete-por-nossa-conta"] }]);
  assert.equal((await listOpenReceivables(db.pool)).filter((item) => item.orderNumber === N).length, 3);

  await assert.rejects(() => saveApprovalPolicy({ ...initial, managerLimit: "tudo" as never }, DIRECTOR, db.pool), /até onde o gerente aprova/);
  await saveApprovalPolicy(initial, DIRECTOR, db.pool);
});

test("recebimento parcial: a parcela fica em aberto pelo que falta, e a comissão nasce de cada parte", { skip }, async () => {
  const N = "261005-FRET";
  const [down] = (await listOpenReceivables(db.pool)).filter((item) => item.orderNumber === N);
  assert.deepEqual([down.label, down.amount, down.open], ["Entrada", 20000, 20000]);

  await assert.rejects(() => recordReceipt(down.id, { receivedOn: "2026-10-05", method: null, note: null, amount: 20000.01 }, FINANCE, "2026-10-06", db.pool), /não pode ser maior que o que está em aberto/);
  await assert.rejects(() => recordReceipt(down.id, { receivedOn: "2026-10-05", method: null, note: null, amount: 0 }, FINANCE, "2026-10-06", db.pool), /maior que zero/);

  // Entram 5.000 dos 20.000: comissão sobre os 5.000, e a entrada continua na lista com 15.000.
  assert.deepEqual(await recordReceipt(down.id, { receivedOn: "2026-10-05", method: "PIX", note: null, amount: 5000 }, FINANCE, "2026-10-06", db.pool), { commission: 88.5 });
  const after = (await listOpenReceivables(db.pool)).find((item) => item.id === down.id);
  assert.deepEqual([after?.amount, after?.open], [20000, 15000]);
  // Com valor recebido, mesmo em parte, o pedido não se reabre.
  await assert.rejects(() => reopenOrder(N, DIRECTOR, ALL, db.pool), /já tem valor recebido/);

  // O resto entra sem dizer valor: é tudo o que está em aberto, e a entrada sai da lista.
  assert.deepEqual(await recordReceipt(down.id, { receivedOn: "2026-10-06", method: "PIX", note: null }, FINANCE, "2026-10-06", db.pool), { commission: 265.49 });
  assert.ok(!(await listOpenReceivables(db.pool)).some((item) => item.id === down.id));
  const parts = (await listReceipts(10, db.pool)).filter((item) => item.orderNumber === N);
  assert.deepEqual(parts.map((item) => [item.label, item.amount, item.commission]), [["Entrada", 15000, 265.49], ["Entrada", 5000, 88.5]]);

  // Estornar a primeira parte devolve só ela: a entrada volta a ter 5.000 em aberto.
  await requestRefund(parts[1].id, "PIX em duplicidade", FINANCE, db.pool);
  const [request] = await listPendingRefunds(db.pool);
  await decideRefund(request.id, true, DIRECTOR, "2026-10-06", db.pool);
  const back = (await listOpenReceivables(db.pool)).find((item) => item.id === down.id);
  assert.deepEqual([back?.amount, back?.open], [20000, 5000]);
});

test("cliente com pedido não se remove", { skip }, async () => {
  await assert.rejects(() => deleteCustomer(customerMa, db.pool), /tem pedidos e não pode ser removido/);
  assert.equal((await order("260930-BBMN")).customer?.id, customerMa);
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

test("indicadores: recebido no mês não conta estorno confirmado; comissão futura é do que falta receber, e a do vendedor cabe na da equipe", { skip }, async () => {
  const { receivedInMonth, futureCommission, listReceipts: receipts, listOpenReceivables: open } = await import("@/lib/db/receivables");
  const all = await receipts(500, db.pool);
  const month = all[0]?.receivedOn.slice(0, 7) ?? "2026-10";
  const expected = all.filter((receipt) => receipt.receivedOn.startsWith(month) && receipt.state !== "estornado").reduce((sum, receipt) => sum + receipt.amount, 0);
  assert.equal(Math.round((await receivedInMonth(month, db.pool)) * 100), Math.round(expected * 100));
  assert.equal(await receivedInMonth("1999-01", db.pool), 0);

  const team = await futureCommission(null, db.pool);
  const stillOpen = (await open(db.pool)).reduce((sum, item) => sum + item.open, 0);
  assert.ok(team >= 0 && team <= stillOpen);
  assert.equal(team > 0, stillOpen > 0);
  assert.equal(await futureCommission("ninguem@teste.local", db.pool), 0);
});

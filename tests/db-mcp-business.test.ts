import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Session } from "@/lib/auth/access";
import { listPendingActivities, setActivityDone } from "@/lib/db/funnel";
import { addOrderItem, createOrder, getOrder } from "@/lib/db/orders";
import { loadParams } from "@/lib/db/params";
import { createPayable } from "@/lib/db/payables";
import { loadPublishedSnapshot, publishPriceTable } from "@/lib/db/price-table";
import { createProduct, listProducts } from "@/lib/db/products";
import { decideRefund, recordReceipt, requestRefund } from "@/lib/db/receivables";
import { isoDate } from "@/lib/format";
import { callTool, toolsOf } from "@/lib/mcp/tools";
import { executeConfirmation, prepareConfirmation } from "@/lib/mcp/confirmation";
import { directorOf } from "@/lib/order-quote";
import { draftPriceTable } from "@/lib/price-table";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const who = (role: Session["role"], email: string): Session => ({ role, email, name: email, items: null, denied: [], profile: null, tenant: { slug: "acme", name: "Acme" }, companies: 1 });
const SELLER = who("VENDEDOR", "ana@acme.test"), OTHER = who("VENDEDOR", "caio@acme.test"), BOSS = who("DIRETORIA", "diretoria@acme.test"), FIN = who("FINANCEIRO", "financeiro@acme.test");
let db: TestDb, otherDb: TestDb, productId: number, product2: number, customerId: number, serial = 0;
const today = () => isoDate(new Date());
before(async () => {
  if (skip) return;
  db = await openTestDb("mcpbusiness");
  otherDb = await openTestDb("mcpother");
  productId = (await createProduct({ code: "MC-001", name: "Equipamento teste", advisoryCost: 8000, taxCredit: 0.2 }, BOSS.email, db.pool)).id;
  product2 = (await createProduct({ code: "MC-002", name: "Segundo equipamento", advisoryCost: 12000, taxCredit: 0.25 }, BOSS.email, db.pool)).id;
  await publishPriceTable(draftPriceTable(await loadParams(db.pool), await listProducts({ active: true }, db.pool)), 1, BOSS.email, db.pool);
  customerId = Number((await db.pool.query("INSERT INTO customers (kind, document, name, updated_by) VALUES ('PJ','48240052000161','Cliente fictício', $1) RETURNING id", [SELLER.email])).rows[0].id);
});
after(async () => { if (!skip) { await db.close(); await otherDb.close(); } });

// Every call gets a pinned connection, like the real HTTP route. Concurrent calls get different clients.
async function ask(session: Session, name: string, args: Record<string, unknown>, database = db): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const client = await database.pool.connect();
  try { return await callTool(session, client, name, args) as Record<string, unknown>; }
  finally { client.release(); }
}
async function fixture(owner = SELLER) {
  const number = `261017-M${String(++serial).padStart(3, "0")}`;
  await createOrder({ seller: owner, version: 1, productId, quantity: 2 }, () => number, db.pool);
  await db.pool.query("UPDATE orders SET customer_id = $2, status = 'fechado', closed_at = now(), delivery_uf = 'SP', production_days = 30, freight = 100 WHERE number = $1", [number, customerId]);
  const order = (await getOrder(number, { sellerEmail: null }, db.pool))!;
  const id = Number((await db.pool.query("INSERT INTO receivables (order_id, kind, number, due_date, amount, method, updated_by) VALUES ($1,'entrada',0,'2026-10-17',1000,'PIX',$2) RETURNING id", [order.id, owner.email])).rows[0].id);
  return { number, id, order };
}

test("novas ferramentas respeitam telas, poder de custos, escopo da equipe e perfil financeiro", async () => {
  const names = (session: Session) => toolsOf(session).map((tool) => tool.name);
  assert.ok(names(BOSS).includes("pedidos_custo_margem"));
  assert.ok(!names({ ...BOSS, denied: ["custos"] }).includes("pedidos_custo_margem"));
  for (const session of [SELLER, OTHER, FIN, who("GERENTE_COMERCIAL", "gerente@acme.test")]) {
    assert.ok(!names(session).includes("pedidos_custo_margem"));
    assert.ok(!names(session).includes("fluxo_de_caixa"));
  }
  assert.ok(!names({ ...BOSS, items: ["relatorios", "recebimentos"] }).includes("fluxo_de_caixa"));
  assert.ok(!names({ ...SELLER, items: ["pedidos"] }).includes("tarefa_criar_em_pedido"));
  assert.ok(!names(SELLER).includes("recebimento_dar_baixa"));
});

test("baixa exige prévia, identidade e confirmação; parcial gera comissão uma vez mesmo com confirmação concorrente", { skip }, async () => {
  const { id, number } = await fixture();
  const preview = await ask(FIN, "recebimento_dar_baixa", { id, valor: 250, data: today(), forma: "PIX", observacao: "Teste fictício" });
  assert.equal(preview.resumo.saldo_depois, 750);
  assert.equal((await db.pool.query("SELECT count(*) FROM receipts WHERE receivable_id = $1", [id])).rows[0].count, "0");
  await assert.rejects(ask(BOSS, "recebimento_dar_baixa", { confirmar: preview.confirmar }), /não encontrada/);
  await assert.rejects(ask(FIN, "recebimento_dar_baixa", { confirmar: preview.confirmar, valor: 999 }), /apenas o código/);
  await assert.rejects(ask(FIN, "recebimento_dar_baixa", { confirmar: preview.confirmar }, otherDb), /não encontrada/);
  const results = await Promise.all([ask(FIN, "recebimento_dar_baixa", { confirmar: preview.confirmar }), ask(FIN, "recebimento_dar_baixa", { confirmar: preview.confirmar })]);
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual([results[0].pedido, results[0].saldo, results[0].valor], [number, 750, 250]);
  assert.equal((await db.pool.query("SELECT count(*) FROM receipts WHERE receivable_id = $1", [id])).rows[0].count, "1");
  const commissions = (await db.pool.query("SELECT m.* FROM commissions m JOIN receipts p ON p.id = m.receipt_id WHERE p.receivable_id = $1", [id])).rows;
  assert.equal(commissions.length, 1);
  assert.ok(Number(commissions[0].amount) > 0);
  const listed = await ask(FIN, "recebimentos_em_aberto", {});
  const row = (listed as unknown as { id: number; valor: number; valor_original: number }[]).find((item) => item.id === id)!;
  assert.deepEqual([row.valor, row.valor_original], [750, 1000]);
  const stored = (await db.pool.query("SELECT user_email, confirmed_at, result, token_hash FROM mcp_confirmations WHERE result->>'recebimento_id' = $1", [String(id)])).rows[0];
  assert.equal(stored.user_email, FIN.email);
  assert.ok(stored.confirmed_at && stored.result && stored.token_hash !== preview.confirmar);
  const full = await ask(FIN, "recebimento_dar_baixa", { id, valor: 750, data: today(), forma: "PIX" });
  assert.equal((await ask(FIN, "recebimento_dar_baixa", { confirmar: full.confirmar })).saldo, 0);
  assert.equal((await db.pool.query("SELECT status FROM receivables WHERE id = $1", [id])).rows[0].status, "recebida");
});

test("baixa recusa entrada inválida, vencida, forma desligada e mudanças após prévia", { skip }, async () => {
  const { id } = await fixture();
  const base = { id, valor: 50, data: today(), forma: "PIX" };
  for (const change of [{ valor: 0 }, { valor: -1 }, { valor: 1.001 }, { valor: "50" }, { valor: 1001 }, { data: "2026-02-30" }, { data: "2999-01-01" }, { forma: "Na entrega" }, { id: "1;DROP" }]) await assert.rejects(ask(FIN, "recebimento_dar_baixa", { ...base, ...change }));
  const expired = await ask(FIN, "recebimento_dar_baixa", base);
  await db.pool.query("UPDATE mcp_confirmations SET expires_at = now() - interval '1 second' WHERE confirmed_at IS NULL");
  await assert.rejects(ask(FIN, "recebimento_dar_baixa", { confirmar: expired.confirmar }), /vencida/);
  const stale = await ask(FIN, "recebimento_dar_baixa", base);
  await recordReceipt(id, { amount: 10, receivedOn: today(), method: "PIX", note: null }, BOSS.email, today(), db.pool);
  await assert.rejects(ask(FIN, "recebimento_dar_baixa", { confirmar: stale.confirmar }), /mudou/);
  const disabled = await ask(FIN, "recebimento_dar_baixa", base);
  await db.pool.query("UPDATE payment_methods SET active = false WHERE label = 'PIX'");
  await assert.rejects(ask(FIN, "recebimento_dar_baixa", { confirmar: disabled.confirmar }), /ativo/);
  await db.pool.query("UPDATE payment_methods SET active = true WHERE label = 'PIX'");
  assert.equal((await db.pool.query("SELECT count(*) FROM receipts WHERE receivable_id = $1", [id])).rows[0].count, "1");
});

test("tarefa sem oportunidade pertence ao pedido; confirmação, deduplicação, reassociação e revisão são verificadas", { skip }, async () => {
  const { number, order } = await fixture();
  const args = { pedido: number, texto: "Cobrar entrada", para: today() };
  await assert.rejects(ask(OTHER, "tarefa_criar_em_pedido", args), /não encontrado/);
  await assert.rejects(ask(SELLER, "tarefa_criar_em_pedido", { ...args, para: "2026-02-30" }), /data válida/);
  const first = await ask(SELLER, "tarefa_criar_em_pedido", args);
  const second = await ask(SELLER, "tarefa_criar_em_pedido", args);
  assert.equal((await listPendingActivities({ ownerEmail: SELLER.email }, db.pool)).filter((task) => task.orderNumber === number).length, 0);
  const [created, duplicate] = await Promise.all([ask(SELLER, "tarefa_criar_em_pedido", { confirmar: first.confirmar }), ask(SELLER, "tarefa_criar_em_pedido", { confirmar: second.confirmar })]);
  assert.equal(created.tarefa_id, duplicate.tarefa_id);
  assert.equal(Number(created.criada) + Number(duplicate.criada), 1);
  assert.deepEqual(await ask(SELLER, "tarefa_criar_em_pedido", { confirmar: first.confirmar }), created);
  const pending = (await listPendingActivities({ ownerEmail: SELLER.email }, db.pool)).filter((task) => task.orderNumber === number);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].opportunityId, null);
  assert.equal(pending[0].createdBy, SELLER.email);
  const stale = await ask(SELLER, "tarefa_criar_em_pedido", { ...args, texto: "Outra tarefa" });
  await db.pool.query("UPDATE orders SET seller_email = $2, updated_at = now() WHERE id = $1", [order.id, OTHER.email]);
  await assert.rejects(ask(SELLER, "tarefa_criar_em_pedido", { confirmar: stale.confirmar }), /não encontrado/);
  assert.equal((await listPendingActivities({ ownerEmail: SELLER.email }, db.pool)).filter((task) => task.orderNumber === number).length, 0);
  assert.equal((await listPendingActivities({ ownerEmail: OTHER.email }, db.pool)).filter((task) => task.orderNumber === number).length, 1);
  await assert.rejects(setActivityDone(created.tarefa_id, true, SELLER.email, { ownerEmail: SELLER.email }, db.pool), /não encontrada/);
  await setActivityDone(created.tarefa_id, true, OTHER.email, { ownerEmail: OTHER.email }, db.pool);
});

test("escrita e confirmação são atômicas: falha posterior reverte ambas e permite tentar novamente", { skip }, async () => {
  const { order } = await fixture();
  const preview = await prepareConfirmation("teste", SELLER.email, { orderId: order.id }, { texto: "Teste de reversão" }, db.pool);
  const client = await db.pool.connect();
  try {
    const insert = async () => {
      const { rows } = await client.query("INSERT INTO opportunity_activities (order_id, kind, title, owner_email, created_by) VALUES ($1,'tarefa','Atomicidade', $2, $2) RETURNING id", [order.id, SELLER.email]);
      return { id: Number(rows[0].id) };
    };
    await assert.rejects(executeConfirmation("teste", SELLER.email, preview.confirmar, client, async () => { await insert(); throw new Error("Falha de teste depois da escrita"); }), /Falha de teste/);
    assert.equal((await client.query("SELECT count(*) FROM opportunity_activities WHERE order_id = $1", [order.id])).rows[0].count, "0");
    const result = await executeConfirmation("teste", SELLER.email, preview.confirmar, client, insert);
    assert.ok(result);
    assert.equal((await client.query("SELECT count(*) FROM opportunity_activities WHERE order_id = $1", [order.id])).rows[0].count, "1");
  } finally { client.release(); }
});

test("custo/margem reproduz o motor e a versão do pedido, sem consulta de custo para perfil negado", { skip }, async () => {
  const { number, order } = await fixture();
  // The fixture starts closed to support receipts; briefly open it only to add another product.
  await db.pool.query("UPDATE orders SET status = 'em_negociacao', closed_at = NULL WHERE id = $1", [order.id]);
  await addOrderItem(number, product2, 3, BOSS.email, { sellerEmail: null }, db.pool);
  const current = (await getOrder(number, { sellerEmail: null }, db.pool))!;
  const snapshot = (await loadPublishedSnapshot(1, db.pool))!;
  const board = directorOf(current, snapshot)!;
  const result = await ask(BOSS, "pedidos_custo_margem", { pedido: number });
  assert.deepEqual([result.venda_sem_ipi, result.custo_equipamentos, result.lucro_liquido, result.margem], [board.quote.netSale, board.quote.equipmentCost, board.quote.netProfit, board.quote.netProfitRate]);
  assert.equal(result.itens.length, 2);
  assert.equal(result.itens.reduce((sum: number, item: { frete_rateado: number }) => sum + item.frete_rateado, 0), 100);
  const noQuery = { query: async () => { throw new Error("Consulta indevida de custo"); } };
  for (const denied of [SELLER, FIN, { ...BOSS, denied: ["custos"] }]) await assert.rejects(callTool(denied, noQuery, "pedidos_custo_margem", { pedido: number }), /Ferramenta desconhecida/);
  await db.pool.query("UPDATE products SET advisory_cost = advisory_cost * 2 WHERE id = $1", [productId]);
  assert.deepEqual(await ask(BOSS, "pedidos_custo_margem", { pedido: number }), result);
});

test("caixa agrega saldo líquido de parcial/estorno, contas e comissões, sem duplicar atrasados nem ignorar sem data", { skip }, async () => {
  // Isolate the business amounts of this scenario from earlier tests.
  await db.pool.query("UPDATE commissions SET paid_at = now(), paid_by = $1 WHERE paid_at IS NULL", [BOSS.email]);
  await db.pool.query("UPDATE receivables SET status = 'cancelada'");
  const { id, order } = await fixture();
  await db.pool.query("UPDATE receivables SET due_date = '2026-10-20' WHERE id = $1", [id]);
  await recordReceipt(id, { amount: 100, receivedOn: today(), method: "PIX", note: null }, FIN.email, today(), db.pool);
  const receiptId = Number((await db.pool.query("SELECT id FROM receipts WHERE receivable_id = $1", [id])).rows[0].id);
  await requestRefund(receiptId, "Teste de estorno", FIN.email, db.pool);
  const refundId = Number((await db.pool.query("SELECT id FROM refund_requests WHERE receipt_id = $1", [receiptId])).rows[0].id);
  await decideRefund(refundId, true, BOSS.email, today(), db.pool);
  await recordReceipt(id, { amount: 250, receivedOn: today(), method: "PIX", note: null }, FIN.email, today(), db.pool);
  for (const [part, due, amount] of [[1, "2026-09-01", 20], [2, null, 30], [3, "2026-11-01", 40]] as const) await db.pool.query("INSERT INTO receivables (order_id, kind, number, due_date, amount, updated_by) VALUES ($1,'parcela',$2,$3,$4,$5)", [order.id, part, due, amount, BOSS.email]);
  await createPayable({ description: "Conta fictícia", supplierId: null, category: "Teste", amount: 200, dueDate: "2026-10-21", method: "PIX" }, FIN.email, db.pool);
  const month = await ask(BOSS, "fluxo_de_caixa", { de: "2026-10-01", ate: "2026-10-31" });
  assert.deepEqual([month.periodos[0].entradas, month.periodos[0].contas_a_pagar, month.periodos[0].saldo_previsto], [750, 200, 550]);
  assert.equal(month.anteriores_ao_inicio.entradas, 20);
  assert.equal(month.sem_vencimento.entradas, 30);
  const week = await ask(BOSS, "fluxo_de_caixa", { de: "2026-10-20", ate: "2026-10-21", agrupar: "semana" });
  assert.equal(week.periodos[0].periodo, "2026-10-19");
  assert.equal(week.periodos[0].entradas, 750);
  const november = await ask(BOSS, "fluxo_de_caixa", { de: "2026-11-01", ate: "2026-11-30" });
  const due = Number((await db.pool.query("SELECT sum(amount) FROM commissions WHERE paid_at IS NULL")).rows[0].sum);
  assert.equal(november.periodos[0].comissoes, due);
  for (const args of [{ de: "2026-10-32", ate: "2026-11-01" }, { de: "2027-01-01", ate: "2026-01-01" }, { de: "2026-01-01", ate: "2028-01-01" }]) await assert.rejects(ask(BOSS, "fluxo_de_caixa", args));
});

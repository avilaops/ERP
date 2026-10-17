import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Session } from "@/lib/auth/access";
import { createOpportunity, listStages, moveOpportunity } from "@/lib/db/funnel";
import { recordVerdict, saveSignedInvoice } from "@/lib/db/invoices";
import { saveMaterial } from "@/lib/db/materials";
import { createOrder, getOrder, listOrders } from "@/lib/db/orders";
import { loadParams } from "@/lib/db/params";
import { createPayable, payPayable, updatePayable } from "@/lib/db/payables";
import { loadPublishedTable, publishPriceTable } from "@/lib/db/price-table";
import { createProduct, listProducts } from "@/lib/db/products";
import { sendToProduction, listProductionOrders, listProductionStages, moveProductionOrder } from "@/lib/db/production";
import { recordReceipt } from "@/lib/db/receivables";
import { shipOrder } from "@/lib/db/stock";
import { isoDate } from "@/lib/format";
import { callTool, toolsOf } from "@/lib/mcp/tools";
import { saleOf } from "@/lib/order-quote";
import { draftPriceTable } from "@/lib/price-table";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const who = (role: Session["role"], email: string): Session => ({ role, email, name: email, items: null, denied: [], profile: null, tenant: { slug: "acme", name: "Acme" }, companies: 1 });
const ANA = who("VENDEDOR", "ana@acme.test"), CAIO = who("VENDEDOR", "caio@acme.test"), FIN = who("FINANCEIRO", "fin@acme.test"), BOSS = who("DIRETORIA", "boss@acme.test");
let db: TestDb, other: TestDb, productId: number, customerId: number, serial = 0;
before(async () => {
  if (skip) return;
  db = await openTestDb("mcpops"); other = await openTestDb("mcpopsother");
  productId = (await createProduct({ code: "MC-100", name: "Produto comercial", advisoryCost: 10000, taxCredit: 0.2 }, BOSS.email, db.pool)).id;
  await publishPriceTable(draftPriceTable(await loadParams(db.pool), await listProducts({ active: true }, db.pool)), 1, BOSS.email, db.pool);
  customerId = Number((await db.pool.query("INSERT INTO customers (kind, document, name, updated_by) VALUES ('PJ','48240052000161','Cliente de demonstração',$1) RETURNING id", [ANA.email])).rows[0].id);
});
after(async () => { if (!skip) { await db.close(); await other.close(); } });
// Arbitrary response shapes are asserted by tool below, including field allowlists.
async function ask(session: Session, name: string, args: Record<string, unknown>, database = db): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const client = await database.pool.connect();
  try { return await callTool(session, client, name, args); } finally { client.release(); }
}
const today = () => isoDate(new Date());
async function fixture(owner = ANA) {
  const number = `261017-Q${String(++serial).padStart(3, "0")}`;
  await createOrder({ seller: owner, version: 1, productId, quantity: 2 }, () => number, db.pool);
  await db.pool.query("UPDATE orders SET customer_id=$2, status='fechado', closed_at=now(), delivery_uf='SP', production_days=30 WHERE number=$1", [number, customerId]);
  const order = (await getOrder(number, { sellerEmail: null }, db.pool))!;
  const sale = saleOf(order, (await loadPublishedTable(1, db.pool))!);
  await db.pool.query("INSERT INTO order_closings (order_id, closed_by, invoice_total) VALUES ($1,$2,$3)", [order.id, BOSS.email, sale.invoiceTotal]);
  const id = Number((await db.pool.query("INSERT INTO receivables (order_id, kind, number, due_date, amount, method, updated_by) VALUES ($1,'entrada',0,'2026-09-01',1000,'PIX',$2) RETURNING id", [order.id, owner.email])).rows[0].id);
  return { number, order, id, sale };
}

test("consultas e financeiro: permissões adicionais não ampliam telas ou poderes de vendedores", () => {
  const names = (s: Session) => toolsOf(s).map((t) => t.name);
  for (const tool of ["contas_a_pagar_lancar", "contas_a_pagar_dar_baixa", "cobranca_gerar_mensagem", "inadimplencia_resumo", "vendas_resumo", "funil_conversao", "descontos_fora_da_regra", "pedidos_suspeitos", "compras_estoque_minimo", "entregas_agenda"]) assert.ok(!names(ANA).includes(tool), tool);
  assert.ok(!names({ ...FIN, items: ["relatorios"] }).includes("nota_fiscal_status"));
  assert.ok(!names({ ...BOSS, denied: ["pedidos-da-equipe"] }).includes("vendas_resumo"));
});

test("conta a pagar: prévia sem escrita, listas ativas, confirmação concorrente e repetição sem duplicar", { skip }, async () => {
  const choices = await ask(FIN, "contas_a_pagar_lancar", {});
  assert.ok(choices.categorias.length && choices.meios.includes("PIX"));
  const args = { descricao: "Serviço fictício", categoria: choices.categorias[0], valor: 200, vencimento: today(), forma: "PIX" };
  for (const change of [{ valor: -1 }, { valor: 0.001 }, { vencimento: "2026-02-30" }, { categoria: "Inexistente" }, { fornecedor_id: 999999 }, { forma: "Na entrega" }]) await assert.rejects(ask(FIN, "contas_a_pagar_lancar", { ...args, ...change }));
  const preview = await ask(FIN, "contas_a_pagar_lancar", args);
  assert.equal((await db.pool.query("SELECT count(*) FROM payables")).rows[0].count, "0");
  await assert.rejects(ask(BOSS, "contas_a_pagar_lancar", { confirmar: preview.confirmar }), /não encontrada/);
  await assert.rejects(ask(FIN, "contas_a_pagar_lancar", { confirmar: preview.confirmar }, other), /não encontrada/);
  const [a, b] = await Promise.all([ask(FIN, "contas_a_pagar_lancar", { confirmar: preview.confirmar }), ask(FIN, "contas_a_pagar_lancar", { confirmar: preview.confirmar })]);
  assert.deepEqual(a, b);
  assert.equal((await db.pool.query("SELECT count(*) FROM payables")).rows[0].count, "1");
  const list = await ask(FIN, "contas_a_pagar_em_aberto", {});
  assert.equal(list[0].id, a.conta_id);
  const pay = await ask(FIN, "contas_a_pagar_dar_baixa", { id: a.conta_id, valor: 205.25, data: today(), forma: "PIX" });
  assert.equal(pay.resumo.valor_da_conta, 200);
  const [paid, repeated] = await Promise.all([ask(FIN, "contas_a_pagar_dar_baixa", { confirmar: pay.confirmar }), ask(FIN, "contas_a_pagar_dar_baixa", { confirmar: pay.confirmar })]);
  assert.deepEqual(paid, repeated);
  assert.equal(paid.valor_pago, 205.25);
  const row = (await db.pool.query("SELECT status, paid_amount, updated_by FROM payables WHERE id=$1", [a.conta_id])).rows[0];
  assert.deepEqual([row.status, Number(row.paid_amount), row.updated_by], ["paga", 205.25, FIN.email]);
});

test("contas: desativação e edições concorrentes invalidam prévia e não registram pagamento", { skip }, async () => {
  const choices = await ask(FIN, "contas_a_pagar_lancar", {});
  const args = { descricao: "Outra conta fictícia", categoria: choices.categorias[0], valor: 300, vencimento: today(), forma: "PIX" };
  const disabled = await ask(FIN, "contas_a_pagar_lancar", args);
  await db.pool.query("UPDATE payable_categories SET active=false WHERE label=$1", [args.categoria]);
  await assert.rejects(ask(FIN, "contas_a_pagar_lancar", { confirmar: disabled.confirmar }), /Categoria/);
  await db.pool.query("UPDATE payable_categories SET active=true WHERE label=$1", [args.categoria]);
  const bill = await createPayable({ description: args.descricao, category: args.categoria, amount: 300, dueDate: today(), method: "PIX", supplierId: null }, FIN.email, db.pool);
  const preview = await ask(FIN, "contas_a_pagar_dar_baixa", { id: bill.id, valor: 300, data: today(), forma: "PIX" });
  await updatePayable(bill.id, { ...bill, amount: 400 }, FIN.email, db.pool);
  await assert.rejects(ask(FIN, "contas_a_pagar_dar_baixa", { confirmar: preview.confirmar }), /mudou/);
  const second = await ask(FIN, "contas_a_pagar_dar_baixa", { id: bill.id, valor: 400, data: today(), forma: "PIX" });
  await payPayable(bill.id, { paidOn: today(), paidAmount: 400, method: "PIX" }, BOSS.email, today(), db.pool);
  await assert.rejects(ask(FIN, "contas_a_pagar_dar_baixa", { confirmar: second.confirmar }), /aberto/);
  await assert.rejects(ask(FIN, "contas_a_pagar_dar_baixa", { id: bill.id, valor: 400, data: "2999-01-01", forma: "PIX" }), /futuro/);
});

test("catálogo e pedido: projeções comerciais não vazam custo e vendedor não alcança colega", { skip }, async () => {
  const { number, sale } = await fixture();
  const otherOrder = await fixture(CAIO);
  const catalogue = await ask(ANA, "produtos_buscar", { busca: "MC-100" });
  assert.equal(catalogue.produtos.length, 1);
  assert.equal(catalogue.produtos[0].preco_sem_ipi * 2, sale.tableTotal);
  assert.equal(catalogue.produtos[0].disponivel, -4);
  assert.doesNotMatch(JSON.stringify(catalogue), /advisory|supplier|taxCredit|packaging|margem|custo_equipamento/);
  const detail = await ask(ANA, "pedido_detalhe", { pedido: number });
  assert.equal(detail.total_com_ipi, sale.invoiceTotal);
  assert.equal(detail.itens[0].quantidade, 2);
  assert.deepEqual(detail.producao, []);
  assert.equal(detail.expedicao.expedido, false);
  for (const name of ["pedido_detalhe", "nota_fiscal_status", "producao_status"]) await assert.rejects(ask(ANA, name, { pedido: otherOrder.number }), /não encontrado/);
  assert.doesNotMatch(JSON.stringify(detail), /netProfit|margem|equipmentCost|advisoryCost|commission|comissao/);
  assert.deepEqual((await ask(FIN, "nota_fiscal_status", { pedido: otherOrder.number })).notas, []);
  assert.deepEqual((await ask(ANA, "produtos_buscar", {}, other)).produtos, []);
  await assert.rejects(ask(ANA, "pedido_detalhe", { pedido: number }, other), /não encontrado/);
  for (const pagina of [0, -1, 1.5, "1", 10001]) await assert.rejects(ask(ANA, "produtos_buscar", { pagina }));
});

test("comissões e cobrança: próprias, saldo líquido e texto não enviado", { skip }, async () => {
  const mine = await fixture(), theirs = await fixture(CAIO);
  await recordReceipt(mine.id, { amount: 250, receivedOn: today(), method: "PIX", note: null }, FIN.email, today(), db.pool);
  await recordReceipt(theirs.id, { amount: 500, receivedOn: today(), method: "PIX", note: null }, FIN.email, today(), db.pool);
  const commission = await ask(ANA, "minhas_comissoes", {});
  assert.ok(commission.registros.every((r: { pedido: string }) => r.pedido === mine.number));
  assert.ok(commission.previstas_ainda_nao_geradas > 0 && commission.abertas_no_mes > 0);
  const draft = await ask(FIN, "cobranca_gerar_mensagem", { id: mine.id });
  assert.equal(draft.enviado, false);
  assert.equal(draft.saldo, 750);
  assert.match(draft.texto, /R\$ 750,00/);
  assert.doesNotMatch(draft.texto, /multa|juros|chave|PIX/);
  const arrears = await ask(BOSS, "inadimplencia_resumo", {});
  const group = arrears.grupos.find((r: { vendedor_email: string }) => r.vendedor_email === ANA.email);
  assert.ok(group.saldo_atrasado >= 750);
  await db.pool.query("UPDATE orders SET seller_name='Ana com outro nome' WHERE id=$1", [mine.order.id]);
  const renamed = await ask(BOSS, "inadimplencia_resumo", {});
  assert.equal(renamed.grupos.filter((r: { vendedor_email: string }) => r.vendedor_email === ANA.email).length, 1);
  await db.pool.query("UPDATE receivables SET due_date=NULL WHERE id=$1", [mine.id]);
  await assert.rejects(ask(FIN, "cobranca_gerar_mensagem", { id: mine.id }), /não está vencida/);
});

test("status fiscal, produção e expedição não inventam agenda de entrega", { skip }, async () => {
  const { number, order } = await fixture();
  const invoice = await saveSignedInvoice({ orderId: order.id, environment: "homologacao", series: 1, number: 1, accessKey: "1".repeat(44), signedXml: "<NFe>Documento fictício</NFe>", issuedAt: new Date().toISOString(), createdBy: BOSS.email }, db.pool);
  await recordVerdict(invoice.id, { status: "rejeitada", code: "999", reason: "Rejeição de teste" }, db.pool);
  const fiscal = await ask(ANA, "nota_fiscal_status", { pedido: number });
  assert.equal(fiscal.notas[0].situacao, "rejeitada");
  assert.doesNotMatch(JSON.stringify(fiscal), /signedXml|<NFe>|certificat/);
  await sendToProduction(number, BOSS.email, db.pool);
  const stages = await listProductionStages(db.pool);
  const first = stages.find((s) => s.kind === "andamento")!;
  const ready = stages.find((s) => s.kind === "pronta")!;
  const orders = (await listProductionOrders(first.id, db.pool)).filter((o) => o.orderNumber === number);
  assert.equal(orders.length, 1);
  await moveProductionOrder(orders[0].id, ready.id, BOSS.email, db.pool);
  assert.equal((await ask(ANA, "producao_status", { pedido: number })).ordens[0].pronta, true);
  const agenda = await ask(BOSS, "entregas_agenda", { de: today(), ate: "2026-12-31" });
  assert.equal(agenda.agenda_transporte_disponivel, false);
  assert.ok(agenda.pedidos.some((p: { pedido: string }) => p.pedido === number));
  await shipOrder(number, BOSS.email, db.pool);
  assert.equal((await ask(ANA, "pedido_detalhe", { pedido: number })).expedicao.expedido, true);
  await saveMaterial(null, { name: "Aço teste", unit: "kg", stock: 2, minimum: 10 }, BOSS.email, db.pool);
  assert.equal((await ask(BOSS, "compras_estoque_minimo", {}))[0].repor_ate_minimo, 8);
});

test("resumos: venda por quatro dimensões, conversão, políticas e indícios sem mutações", { skip }, async () => {
  const { number, order, sale } = await fixture();
  await db.pool.query("UPDATE orders SET closed_at='2026-08-15T12:00:00-03' WHERE id=$1", [order.id]);
  for (const group of ["mes", "vendedor", "produto", "regiao"]) {
    const result = await ask(BOSS, "vendas_resumo", { de: "2026-08-01", ate: "2026-08-31", agrupar: group });
    assert.equal(result.grupos.length, 1);
    assert.equal(result.grupos[0].pedidos, 1);
    assert.equal(result.grupos[0].valor_com_ipi, sale.invoiceTotal);
  }
  await db.pool.query("UPDATE orders SET discount=0.12345678 WHERE id=$1", [order.id]);
  await db.pool.query("UPDATE order_items SET quantity=7 WHERE order_id=$1", [order.id]);
  const changed = (await getOrder(number, { sellerEmail: null }, db.pool))!;
  const expected = saleOf(changed, (await loadPublishedTable(1, db.pool))!);
  const byProduct = await ask(BOSS, "vendas_resumo", { de: "2026-08-01", ate: "2026-08-31", agrupar: "produto" });
  assert.equal(byProduct.grupos[0].valor_com_ipi, expected.lines[0].totalWithIpi);
  assert.equal(byProduct.grupos[0].pecas, 7);
  const blank = { customerId: null, company: "Academia fictícia", contactName: null, phone: null, email: null, source: null, estimatedValue: 1000, notes: null };
  const won = await createOpportunity({ ...blank, title: "Ganha de teste" }, ANA, db.pool), lost = await createOpportunity({ ...blank, title: "Perdida de teste" }, ANA, db.pool);
  const stages = await listStages(db.pool);
  await moveOpportunity(won, stages.find((s) => s.kind === "ganha")!.id, null, ANA.email, { ownerEmail: ANA.email }, db.pool);
  await moveOpportunity(lost, stages.find((s) => s.kind === "perdida")!.id, "Preço", ANA.email, { ownerEmail: ANA.email }, db.pool);
  const report = await ask(BOSS, "funil_conversao", { de: today(), ate: today() });
  assert.deepEqual([report.ganhas, report.perdidas, report.taxa_fechamento], [1, 1, 0.5]);
  assert.equal(report.motivos_perda[0].motivo, "Preço");
  const empty = await ask(BOSS, "funil_conversao", { de: "2020-01-01", ate: "2020-01-31" });
  assert.equal(empty.taxa_fechamento, null);
  await db.pool.query("UPDATE orders SET discount=0.8 WHERE id=$1", [order.id]);
  const flagged = await ask(BOSS, "descontos_fora_da_regra", {});
  assert.ok(flagged.pedidos.some((p: { pedido: string }) => p.pedido === number));
  const before = await listOrders({ sellerEmail: null }, db.pool);
  const suspected = await ask(BOSS, "pedidos_suspeitos", {});
  assert.ok(suspected.pedidos.some((p: { pedido: string }) => p.pedido === number));
  assert.deepEqual(await listOrders({ sellerEmail: null }, db.pool), before);
  for (const tool of ["vendas_resumo", "funil_conversao", "entregas_agenda"]) await assert.rejects(ask(BOSS, tool, { de: "2026-02-30", ate: today() }), /data válida/);
});

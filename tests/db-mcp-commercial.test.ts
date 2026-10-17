import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import type { Session } from "@/lib/auth/access";
import { createCustomer, getCustomer, updateCustomer } from "@/lib/db/customers";
import { createContract } from "@/lib/db/contracts";
import { getOpportunity, listStages } from "@/lib/db/funnel";
import { saveSignedInvoice } from "@/lib/db/invoices";
import { cancelForMcp } from "@/lib/db/mcp-commercial";
import { createOrder, getOrder, listOrders } from "@/lib/db/orders";
import { loadParams } from "@/lib/db/params";
import type { Queryable } from "@/lib/db/pool";
import { publishPriceTable } from "@/lib/db/price-table";
import { createProduct, listProducts } from "@/lib/db/products";
import { sendToProduction } from "@/lib/db/production";
import { recordReceipt } from "@/lib/db/receivables";
import { isoDate } from "@/lib/format";
import { callTool, toolsOf } from "@/lib/mcp/tools";
import { draftPriceTable } from "@/lib/price-table";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const who = (role: Session["role"], email: string): Session => ({ role, email, name: email, items: null, denied: [], profile: null, tenant: { slug: "acme", name: "Acme" }, companies: 1 });
const ANA = who("VENDEDOR", "ana@acme.test"), CAIO = who("VENDEDOR", "caio@acme.test"), BOSS = who("DIRETORIA", "boss@acme.test"), MANAGER = who("GERENTE_COMERCIAL", "manager@acme.test"), FIN = who("FINANCEIRO", "finance@acme.test");
let db: TestDb, other: TestDb, customerId: number, p1: number, p2: number;
const today = () => isoDate(new Date());
const customerInput = { kind: "PJ" as const, document: "11222333000181", name: "Cliente fictício", tradeName: null, contactName: "Contato fictício", stateRegistration: "ISENTO", rg: null, phone: "17999999999", email: "ficticio@example.test", cep: "15000000", street: "Rua Exemplo", streetNumber: "10", complement: null, district: "Centro", city: "São José do Rio Preto", uf: "SP" as const };
before(async () => {
  if (skip) return;
  db = await openTestDb("mcpcommercial"); other = await openTestDb("mcpcommercialother");
  customerId = (await createCustomer(customerInput, ANA.email, db.pool)).id;
  p1 = (await createProduct({ name: "Produto fictício A", code: "MC-C001", advisoryCost: 1000 }, BOSS.email, db.pool)).id;
  p2 = (await createProduct({ name: "Produto fictício B", code: "MC-C002", advisoryCost: 1500 }, BOSS.email, db.pool)).id;
  await publishPriceTable(draftPriceTable(await loadParams(db.pool), await listProducts({ active: true }, db.pool)), 1, BOSS.email, db.pool);
});
after(async () => { if (!skip) { await db.close(); await other.close(); } });
// Tool responses are checked field-by-field; each confirmation uses one reserved client.
async function ask(session: Session, name: string, args: Record<string, unknown>, database = db): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const client = await database.pool.connect();
  try { return await callTool(session, client, name, args); } finally { client.release(); }
}
async function confirmed(session: Session, name: string, args: Record<string, unknown>) {
  const preview = await ask(session, name, args);
  return ask(session, name, { confirmar: preview.confirmar });
}
const budgetArgs = () => ({ tabela: 1, cliente_id: customerId, itens: [{ produto_id: p1, quantidade: 2 }, { produto_id: p2, quantidade: 1 }], prazo_fabricacao: 45, entrada: 1000, meio_entrada: "PIX", meio_saldo: "PIX", parcelas: 3, primeira_parcela_dias: 30, intervalo_dias: 30, garantia: "12 meses contra defeitos de fabricação (teste fictício).", montagem: "Não inclusa (teste fictício).", modalidade_frete: "FOB" });
async function budget(extra: Record<string, unknown> = {}, owner = ANA) { return (await confirmed(owner, "orcamento_criar", { ...budgetArgs(), ...extra })).pedido as string; }
async function pending(number: string, seller = ANA) { return confirmed(seller, "pedido_enviar_aprovacao", { pedido: number }); }
async function closed(extra: Record<string, unknown> = {}) { const number = await budget(extra); await pending(number); await confirmed(BOSS, "aprovacao_aprovar", { pedido: number }); return number; }

test("ações comerciais: telas, equipe e papel limitam descoberta e execução", { skip }, async () => {
  for (const name of ["aprovacao_aprovar", "aprovacao_reprovar", "pedido_cancelar"]) {
    assert.ok(!toolsOf(ANA).some((t) => t.name === name));
    assert.ok(!toolsOf({ ...MANAGER, denied: ["pedidos-da-equipe"] }).some((t) => t.name === name));
    await assert.rejects(ask(ANA, name, {}), /desconhecida/);
  }
  for (const name of ["clientes_cadastrar", "orcamento_criar", "funil_mover_etapa"]) assert.ok(!toolsOf(FIN).some((t) => t.name === name));
  assert.ok(!toolsOf({ ...ANA, items: ["pedidos"] }).some((t) => t.name === "orcamento_criar"));
});

test("cliente: prévia, documento único, confirmação concorrente, alterações parciais e revisão", { skip }, async () => {
  const args = { tipo: "PJ", documento: "48.240.052/0001-61", nome: "Empresa de teste", telefone: "(17) 99999-9999", email: "teste@example.test" };
  await assert.rejects(ask(ANA, "clientes_cadastrar", { ...args, documento: "111" }), /inválido/);
  await assert.rejects(ask(ANA, "clientes_cadastrar", { ...args, email: "errado" }), /e-mail/);
  const preview = await ask(ANA, "clientes_cadastrar", args);
  assert.equal((await db.pool.query("SELECT count(*) FROM customers")).rows[0].count, "1");
  await assert.rejects(ask(CAIO, "clientes_cadastrar", { confirmar: preview.confirmar }), /não encontrada/);
  await assert.rejects(ask(ANA, "clientes_cadastrar", { confirmar: preview.confirmar }, other), /não encontrada/);
  const [a, b] = await Promise.all([ask(ANA, "clientes_cadastrar", { confirmar: preview.confirmar }), ask(ANA, "clientes_cadastrar", { confirmar: preview.confirmar })]);
  assert.deepEqual(a, b);
  await assert.rejects(ask(ANA, "clientes_cadastrar", args), /Já existe/);
  const correction = await ask(ANA, "clientes_atualizar", { id: a.cliente_id, nome: "Empresa corrigida", email: "" });
  assert.equal((await getCustomer(a.cliente_id, db.pool))!.email, args.email);
  await ask(ANA, "clientes_atualizar", { confirmar: correction.confirmar });
  const current = (await getCustomer(a.cliente_id, db.pool))!;
  assert.deepEqual([current.name, current.phone, current.email, current.document], ["Empresa corrigida", "17999999999", null, "48240052000161"]);
  await assert.rejects(ask(ANA, "clientes_atualizar", { id: a.cliente_id, documento: "11222333000181" }), /Campo que/);
  const stale = await ask(ANA, "clientes_atualizar", { id: a.cliente_id, fantasia: "Nome antigo" });
  await updateCustomer(current.id, { ...current, name: "Edição concorrente" }, CAIO.email, db.pool);
  await assert.rejects(ask(ANA, "clientes_atualizar", { confirmar: stale.confirmar }), /mudou/);
});

test("orçamento: itens, pagamentos e termos exatos, prévia sem pedido e repetição sem duplicação", { skip }, async () => {
  const before = (await listOrders({ sellerEmail: null }, db.pool)).length;
  const args = budgetArgs();
  for (const change of [{ itens: [] }, { itens: [{ produto_id: 999999, quantidade: 1 }] }, { itens: [args.itens[0], args.itens[0]] }, { itens: [{ ...args.itens[0], preco: 1 }] }, { meio_saldo: "Na entrega" }, { data_entrada: "2026-02-30" }, { intervalo_dias: 999999 }, { entrada: 1e11 }, { saldo_na_entrega: "sim" }]) await assert.rejects(ask(ANA, "orcamento_criar", { ...args, ...change }));
  const preview = await ask(ANA, "orcamento_criar", args);
  assert.equal((await listOrders({ sellerEmail: null }, db.pool)).length, before);
  assert.deepEqual(preview.resumo.pendencias_para_aprovar, []);
  const delivery = await ask(ANA, "orcamento_criar", { ...args, saldo_na_entrega: true, parcelas: undefined });
  assert.deepEqual(delivery.resumo.pendencias_para_aprovar, []);
  assert.equal(delivery.resumo.pagamento.length, 2);
  assert.doesNotMatch(JSON.stringify(preview.resumo), /commission|custo_equipamento|lucro_liquido/);
  const [created, repeated] = await Promise.all([ask(ANA, "orcamento_criar", { confirmar: preview.confirmar }), ask(ANA, "orcamento_criar", { confirmar: preview.confirmar })]);
  assert.deepEqual(created, repeated);
  const detail = await ask(ANA, "pedido_detalhe", { pedido: created.pedido });
  assert.deepEqual([detail.situacao, detail.itens.length, detail.pagamento.length, detail.pagamento[0].valor, detail.prazo_fabricacao.dias], ["em_negociacao", 2, 4, 1000, 45]);
  assert.equal(detail.total_com_ipi, preview.resumo.total_com_ipi);
  assert.equal((await db.pool.query("SELECT count(*) FROM receivables")).rows[0].count, "0");
  await assert.rejects(ask(CAIO, "pedido_enviar_aprovacao", { pedido: created.pedido }), /não encontrado/);
});

test("orçamento: alterações na ficha invalidam prévia e falha intermediária desfaz o pedido inteiro", { skip }, async () => {
  const before = (await listOrders({ sellerEmail: null }, db.pool)).length;
  const stale = await ask(ANA, "orcamento_criar", budgetArgs());
  await db.pool.query("UPDATE customers SET updated_at=clock_timestamp(), updated_by=$2 WHERE id=$1", [customerId, CAIO.email]);
  await assert.rejects(ask(ANA, "orcamento_criar", { confirmar: stale.confirmar }), /mudaram/);
  const preview = await ask(ANA, "orcamento_criar", { ...budgetArgs(), entrada: 123.45 });
  await db.pool.query("ALTER TABLE orders ADD CONSTRAINT test_payment_failure CHECK (down_payment<>123.45)");
  await assert.rejects(ask(ANA, "orcamento_criar", { confirmar: preview.confirmar }), /test_payment_failure/);
  assert.equal((await listOrders({ sellerEmail: null }, db.pool)).length, before);
  await db.pool.query("ALTER TABLE orders DROP CONSTRAINT test_payment_failure");
  const retried = await ask(ANA, "orcamento_criar", { confirmar: preview.confirmar });
  assert.equal(retried.criado, true);
});

test("aprovação: solicitação manual sempre aguarda; aprovação fecha uma vez e reprovação registra motivo", { skip }, async () => {
  const number = await budget({ entrada: 0, parcelas: 1 });
  await pending(number);
  const before = await db.pool.query("SELECT count(*) FROM receivables r JOIN orders o ON o.id=r.order_id WHERE o.number=$1", [number]);
  assert.equal(before.rows[0].count, "0");
  const approval = await ask(BOSS, "aprovacao_aprovar", { pedido: number });
  const [a, b] = await Promise.all([ask(BOSS, "aprovacao_aprovar", { confirmar: approval.confirmar }), ask(BOSS, "aprovacao_aprovar", { confirmar: approval.confirmar })]);
  assert.deepEqual(a, b);
  assert.equal((await getOrder(number, { sellerEmail: null }, db.pool))!.status, "fechado");
  assert.equal((await db.pool.query("SELECT count(*) FROM order_closings k JOIN orders o ON o.id=k.order_id WHERE o.number=$1", [number])).rows[0].count, "1");
  const manual = await budget({ entrada: 0 });
  const data = await ask(ANA, "pedido_detalhe", { pedido: manual });
  await db.pool.query("UPDATE orders SET down_payment=$2, down_payment_method='PIX' WHERE number=$1", [manual, data.total_com_ipi]);
  const requested = await pending(manual);
  assert.equal(requested.situacao, "aguardando_aprovacao");
  assert.ok(requested.motivos.includes("solicitacao-manual"));
  await assert.rejects(ask(MANAGER, "aprovacao_reprovar", { pedido: manual }), /motivo/);
  await confirmed(MANAGER, "aprovacao_reprovar", { pedido: manual, motivo: "Ajustar condições com o cliente" });
  assert.equal((await getOrder(manual, { sellerEmail: null }, db.pool))!.status, "em_negociacao");
  const decision = (await db.pool.query("SELECT decided_by,comment FROM order_approvals a JOIN orders o ON o.id=a.order_id WHERE o.number=$1", [manual])).rows[0];
  assert.deepEqual([decision.decided_by, decision.comment], [MANAGER.email, "Ajustar condições com o cliente"]);
});

test("alçada e revisão: gerente não aprova prejuízo; diretoria sem poder também não; termos alterados invalidam código", { skip }, async () => {
  const number = await budget({ desconto_percentual: 80, entrada: 0 }); await pending(number);
  await assert.rejects(ask(MANAGER, "aprovacao_aprovar", { pedido: number }), /alçada/);
  await assert.rejects(ask({ ...BOSS, denied: ["aprova-prejuizo"] }, "aprovacao_aprovar", { pedido: number }), /alçada/);
  const preview = await ask(BOSS, "aprovacao_aprovar", { pedido: number });
  await db.pool.query("UPDATE company_settings SET proposal_details_revision=proposal_details_revision+1");
  await assert.rejects(ask(BOSS, "aprovacao_aprovar", { confirmar: preview.confirmar }), /mudaram/);
  await confirmed({ ...BOSS, denied: ["custos"] }, "aprovacao_aprovar", { pedido: number });
});

test("cancelamento: motivo, rascunho incompleto, títulos cancelados, nenhum histórico excluído", { skip }, async () => {
  const draft = await createOrder({ seller: ANA, version: 1, productId: p1, quantity: 1 }, () => "261017-DRFT", db.pool);
  await assert.rejects(ask(BOSS, "pedido_cancelar", { pedido: draft, motivo: "" }), /motivo/);
  const preview = await ask(BOSS, "pedido_cancelar", { pedido: draft, motivo: "Duplicação de teste" });
  assert.equal((await getOrder(draft, { sellerEmail: null }, db.pool))!.status, "em_negociacao");
  await ask(BOSS, "pedido_cancelar", { confirmar: preview.confirmar });
  assert.equal((await getOrder(draft, { sellerEmail: null }, db.pool))!.customer, null);
  const number = await closed();
  await confirmed(BOSS, "pedido_cancelar", { pedido: number, motivo: "Cliente desistiu antes de movimentar" });
  assert.equal((await getOrder(number, { sellerEmail: null }, db.pool))!.status, "cancelado");
  const amounts = await db.pool.query("SELECT r.status FROM receivables r JOIN orders o ON o.id=r.order_id WHERE o.number=$1", [number]);
  assert.ok(amounts.rows.length && amounts.rows.every((r) => r.status === "cancelada"));
  assert.equal((await db.pool.query("SELECT count(*) FROM order_closings k JOIN orders o ON o.id=k.order_id WHERE o.number=$1", [number])).rows[0].count, "1");
});

test("cancelamento protege recebimentos e documentos: nenhum efeito posterior alcança pedido cancelado", { skip }, async () => {
  const paid = await closed();
  const id = Number((await db.pool.query("SELECT r.id FROM receivables r JOIN orders o ON o.id=r.order_id WHERE o.number=$1 ORDER BY r.id LIMIT 1", [paid])).rows[0].id);
  await recordReceipt(id, { amount: 1, receivedOn: today(), method: "PIX", note: null }, FIN.email, today(), db.pool);
  await assert.rejects(ask(BOSS, "pedido_cancelar", { pedido: paid, motivo: "Não deve cancelar" }), /recebimento/);
  const number = await closed(), order = (await getOrder(number, { sellerEmail: null }, db.pool))!;
  const client = await db.pool.connect(), payer = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await cancelForMcp(number, { sellerEmail: null }, "Desistência antes de baixa", { email: BOSS.email, role: "DIRETORIA" }, client);
    const rid = Number((await client.query("SELECT id FROM receivables WHERE order_id=$1 ORDER BY id LIMIT 1", [order.id])).rows[0].id);
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => { reached = resolve; });
    const wrapped: Queryable = { query: ((sql: string, values: unknown[]) => { if (sql.includes("WITH parent")) reached(); return payer.query(sql, values); }) as Queryable["query"] };
    const receiving = assert.rejects(recordReceipt(rid, { amount: 1, receivedOn: today(), method: "PIX", note: null }, FIN.email, today(), wrapped), /não está mais em aberto/);
    await gate; await client.query("COMMIT"); await receiving;
    assert.equal((await db.pool.query("SELECT count(*) FROM receipts p JOIN receivables r ON r.id=p.receivable_id WHERE r.order_id=$1", [order.id])).rows[0].count, "0");
  } finally { await client.query("ROLLBACK"); client.release(); payer.release(); }
  await assert.rejects(createContract({ orderId: order.id, sequence: 1, title: "Fictício", body: "Teste", pdf: Buffer.alloc(120), sha256: "a".repeat(64), tokenHash: "b".repeat(64), expiresAt: new Date("2099-01-01"), recipientName: "Fictício", recipientEmail: "ficticio@example.test", createdBy: BOSS.email }, db.pool), /cancelado/);
  await assert.rejects(saveSignedInvoice({ orderId: order.id, environment: "homologacao", series: 1, number: 1, accessKey: "1".repeat(44), signedXml: "<NFe/>", issuedAt: new Date().toISOString(), createdBy: BOSS.email }, db.pool), /cancelado/);
  await assert.rejects(sendToProduction(number, BOSS.email, db.pool), /fechado/);
  const production = await closed(); await sendToProduction(production, BOSS.email, db.pool);
  await assert.rejects(ask(BOSS, "pedido_cancelar", { pedido: production, motivo: "Produção já iniciada" }), /produção/);
});

test("funil: criação e movimento confirmados, perda com motivo, escopo e edição concorrente", { skip }, async () => {
  assert.equal((await ask(ANA, "funil_criar_oportunidade", { titulo: "Sem estimativa positiva", empresa: "Empresa fictícia", valor: 0 })).resumo.valor_estimado, 0);
  const preview = await ask(ANA, "funil_criar_oportunidade", { titulo: "Venda fictícia", cliente_id: customerId, valor: 1200 });
  assert.equal((await db.pool.query("SELECT count(*) FROM opportunities")).rows[0].count, "0");
  const created = await ask(ANA, "funil_criar_oportunidade", { confirmar: preview.confirmar });
  assert.deepEqual(await ask(ANA, "funil_criar_oportunidade", { confirmar: preview.confirmar }), created);
  const stages = await listStages(db.pool), lost = stages.find((s) => s.kind === "perdida")!;
  await assert.rejects(ask(CAIO, "funil_mover_etapa", { id: created.oportunidade_id, etapa_id: lost.id, motivo: "Preço" }), /não encontrada/);
  await assert.rejects(ask(ANA, "funil_mover_etapa", { id: created.oportunidade_id, etapa_id: lost.id }), /motivo/);
  const move = await ask(ANA, "funil_mover_etapa", { id: created.oportunidade_id, etapa_id: lost.id, motivo: "Preço" });
  await db.pool.query("UPDATE opportunities SET updated_at=clock_timestamp(),title='Mudou' WHERE id=$1", [created.oportunidade_id]);
  await assert.rejects(ask(ANA, "funil_mover_etapa", { confirmar: move.confirmar }), /mudou/);
  await confirmed(ANA, "funil_mover_etapa", { id: created.oportunidade_id, etapa_id: lost.id, motivo: "Preço" });
  assert.equal((await getOpportunity(created.oportunidade_id, { ownerEmail: ANA.email }, db.pool))!.lostReason, "Preço");
});

test("duplicadas: prévia exata, mantém antiga aberta, preserva concluídas e chaves, não alcança colega", { skip }, async () => {
  const number = await budget(), order = (await getOrder(number, { sellerEmail: null }, db.pool))!;
  const add = async (owner: string, auto: string | null = null, done = false) => Number((await db.pool.query("INSERT INTO opportunity_activities (order_id,kind,title,due_on,owner_email,created_by,auto_key,done_at,done_by) VALUES ($1,'tarefa','Cobrar parcela fictícia','2026-10-20',$2,$2,$3,CASE WHEN $4 THEN now() END,CASE WHEN $4 THEN $2 END) RETURNING id", [order.id, owner, auto, done])).rows[0].id);
  const first = await add(ANA.email), duplicate = await add(ANA.email, "teste-duplicada"), completed = await add(ANA.email, null, true), differentOwner = await add(CAIO.email);
  const preview = await ask(ANA, "tarefas_limpar_duplicadas", {});
  assert.deepEqual(preview.resumo.consolidar.map((r: { id: number }) => r.id), [duplicate]);
  const third = await add(ANA.email);
  await assert.rejects(ask(ANA, "tarefas_limpar_duplicadas", { confirmar: preview.confirmar }), /mudaram/);
  await assert.rejects(ask(ANA, "tarefas_limpar_duplicadas", { responsavel: CAIO.email }), /próprias/);
  const merged = await confirmed(ANA, "tarefas_limpar_duplicadas", {});
  assert.equal(merged.consolidadas_por_duplicidade, 2);
  const rows = (await db.pool.query("SELECT id,done_at,done_by,completion_note,auto_key FROM opportunity_activities WHERE order_id=$1 ORDER BY id", [order.id])).rows;
  assert.equal(rows.find((r) => r.id === first).done_at, null);
  for (const id of [duplicate, third]) {
    const row = rows.find((r) => r.id === id);
    assert.equal(row.done_by, ANA.email);
    assert.match(row.completion_note, new RegExp(`duplicidade; mantida a tarefa #${first}`));
  }
  assert.ok(rows.find((r) => r.id === completed).done_at);
  assert.equal(rows.find((r) => r.id === differentOwner).done_at, null);
  assert.equal(rows.find((r) => r.id === duplicate).auto_key, "teste-duplicada");
  assert.equal(rows.length, 5);
});

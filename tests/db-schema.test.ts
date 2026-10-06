import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { MIGRATIONS_DIR, openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
/** Ids created by the first test, used by the others. */
const ID = { order: 0, receivable: 0, receipt: 0, request: 0, refund: 0 };
const WHO = "financeiro@teste.local";

before(async () => {
  if (!skip) db = await openTestDb("schema");
});
after(async () => {
  if (!skip) await db.close();
});

const CHECK = (error: unknown) => (error as { code?: string }).code === "23514";
const FOREIGN_KEY = (error: unknown) => (error as { code?: string }).code === "23503";
const UNIQUE = (error: unknown) => (error as { code?: string }).code === "23505";
const one = async (sql: string, values: unknown[] = []) => (await db.pool.query(sql, values)).rows[0];

test("nenhuma migração apaga em cascata, e nenhuma chave estrangeira do banco também", { skip }, async () => {
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    assert.doesNotMatch(readFileSync(MIGRATIONS_DIR + file, "utf8"), /ON\s+DELETE\s+(CASCADE|SET)/i, file);
  }
  const { rows } = await db.pool.query(
    `SELECT conrelid::regclass::text AS tabela, conname, confdeltype::text AS ao_apagar
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = $1 AND c.confdeltype <> 'a'`,
    [db.schema],
  );
  assert.deepEqual(rows, []);
  const total = await one(
    "SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE c.contype = 'f' AND n.nspname = $1",
    [db.schema],
  );
  assert.ok(total.n >= 18, `só ${total.n} chaves estrangeiras`);
});

test("preparo: um pedido fechado com a entrada a receber", { skip }, async () => {
  const product = await one(
    "INSERT INTO products (name, code, advisory_cost, updated_by) VALUES ('Mesa', 'LD-B001', 8146.64, $1) RETURNING id",
    [WHO],
  );
  const columns = await db.pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'pricing_params' AND column_name NOT IN ('id', 'updated_at', 'updated_by') ORDER BY ordinal_position",
    [db.schema],
  );
  const list = columns.rows.map((row) => row.column_name).join(", ");
  await db.pool.query(`INSERT INTO price_table_versions (version, published_by, ${list}) SELECT 1, $1, ${list} FROM pricing_params`, [WHO]);
  await db.pool.query(
    "INSERT INTO price_table_items (version, product_id, code, name, advisory_cost, tax_credit, packaging, table_price, table_price_with_ipi) VALUES (1, $1, 'LD-B001', 'Mesa', 8146.64, 0, 0, 19204.61, 21701.21)",
    [product.id],
  );
  const customer = await one(
    "INSERT INTO customers (kind, document, name, updated_by) VALUES ('PJ', '48240052000161', 'Cliente', $1) RETURNING id",
    [WHO],
  );
  const order = await one(
    `INSERT INTO orders (number, status, seller_email, seller_name, customer_id, price_table_version, delivery_uf, production_days, updated_by, closed_at)
     VALUES ('261006-ABCD', 'fechado', 'vendedor@teste.local', 'Vendedor', $1, 1, 'MA', 90, $2, now()) RETURNING id`,
    [customer.id, WHO],
  );
  ID.order = order.id;
  const receivable = await one(
    "INSERT INTO receivables (order_id, kind, number, due_date, amount, method, updated_by) VALUES ($1, 'entrada', 0, '2026-10-06', 10000, 'PIX', $2) RETURNING id",
    [ID.order, WHO],
  );
  ID.receivable = receivable.id;
  assert.ok(ID.order > 0 && ID.receivable > 0);
});

test("a receber: a entrada é a de número zero, parcela repetida e valor zerado são recusados", { skip }, async () => {
  const insert = (kind: string, number: number, amount = 100) =>
    db.pool.query("INSERT INTO receivables (order_id, kind, number, amount, updated_by) VALUES ($1, $2, $3, $4, $5)", [ID.order, kind, number, amount, WHO]);
  await assert.rejects(() => insert("entrada", 1), CHECK);
  await assert.rejects(() => insert("parcela", 0), CHECK);
  await assert.rejects(() => insert("parcela", 1, 0), CHECK);
  await assert.rejects(() => insert("entrada", 0), UNIQUE);
  await insert("parcela", 1);
  await assert.rejects(() => insert("parcela", 1), UNIQUE);
  await assert.rejects(() => db.pool.query("UPDATE receivables SET status = 'paga' WHERE id = $1", [ID.receivable]), CHECK);
  // Parcela "na entrega" não tem data.
  await db.pool.query("INSERT INTO receivables (order_id, kind, number, due_date, amount, updated_by) VALUES ($1, 'parcela', 2, NULL, 50, $2)", [ID.order, WHO]);
});

test("recebimento: valor positivo, parte sem IPI nunca maior que o valor, e parcela tem de existir", { skip }, async () => {
  const insert = (amount: number, withoutIpi: number, receivable = ID.receivable) =>
    one(
      "INSERT INTO receipts (receivable_id, received_at, amount, amount_without_ipi, method, recorded_by) VALUES ($1, '2026-09-30T23:30:00-03:00', $2, $3, 'PIX', $4) RETURNING id",
      [receivable, amount, withoutIpi, WHO],
    );
  await assert.rejects(() => insert(0, 0), CHECK);
  await assert.rejects(() => insert(-100, -88.5), CHECK);
  await assert.rejects(() => insert(4000, 4000.01), CHECK);
  await assert.rejects(() => insert(4000, 3539.82, 2_000_000_000), FOREIGN_KEY);
  ID.receipt = (await insert(4000, 3539.82)).id;
  // O que já recebeu dinheiro não se apaga.
  await assert.rejects(() => db.pool.query("DELETE FROM receivables WHERE id = $1", [ID.receivable]), FOREIGN_KEY);
  await assert.rejects(() => db.pool.query("DELETE FROM orders WHERE id = $1", [ID.order]), FOREIGN_KEY);
});

test("estorno: só com devolução pedida, sempre negativo, e um por pedido de devolução", { skip }, async () => {
  ID.request = (
    await one(
      "INSERT INTO refund_requests (order_id, receivable_id, amount, reason, requested_by) VALUES ($1, $2, 1000, 'pedido reduzido', 'vendedor@teste.local') RETURNING id",
      [ID.order, ID.receivable],
    )
  ).id;
  await assert.rejects(() => db.pool.query("UPDATE refund_requests SET status = 'confirmada' WHERE id = $1", [ID.request]), CHECK);
  await db.pool.query("UPDATE refund_requests SET status = 'confirmada', decided_at = now(), decided_by = $2 WHERE id = $1", [ID.request, WHO]);

  const insert = (amount: number, withoutIpi: number, request = ID.request) =>
    one(
      `INSERT INTO refunds (refund_request_id, order_id, receivable_id, refunded_at, amount, amount_without_ipi, reason, requested_by, confirmed_by)
       VALUES ($1, $2, $3, '2026-10-31T23:30:00-03:00', $4, $5, 'pedido reduzido', 'vendedor@teste.local', $6) RETURNING id`,
      [request, ID.order, ID.receivable, amount, withoutIpi, WHO],
    );
  await assert.rejects(() => insert(1000, 884.96), CHECK);
  await assert.rejects(() => insert(0, 0), CHECK);
  await assert.rejects(() => insert(-1000, -1000.01), CHECK);
  await assert.rejects(() => insert(-1000, -884.96, 2_000_000_000), FOREIGN_KEY);
  ID.refund = (await insert(-1000, -884.96)).id;
  await assert.rejects(() => insert(-500, -442.48), UNIQUE);
});

test("comissão: exatamente uma origem; de recebimento é positiva e de estorno é negativa", { skip }, async () => {
  const insert = (change: Record<string, unknown>) => {
    const row: Record<string, unknown> = {
      seller_email: "vendedor@teste.local",
      receipt_id: null,
      refund_id: null,
      competence: "2026-09-01",
      base_amount: 3539.82,
      rate: 0.02,
      amount: 70.8,
      payment_due: "2026-10-05",
      ...change,
    };
    const columns = Object.keys(row);
    return db.pool.query(
      `INSERT INTO commissions (${columns.join(", ")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
      Object.values(row),
    );
  };
  const refund = { refund_id: ID.refund, competence: "2026-10-01", base_amount: -884.96, amount: -17.7, payment_due: "2026-11-05" };

  // Nenhuma origem, ou as duas.
  await assert.rejects(() => insert({}), CHECK);
  await assert.rejects(() => insert({ receipt_id: ID.receipt, refund_id: ID.refund }), CHECK);
  // Sinal trocado.
  await assert.rejects(() => insert({ receipt_id: ID.receipt, amount: -70.8 }), CHECK);
  await assert.rejects(() => insert({ ...refund, amount: 17.7 }), CHECK);
  await assert.rejects(() => insert({ ...refund, base_amount: 884.96 }), CHECK);
  // Competência é sempre o dia 1, e o pagamento vem depois dela.
  await assert.rejects(() => insert({ receipt_id: ID.receipt, competence: "2026-09-30" }), CHECK);
  await assert.rejects(() => insert({ receipt_id: ID.receipt, payment_due: "2026-09-01" }), CHECK);
  await assert.rejects(() => insert({ receipt_id: ID.receipt, paid_at: "2026-10-05T12:00:00Z" }), CHECK);
  await assert.rejects(() => insert({ receipt_id: 2_000_000_000 }), FOREIGN_KEY);

  await insert({ receipt_id: ID.receipt });
  await insert(refund);
  // Uma comissão por recebimento e uma por estorno.
  await assert.rejects(() => insert({ receipt_id: ID.receipt }), UNIQUE);
  await assert.rejects(() => insert(refund), UNIQUE);

  const total = await one("SELECT sum(amount)::float AS total, count(*)::int AS n FROM commissions");
  assert.deepEqual(total, { total: 53.1, n: 2 });
  // Recebimento e estorno com comissão não se apagam.
  await assert.rejects(() => db.pool.query("DELETE FROM receipts WHERE id = $1", [ID.receipt]), FOREIGN_KEY);
  await assert.rejects(() => db.pool.query("DELETE FROM refunds WHERE id = $1", [ID.refund]), FOREIGN_KEY);
});

test("aprovação: decidida tem quem, quando e com qual perfil; pendente não tem nada disso", { skip }, async () => {
  const hash = "a".repeat(64);
  const insert = (change: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = { order_id: ID.order, requested_by: "vendedor@teste.local", revision_hash: hash, reasons: ["entrada-abaixo-da-politica"], ...change };
    const columns = Object.keys(row);
    return one(
      `INSERT INTO order_approvals (${columns.join(", ")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING id`,
      Object.values(row),
    );
  };
  await assert.rejects(() => insert({ revision_hash: "curto" }), CHECK);
  await assert.rejects(() => insert({ reasons: [] }), CHECK);
  await assert.rejects(() => insert({ status: "aprovado" }), CHECK);
  await assert.rejects(() => insert({ decided_by: "x" }), CHECK);
  const { id } = await insert();
  await assert.rejects(() => db.pool.query("UPDATE order_approvals SET status = 'aprovado', decided_at = now(), decided_by = 'g', decided_role = 'VENDEDOR' WHERE id = $1", [id]), CHECK);
  await db.pool.query("UPDATE order_approvals SET status = 'reprovado', decided_at = now(), decided_by = 'g@teste.local', decided_role = 'GERENTE_COMERCIAL', comment = 'entrada baixa' WHERE id = $1", [id]);
  // Reenviar é outra linha: a decisão anterior fica.
  await insert({ revision_hash: "b".repeat(64) });
  assert.equal((await one("SELECT count(*)::int AS n FROM order_approvals WHERE order_id = $1", [ID.order])).n, 2);
});

test("fechamentos, contas a pagar, fornecedores, metas, usuários e empresa: as regras de cada tabela", { skip }, async () => {
  const q = (sql: string, values: unknown[] = []) => db.pool.query(sql, values);

  await q("INSERT INTO order_closings (order_id, closed_by, invoice_total) VALUES ($1, $2, 45226.67)", [ID.order, WHO]);
  await assert.rejects(() => q("INSERT INTO order_closings (order_id, closed_by, invoice_total) VALUES ($1, $2, 0)", [ID.order, WHO]), CHECK);
  await assert.rejects(() => q("UPDATE order_closings SET reopened_at = now()"), CHECK);
  await assert.rejects(() => q("UPDATE order_closings SET reopened_at = closed_at - interval '1 day', reopened_by = 'x'"), CHECK);

  // Fornecedor: empresa com CNPJ, pessoa com CPF, exterior com país.
  const supplier = (kind: string, document: string | null, country: string | null = null) =>
    q("INSERT INTO suppliers (kind, document, name, country, updated_by) VALUES ($1, $2, 'Fornecedor', $3, $4) RETURNING id", [kind, document, country, WHO]);
  const { rows } = await supplier("PJ", "48240052000161");
  await supplier("EX", null, "China");
  await supplier("EX", null, "China");
  await assert.rejects(() => supplier("PJ", "48240052000161"), UNIQUE);
  await assert.rejects(() => supplier("PJ", "123"), CHECK);
  await assert.rejects(() => supplier("PF", "48240052000161"), CHECK);
  await assert.rejects(() => supplier("EX", null, null), CHECK);

  // Conta paga tem data e valor do pagamento; em aberto, não.
  const payable = await one(
    "INSERT INTO payables (description, supplier_id, order_id, category, amount, due_date, updated_by) VALUES ('Pagamento China', $1, $2, 'Importação / China', 17729.68, '2026-10-20', $3) RETURNING id",
    [rows[0].id, ID.order, WHO],
  );
  await assert.rejects(() => q("UPDATE payables SET status = 'paga' WHERE id = $1", [payable.id]), CHECK);
  await assert.rejects(() => q("UPDATE payables SET paid_on = '2026-10-20' WHERE id = $1", [payable.id]), CHECK);
  await q("UPDATE payables SET status = 'paga', paid_on = '2026-10-20', paid_amount = 17729.68 WHERE id = $1", [payable.id]);
  await assert.rejects(() => q("DELETE FROM suppliers WHERE id = $1", [rows[0].id]), FOREIGN_KEY);

  // Meta: uma da equipe e uma por vendedor em cada mês, sempre no dia 1.
  const goal = (seller: string | null, month: string) =>
    q("INSERT INTO sales_goals (seller_email, month, amount, updated_by) VALUES ($1, $2, 300000, $3)", [seller, month, WHO]);
  await goal(null, "2026-10-01");
  await goal("vendedor@teste.local", "2026-10-01");
  await goal(null, "2026-11-01");
  await assert.rejects(() => goal(null, "2026-10-01"), UNIQUE);
  await assert.rejects(() => goal("vendedor@teste.local", "2026-10-01"), UNIQUE);
  await assert.rejects(() => goal(null, "2026-10-15"), CHECK);

  // Usuário: e-mail em minúsculas, único, perfil dos quatro.
  const user = (email: string, role = "VENDEDOR") => q("INSERT INTO users (email, name, role, updated_by) VALUES ($1, 'Fulano', $2, $3)", [email, role, WHO]);
  await user("vendedor@teste.local");
  await assert.rejects(() => user("vendedor@teste.local"), UNIQUE);
  await assert.rejects(() => user("Vendedor2@Teste.Local"), CHECK);
  await assert.rejects(() => user("sem-arroba"), CHECK);
  await assert.rejects(() => user("chefe@teste.local", "CHEFE"), CHECK);

  // Motivo de perda no pedido; chave de idempotência não repete.
  const reason = await one("INSERT INTO lost_reasons (label, updated_by) VALUES ('Preço', $1) RETURNING id", [WHO]);
  await assert.rejects(() => q("INSERT INTO lost_reasons (label, updated_by) VALUES ('Preço', $1)", [WHO]), UNIQUE);
  await assert.rejects(() => q("UPDATE orders SET lost_reason_id = 2000000000 WHERE id = $1", [ID.order]), FOREIGN_KEY);
  await q("UPDATE orders SET lost_reason_id = $2, lost_note = 'concorrente' WHERE id = $1", [ID.order, reason.id]);
  await q("INSERT INTO idempotency_keys (key, operation, created_by, result) VALUES ('fechar-261006-ABCD', 'pedido.fechar', $1, '{\"status\":\"fechado\"}')", [WHO]);
  await assert.rejects(() => q("INSERT INTO idempotency_keys (key, operation, created_by) VALUES ('fechar-261006-ABCD', 'pedido.fechar', $1)", [WHO]), UNIQUE);

  // Auditoria e histórico de parâmetros guardam JSON; a ação tem formato fixo.
  await q("INSERT INTO audit_log (actor, action, entity, entity_id, before, after) VALUES ($1, 'pedido.fechar', 'orders', '261006-ABCD', '{\"status\":\"em_negociacao\"}', '{\"status\":\"fechado\"}')", [WHO]);
  await assert.rejects(() => q("INSERT INTO audit_log (actor, action, entity, entity_id) VALUES ($1, 'Pedido Fechar', 'orders', '1')", [WHO]), CHECK);
  await q("INSERT INTO pricing_params_history (changed_by, params) VALUES ($1, '{\"ipi\":0.13}')", [WHO]);

  // Empresa: uma linha só, e logo só com o tipo junto.
  assert.equal((await one("SELECT count(*)::int AS n FROM company_settings")).n, 1);
  await assert.rejects(() => q("INSERT INTO company_settings (id, updated_by) VALUES (false, 'x')"), CHECK);
  await assert.rejects(() => q("UPDATE company_settings SET logo = '\\\\x89504e47'"), CHECK);
  await assert.rejects(() => q("UPDATE company_settings SET logo = '\\\\x89504e47', logo_type = 'image/svg+xml'"), CHECK);
  await q("UPDATE company_settings SET logo = '\\\\x89504e47', logo_type = 'image/png', logo_updated_at = now()");
});

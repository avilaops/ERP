import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type pg from "pg";
import { migrate } from "@/lib/db/migrate";
import { MIGRATIONS_DIR, openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("migrate", { migrated: false });
});
after(async () => {
  if (!skip) await db.close();
});

/** `migrate` needs one connection: BEGIN and COMMIT have to land on the same one. */
async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

test("migração: aplica em ordem, registra e rodar de novo não muda nada", { skip }, async () => {
  const first = await withClient((client) => migrate(client, MIGRATIONS_DIR));
  assert.deepEqual(first, [
    "0001_parametros_e_produtos.sql",
    "0002_parametros_iniciais.sql",
    "0003_tabela_publicada.sql",
    "0004_clientes.sql",
    "0005_pedidos.sql",
    "0006_aliquotas_por_estado.sql",
    "0007_fotos_dos_produtos.sql",
    "0008_empresa_usuarios_e_auditoria.sql",
    "0009_aprovacoes_e_financeiro.sql",
    "0010_formas_de_pagamento.sql",
    "0011_dia_da_comissao_e_estorno.sql",
    "0012_categorias_de_contas.sql",
    "0013_provisoes_taxa_fixa_e_despesas_fixas.sql",
    "0014_regras_de_aprovacao.sql",
  ]);

  const second = await withClient((client) => migrate(client, MIGRATIONS_DIR));
  assert.deepEqual(second, []);

  const { rows } = await db.pool.query("SELECT name FROM schema_migrations ORDER BY name");
  assert.deepEqual(rows.map((row) => row.name), first);

  const tables = await db.pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name",
    [db.schema],
  );
  assert.deepEqual(tables.rows.map((row) => row.table_name), [
    "audit_log",
    "commissions",
    "company_settings",
    "customers",
    "fixed_expenses",
    "idempotency_keys",
    "lost_reasons",
    "order_approvals",
    "order_closings",
    "order_items",
    "orders",
    "payable_categories",
    "payables",
    "payment_methods",
    "price_table_items",
    "price_table_state_rates",
    "price_table_versions",
    "pricing_params",
    "pricing_params_history",
    "product_photos",
    "products",
    "receipts",
    "receivables",
    "refund_requests",
    "refunds",
    "sales_goals",
    "schema_migrations",
    "state_tax_rates",
    "suppliers",
    "users",
  ]);
});

test("migração: os parâmetros iniciais não sobrescrevem o que a diretoria já gravou", { skip }, async () => {
  await db.pool.query("UPDATE pricing_params SET target_net_profit = 0.12, updated_by = 'diretoria@teste.local'");
  await db.pool.query("DELETE FROM schema_migrations WHERE name = '0002_parametros_iniciais.sql'");
  const again = await withClient((client) => migrate(client, MIGRATIONS_DIR));
  assert.deepEqual(again, ["0002_parametros_iniciais.sql"]);
  const { rows } = await db.pool.query("SELECT target_net_profit, updated_by FROM pricing_params");
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].target_net_profit), 0.12);
  assert.equal(rows[0].updated_by, "diretoria@teste.local");
});

test("migração: custo real e preço de tabela não são colunas; crédito guarda oito casas", { skip }, async () => {
  const columns = await db.pool.query(
    `SELECT column_name, numeric_precision, numeric_scale FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = 'products'`,
    [db.schema],
  );
  const names = columns.rows.map((row) => row.column_name);
  for (const forbidden of ["real_cost", "table_price"]) assert.ok(!names.includes(forbidden), forbidden);

  const credit = columns.rows.find((row) => row.column_name === "tax_credit");
  assert.deepEqual([credit?.numeric_precision, credit?.numeric_scale], [10, 8]);
});

test("migração: arquivo que falha é desfeito inteiro e não fica registrado", { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "erp-migracao-"));
  try {
    writeFileSync(join(dir, "0001_ok.sql"), "CREATE TABLE falha_a (id integer)");
    writeFileSync(join(dir, "0002_quebrada.sql"), "CREATE TABLE falha_b (id integer); SELECT * FROM tabela_que_nao_existe");
    const other = await openTestDb("migrate_falha", { migrated: false });
    try {
      const client = await other.pool.connect();
      try {
        await assert.rejects(() => migrate(client, dir), /Migração 0002_quebrada\.sql falhou/);
      } finally {
        client.release();
      }
      const done = await other.pool.query("SELECT name FROM schema_migrations");
      assert.deepEqual(done.rows.map((row) => row.name), ["0001_ok.sql"]);
      const leftover = await other.pool.query(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'falha_b'",
        [other.schema],
      );
      assert.equal(leftover.rowCount, 0);
    } finally {
      await other.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migração: nome de arquivo fora do padrão é recusado antes de tocar o banco", { skip }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "erp-migracao-"));
  try {
    writeFileSync(join(dir, "ajuste.sql"), "SELECT 1");
    await withClient((client) => assert.rejects(() => migrate(client, dir), /Nome de migração inválido/));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

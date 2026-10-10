import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
    "0015_telas_por_pessoa.sql",
    "0016_cadastro_fiscal_e_certificado.sql",
    "0017_catalogo_do_fornecedor.sql",
    "0018_icms_de_saida_por_estado.sql",
    "0019_linhas_de_produto.sql",
    "0020_regras_fiscais.sql",
    "0021_notas_fiscais.sql",
    "0022_eventos_da_nota.sql",
    "0023_ibs_cbs.sql",
    "0024_frete_da_nota_e_inutilizacao.sql",
    "0025_transportadoras_e_volumes.sql",
    "0026_local_de_entrega_da_nota.sql",
    "0027_email_da_nota.sql",
    "0028_danfe_da_reforma.sql",
    "0029_gerente_e_local_da_proposta.sql",
    "0030_linha_importada_ou_nao.sql",
    "0031_perfis_de_acesso.sql",
    "0032_saldo_na_entrega.sql",
    "0033_medidas_do_equipamento.sql",
    "0034_prazo_em_dias_uteis.sql",
    "0035_parcelas_combinadas.sql",
    "0036_contrato_do_pedido.sql",
    "0037_convite_por_email.sql",
    "0038_contrato_enviado_em_arquivo.sql",
    "0039_seguranca_do_contrato.sql",
    "0040_funil_comercial.sql",
    "0041_historico_do_funil.sql",
    "0042_lembretes_automaticos.sql",
    "0043_api_e_avisos.sql",
    "0044_mensagens_e_cadencias.sql",
    "0045_marketing.sql",
    "0046_ligacoes_e_reunioes.sql",
    "0047_email_recebido.sql",
    "0048_assistente.sql",
    "0049_whatsapp.sql",
    "0050_producao.sql",
    "0051_prospeccao.sql",
    "0052_telefonia.sql",
    "0053_modelos_com_campos_e_duracao.sql",
    "0054_materiais_da_producao.sql",
    "0055_apontamento_e_maquinas.sql",
    "0056_mcp.sql",
    "0057_base_da_receita.sql",
    "0058_modulo_de_producao_por_empresa.sql",
    "0059_cnpj_alfanumerico_do_emitente.sql",
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
    "access_profiles",
    "ai_settings",
    "api_keys",
    "audit_log",
    "automation_rules",
    "cadence_steps",
    "cadences",
    "campaign_recipients",
    "campaigns",
    "capture_forms",
    "capture_submissions",
    "carriers",
    "commissions",
    "company_settings",
    "contract_settings",
    "customers",
    "fiscal_certificates",
    "fiscal_invoice_events",
    "fiscal_invoice_mails",
    "fiscal_invoices",
    "fiscal_number_voids",
    "fiscal_rules",
    "fixed_expenses",
    "idempotency_keys",
    "lost_reasons",
    "machines",
    "mail_optouts",
    "mail_settings",
    "mail_unsubscribe_links",
    "marketing_settings",
    "material_moves",
    "materials",
    "mcp_calls",
    "mcp_grants",
    "message_templates",
    "opportunities",
    "opportunity_activities",
    "opportunity_assists",
    "opportunity_cadences",
    "opportunity_inbox",
    "opportunity_meetings",
    "opportunity_messages",
    "opportunity_moves",
    "order_approvals",
    "order_closings",
    "order_contract_events",
    "order_contract_signatures",
    "order_contracts",
    "order_installments",
    "order_items",
    "orders",
    "payable_categories",
    "payables",
    "payment_methods",
    "pipeline_stages",
    "price_table_items",
    "price_table_state_rates",
    "price_table_versions",
    "pricing_params",
    "pricing_params_history",
    "product_lines",
    "product_materials",
    "product_photos",
    "production_moves",
    "production_orders",
    "production_stages",
    "production_work",
    "products",
    "prospect_filters",
    "prospect_loads",
    "prospects",
    "receipts",
    "receivables",
    "refund_requests",
    "refunds",
    "sales_goals",
    "schema_migrations",
    "state_tax_rates",
    "supplier_items",
    "suppliers",
    "users",
    "voice_calls",
    "voice_settings",
    "webhook_deliveries",
    "webhooks",
    "whatsapp_messages",
    "whatsapp_settings",
    "whatsapp_templates",
  ]);
});

test("migração: os parâmetros e as alíquotas que existiam passam a ser os da linha 1, a única", { skip }, async () => {
  const lines = await db.pool.query("SELECT id, name FROM product_lines");
  assert.deepEqual(lines.rows, [{ id: 1, name: "Importada" }]);
  const params = await db.pool.query("SELECT line_id, updated_by FROM pricing_params");
  assert.deepEqual(params.rows, [{ line_id: 1, updated_by: "migracao-0002" }]);
  const rates = await db.pool.query("SELECT DISTINCT line_id, count(*)::int AS states FROM state_tax_rates GROUP BY line_id");
  assert.deepEqual(rates.rows, [{ line_id: 1, states: 27 }]);
  // A próxima linha criada pela tela não colide com a 1.
  const next = await db.pool.query("SELECT nextval(pg_get_serial_sequence('product_lines', 'id'))::int AS id");
  assert.equal(next.rows[0].id, 2);
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

test("o pacote publicado leva tudo o que o db-migrate.ts importa", async () => {
  // A migração roda dentro do container, só com o que o empacotar.sh copia. Arquivo
  // importado e não copiado derruba o deploy na hora de migrar.
  const { readFileSync } = await import("node:fs");
  const { dirname, join, relative } = await import("node:path");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const packer = readFileSync(join(root, "deploy/empacotar.sh"), "utf8");
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const match of readFileSync(join(root, file), "utf8").matchAll(/from "(\.{1,2}\/[^"]+)"/g)) {
      walk(relative(root, join(root, dirname(file), match[1])));
    }
  };
  walk("scripts/db-migrate.ts");
  assert.ok(seen.size > 3);
  for (const file of seen) assert.ok(packer.includes(file), `${file} não é copiado pelo deploy/empacotar.sh`);
  for (const folder of ["db/migrations", "db/control"]) assert.ok(packer.includes(`cp -r ${folder} `), folder);
});

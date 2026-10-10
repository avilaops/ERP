import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { REPORTS, reportOf, runReport } from "@/lib/db/reports";
import type { ReportFilter } from "@/lib/db/reports";
import { parsePeriod, personOf, reportCsv, showCell } from "@/lib/reports-view";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
const TODAY = "2026-10-10";
const ALL: ReportFilter = { from: null, to: null, person: null, today: TODAY };
let db: TestDb;

before(async () => {
  if (!skip) db = await openTestDb("reports");
});
after(async () => {
  if (!skip) await db.close();
});

test("relatórios: todos rodam numa empresa vazia, com resumo e colunas e nenhuma linha de movimento", { skip }, async () => {
  for (const report of REPORTS) {
    const data = await runReport(report.key, ALL, db.pool);
    assert.ok(data.summary.length > 0 && data.columns.length > 0, report.key);
    for (const row of data.rows) assert.equal(row.length, data.columns.length, report.key);
    if (report.key !== "produtos" && report.key !== "clientes") assert.deepEqual(data.rows, [], report.key);
    // Nenhum relatório fala de custo, margem ou lucro.
    assert.doesNotMatch([...data.columns.map((column) => column.label), ...data.summary.map((figure) => figure.label)].join(" "), /custo|margem|lucro/i, report.key);
  }
});

test("relatórios: contas a pagar somam o total, o pago, o aberto e o vencido, dentro do período", { skip }, async () => {
  await db.pool.query(
    `INSERT INTO payables (description, category, amount, due_date, status, paid_on, paid_amount, updated_by) VALUES
       ('Frete de setembro', 'Frete', 1000, '2026-09-20', 'paga', '2026-09-21', 990, 'teste'),
       ('Aluguel', 'Fixas', 2500.50, '2026-10-05', 'aberta', NULL, NULL, 'teste'),
       ('=Contador', 'Fixas', 800, '2026-10-30', 'aberta', NULL, NULL, 'teste')`,
  );
  const all = await runReport("contas-pagar", ALL, db.pool);
  assert.deepEqual(all.summary.map((figure) => [figure.label, figure.value]), [["Total das contas", 4300.5], ["Pago", 990], ["A pagar", 3300.5], ["Vencido", 2500.5]]);
  assert.deepEqual(all.rows.map((row) => [row[0], row[3], row[5]]), [["Frete de setembro", "2026-09-20", "Paga"], ["Aluguel", "2026-10-05", "Vencida"], ["=Contador", "2026-10-30", "A pagar"]]);

  const october = await runReport("contas-pagar", { ...ALL, from: "2026-10-01", to: "2026-10-31" }, db.pool);
  assert.deepEqual([october.rows.length, october.summary[0].value], [2, 3300.5]);

  // Na planilha: vírgula decimal, data no nosso formato e célula que parece fórmula neutralizada.
  const csv = reportCsv(all);
  assert.ok(csv.startsWith("Conta;Fornecedor;Categoria;Vence em;Valor;Situação;Paga em;Valor pago\r\n"));
  assert.ok(csv.includes("Frete de setembro;;Frete;20/09/2026;1000,00;Paga;21/09/2026;990,00\r\n"));
  assert.ok(csv.includes("'=Contador;;Fixas;30/10/2026;800,00;A pagar;;\r\n"));
});

test("relatórios: produtos mostram NCM e origem e contam os ativos sem NCM", { skip }, async () => {
  await db.pool.query(
    `INSERT INTO products (name, code, ncm, origin, active, updated_by) VALUES ('Leg Press', 'T-1', '95069100', 1, true, 'teste'), ('Banco', 'T-2', NULL, NULL, true, 'teste'), ('Antigo', 'T-3', NULL, NULL, false, 'teste')`,
  );
  const data = await runReport("produtos", ALL, db.pool);
  const mine = data.rows.filter((row) => String(row[0]).startsWith("T-"));
  assert.deepEqual(mine.map((row) => [row[0], row[3], row[4], row[6]]), [["T-1", "9506.91.00", "1", "Ativo"], ["T-2", null, null, "Ativo"], ["T-3", null, null, "Inativo"]]);
  const figure = (label: string) => data.summary.find((item) => item.label === label)!.value;
  assert.ok(figure("Ativos sem NCM") >= 1 && figure("Inativos") >= 1);
  assert.equal(showCell(null, "text"), "—");
});

test("relatórios: no funil o vendedor lê só as oportunidades dele; clientes entram todos", { skip }, async () => {
  const { rows } = await db.pool.query("SELECT id FROM pipeline_stages WHERE kind = 'aberta' ORDER BY position LIMIT 1");
  await db.pool.query(
    `INSERT INTO opportunities (title, company, stage_id, owner_email, owner_name, estimated_value, created_by, updated_by) VALUES
       ('Academia A', 'A Ltda', $1, 'ana@teste.local', 'Ana', 10000, 'teste', 'teste'), ('Academia B', 'B Ltda', $1, 'caio@teste.local', 'Caio', 5000, 'teste', 'teste')`,
    [rows[0].id],
  );
  await db.pool.query("INSERT INTO customers (kind, document, name, updated_by) VALUES ('PJ', '48240052000161', 'Academia Teste', 'teste')");
  const team = await runReport("funil", ALL, db.pool);
  assert.deepEqual([team.rows.length, team.summary.find((figure) => figure.label === "Valor estimado em aberto")!.value], [2, 15000]);
  const own = await runReport("funil", { ...ALL, person: "caio@teste.local" }, db.pool);
  assert.deepEqual(own.rows.map((row) => row[0]), ["Academia B"]);
  const customers = await runReport("clientes", { ...ALL, person: "caio@teste.local" }, db.pool);
  assert.deepEqual(customers.rows.map((row) => [row[0], row[6], row[7]]), [["Academia Teste", 0, null]]);
});

test("relatórios: período pronto, datas escolhidas e o que cada pessoa lê", () => {
  assert.deepEqual(parsePeriod({}, TODAY), { key: "ano", from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(parsePeriod({ periodo: "mes" }, TODAY), { key: "mes", from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(parsePeriod({ periodo: "mes-passado" }, "2026-01-15"), { key: "mes-passado", from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(parsePeriod({ periodo: "mes" }, "2028-02-10"), { key: "mes", from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(parsePeriod({ periodo: "tudo" }, TODAY), { key: "tudo", from: null, to: null });
  assert.deepEqual(parsePeriod({ de: "2026-03-01", ate: "2026-03-15", periodo: "mes" }, TODAY), { key: "datas", from: "2026-03-01", to: "2026-03-15" });
  // Datas trocadas, incompletas ou que não existem caem no período pronto.
  for (const query of [{ de: "2026-03-15", ate: "2026-03-01" }, { de: "2026-03-01" }, { de: "2026-13-01", ate: "2026-13-02" }, { periodo: "qualquer" }]) assert.equal(parsePeriod(query, TODAY).key, "ano");

  const seller = { role: "VENDEDOR", email: "caio@teste.local" } as const;
  const boss = { role: "DIRETORIA", email: "dono@teste.local" } as const;
  const finance = { role: "FINANCEIRO", email: "fin@teste.local" } as const;
  assert.equal(personOf(reportOf("vendas")!, seller), "caio@teste.local");
  assert.equal(personOf(reportOf("comissoes")!, seller), "caio@teste.local");
  assert.equal(personOf(reportOf("vendas")!, boss), null);
  assert.equal(personOf(reportOf("comissoes")!, finance), null);
  assert.equal(personOf(reportOf("contas-pagar")!, finance), null);
  assert.equal(reportOf("nada"), null);
});

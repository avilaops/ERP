import assert from "node:assert/strict";
import { test } from "node:test";
import { loadOrderOverview, queryOrders } from "@/lib/db/orders";
import { queryProducts } from "@/lib/db/products";
import { queryPriceTableReview } from "@/lib/db/price-table-review";
import type { Queryable } from "@/lib/db/pool";
import { querySuppliers } from "@/lib/db/suppliers";
import { parseListQuery } from "@/lib/list-query";

type Call = { text: string; values?: unknown[] };

test("fornecedores: busca, filtros e paginação são executados no banco", async () => {
  const calls: Call[] = [];
  const conn = { query: async (text: string, values?: unknown[]) => {
    calls.push({ text, values });
    if (text.startsWith("SELECT count")) return { rows: [{ total: "3000" }] };
    return { rows: [{ id: 51, kind: "EX", document: "CN-51", name: "Fábrica", trade_name: "Factory", contact_name: "Li", phone: null, email: null, country: "China", bank_details: {}, notes: null, active: true, updated_at: new Date("2026-10-01") }] };
  } } as unknown as Queryable;
  const options = { sorts: ["nome", "cadastro"] as const, defaultSort: "nome" as const, filters: { tipo: ["PJ", "PF", "EX"], pais: ["China"], situacao: ["ativo", "inativo"] } };
  const query = parseListQuery({ q: " fabrica ", pagina: "121", porPagina: "25", tipo: "EX", pais: "China", situacao: "ativo" }, options);

  const result = await querySuppliers(query, conn);
  assert.deepEqual([result.total, result.page, result.pages, result.from, result.to], [3000, 120, 120, 2976, 2976]);
  assert.equal(result.items[0].name, "Fábrica");
  assert.equal(calls.length, 2);
  assert.match(calls[1].text, /LIMIT \$\d+ OFFSET \$\d+/);
  assert.deepEqual(calls[1].values?.slice(-2), [25, 2975]);
  assert.ok(calls.every((call) => call.values?.some((value) => Array.isArray(value) && value.includes("EX"))));
  assert.ok(calls.every((call) => call.text.includes("country = ANY")));
});

test("produtos: carrega somente a página visível e mantém o filtro da aba", async () => {
  const calls: Call[] = [];
  const conn = { query: async (text: string, values?: unknown[]) => {
    calls.push({ text, values });
    if (text.startsWith("SELECT count")) return { rows: [{ total: "2941" }] };
    return { rows: [{ id: 26, name: "Supino", code: "LD-A026", description: null, supplier_name: "DHZ", supplier_model: "SM26", supplier_price_usd: 400, advisory_cost: 5500, tax_credit: 0.2780009, packaging: 0, active: true, line_id: 1, ncm: "95069100", plate_loaded: false, has_photo: true }] };
  } } as unknown as Queryable;
  const options = { sorts: ["codigo", "nome"] as const, defaultSort: "codigo" as const, filters: { aba: ["ativos", "sem-custo", "sem-codigo", "inativos"] } };
  const query = parseListQuery({ q: "supino", pagina: "2", porPagina: "50", aba: "ativos", ordenar: "nome", direcao: "desc" }, options);

  const result = await queryProducts(query, 1, conn);
  assert.deepEqual([result.total, result.page, result.pageSize, result.from, result.to], [2941, 2, 50, 51, 51]);
  assert.equal(result.items[0].taxCredit, 0.2780009);
  assert.match(calls[0].text, /SELECT count\(\*\)/);
  assert.match(calls[1].text, /ORDER BY lower\(name\) DESC/);
  assert.deepEqual(calls[1].values?.slice(-2), [50, 50]);
  assert.ok(calls.every((call) => call.text.includes("AND active")));
});

test("revisão da publicação filtra, conta e pagina no banco", async () => {
  const calls: Call[] = [];
  const conn = { query: async (text: string, values?: unknown[]) => {
    calls.push({ text, values });
    if (text.includes("SELECT count(*) AS total")) return { rows: [{ total: "3000" }] };
    return { rows: [{ category: "regras", current_id: 51, current_name: "Supino", current_code: "LD-51", current_cost: "1000", current_credit: "0.1", current_packaging: "50", line_id: 1, old_id: 51, old_name: "Supino", old_code: "LD-51", old_cost: "1000", old_credit: "0.1", old_packaging: "50", old_table: "2000", old_table_ipi: "2260" }] };
  } } as unknown as Queryable;
  const options = { sorts: ["nome"] as const, defaultSort: "nome" as const, filters: { categoria: ["custos", "novos", "removidos", "cadastro", "regras"] } };
  const query = parseListQuery({ q: "supino", pagina: "2", porPagina: "100", categoria: "regras" }, options);
  const result = await queryPriceTableReview(query, 1, 6, true, 0.05, conn);
  assert.deepEqual([result.total, result.page, result.pages, result.from, result.to], [3000, 2, 30, 101, 101]);
  assert.equal(result.items[0].category, "regras");
  assert.match(calls[1].text, /LIMIT \$7 OFFSET \$8/);
  assert.deepEqual(calls[1].values?.slice(-2), [100, 100]);
  assert.ok(calls.every((call) => call.text.includes("FROM price_table_items WHERE version = $2")));
});

test("pedidos: lista paginada e indicadores usam consultas agregadas, sem carregar 3 mil pedidos", async () => {
  const calls: Call[] = [];
  const conn = { query: async (text: string, values?: unknown[]) => {
    calls.push({ text, values });
    if (text.startsWith("SELECT count")) return { rows: [{ total: "2105" }] };
    if (text.includes("WITH scoped AS")) return { rows: [{ open_count: 2105, approval_count: 2, closed_count: 600, lost_count: 301, all_count: 3008, open_total: "90973773.09", month_count: 3, month_total: "97812.61", average_discount: "0.08" }] };
    return { rows: [{ number: "261018-TEST", status: "em_negociacao", seller_email: "vendas@teste.local", seller_name: "Vendedor", customer_name: "Academia", trade_name: null, customer_document: "48240052000161", delivery_uf: "SP", taxpayer: true, discount: 0.08, ipi: 0.13, updated_at: new Date("2026-10-18T12:00:00Z"), closed_at: null, items: [{ quantity: 2, price: 1000 }] }] };
  } } as unknown as Queryable;
  const options = { sorts: ["atualizacao", "numero", "cliente", "vendedor"] as const, defaultSort: "atualizacao" as const, defaultDirection: "desc" as const, filters: { aba: ["abertos", "aprovacao", "fechados", "perdidos", "todos"] } };
  const query = parseListQuery({ q: "DM09", pagina: "527", porPagina: "10", aba: "abertos" }, options);

  const [result, overview] = await Promise.all([
    queryOrders(query, { sellerEmail: null }, conn),
    loadOrderOverview({ sellerEmail: null }, "2026-10", conn),
  ]);
  assert.deepEqual([result.total, result.page, result.pages, result.from, result.to], [2105, 211, 211, 2101, 2101]);
  assert.deepEqual(result.items[0].items, [{ quantity: 2, tableUnitPrice: 1000 }]);
  assert.deepEqual(overview.counts, { abertos: 2105, aprovacao: 2, fechados: 600, perdidos: 301, todos: 3008 });
  assert.deepEqual(overview.indicators.closedInMonth, { count: 3, total: 97812.61 });
  const pageCall = calls.find((call) => call.text.includes("json_agg"));
  assert.ok(pageCall);
  assert.deepEqual(pageCall.values?.slice(0, 3), [null, "dm09", ""]);
  assert.match(pageCall.text, /\$3 <> ''/);
  assert.match(pageCall.text, /regexp_replace\(\$2, '\^#', ''\) <> ''/);
  assert.deepEqual(pageCall.values?.slice(-2), [10, 2100]);
  assert.ok(calls.some((call) => call.text.includes("count(*) FILTER")));
  await assert.rejects(() => loadOrderOverview({ sellerEmail: null }, "18/10/2026", conn), /Mês inválido/);
});

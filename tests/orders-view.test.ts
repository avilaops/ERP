import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrderSummary } from "@/lib/db/orders";
import { matchesOrder, ORDER_TABS, ordersCount, ordersView, parseOrderTab } from "@/lib/orders-view";

const order = (over: Partial<OrderSummary>): OrderSummary => ({
  number: "260930-BBMN",
  status: "em_negociacao",
  sellerEmail: "ana@exemplo.com",
  sellerName: "Ana",
  customerName: "Academia São João",
  customerDocument: "48240052000161",
  deliveryUf: "MA",
  taxpayer: false,
  discount: 0,
  ipi: 0.13,
  updatedAt: new Date("2026-09-30T13:06:00Z"),
  closedAt: null,
  items: [
    { quantity: 1, tableUnitPrice: 19204.61 },
    { quantity: 1, tableUnitPrice: 20818.99 },
  ],
  ...over,
});

const ORDERS = [
  order({}),
  order({ number: "260930-536F", sellerEmail: "bia@exemplo.com", sellerName: "Bia", customerName: null, customerDocument: null, deliveryUf: null, items: [{ quantity: 3, tableUnitPrice: 1000 }] }),
  order({ number: "261001-AAAA", status: "fechado", discount: 0.1, deliveryUf: "SP", closedAt: new Date("2026-10-01T15:00:00Z") }),
  order({ number: "261002-BBBB", status: "aguardando_aprovacao", deliveryUf: "RJ", taxpayer: true }),
  order({ number: "260901-CCCC", status: "fechado", discount: 0.2, closedAt: new Date("2026-09-01T15:00:00Z") }),
  order({ number: "260902-DDDD", status: "perdido" }),
];
const VIEW = { tab: "todos", search: "", me: "ana@exemplo.com", month: "2026-10" } as const;

test("abas: a do endereço, ou Em aberto quando não existe", () => {
  assert.deepEqual(ORDER_TABS.map((tab) => tab.label), ["Em aberto", "Com aprovação", "Fechados", "Perdidos", "Todos"]);
  assert.equal(parseOrderTab("fechados"), "fechados");
  for (const value of [undefined, "", "x", "FECHADOS"]) assert.equal(parseOrderTab(value), "abertos");
});

test("lista: linha do print, com o total que sai do motor", () => {
  const { rows } = ordersView(ORDERS, VIEW);
  assert.deepEqual(rows[0], {
    number: "260930-BBMN",
    customer: "Academia São João",
    detail: "#260930-BBMN · MA s/ IE · 2 un.",
    document: "48.240.052/0001-61",
    seller: "Você",
    total: "R$ 45.226,67",
    discount: "0,0%",
    status: "em_negociacao",
    statusLabel: "Em negociação",
    updated: "30/09/2026 10:06",
  });
  assert.deepEqual([rows[1].customer, rows[1].detail, rows[1].document, rows[1].seller, rows[1].total], ["sem cliente", "#260930-536F · 3 un.", null, "Bia", "R$ 3.390"]);
  // Dentro do estado de origem e contribuinte não levam "s/ IE".
  assert.deepEqual([rows[2].detail, rows[3].detail], ["#261001-AAAA · SP · 2 un.", "#261002-BBBB · RJ · 2 un."]);
});

test("lista: cada aba traz a sua situação e a contagem não muda com a busca", () => {
  const counts = { abertos: 2, aprovacao: 1, fechados: 2, perdidos: 1, todos: 6 };
  assert.deepEqual(ordersView(ORDERS, VIEW).counts, counts);
  assert.deepEqual(ordersView(ORDERS, { ...VIEW, tab: "abertos" }).rows.map((row) => row.number), ["260930-BBMN", "260930-536F"]);
  assert.deepEqual(ordersView(ORDERS, { ...VIEW, tab: "fechados" }).rows.map((row) => row.number), ["261001-AAAA", "260901-CCCC"]);
  const searched = ordersView(ORDERS, { ...VIEW, tab: "abertos", search: "536f" });
  assert.deepEqual(searched.rows.map((row) => row.number), ["260930-536F"]);
  assert.deepEqual(searched.counts, counts);
});

test("busca: por nome sem acento, por CNPJ com ou sem pontuação, e por número com ou sem #", () => {
  const [first, second] = ORDERS;
  for (const text of ["sao joao", "ACADEMIA", "48.240.052/0001-61", "48240052", "#260930-BBMN", "bbmn", "  "]) {
    assert.ok(matchesOrder(first, text), text);
  }
  for (const text of ["outra", "11111111", "#ZZZZ"]) assert.ok(!matchesOrder(first, text), text);
  assert.ok(matchesOrder(second, "536F"));
  assert.ok(!matchesOrder(second, "academia"));
});

test("indicadores valem para tudo o que a sessão alcança, seja qual for a aba e a busca", () => {
  const all = ordersView(ORDERS, VIEW).indicators;
  const narrowed = ordersView(ORDERS, { ...VIEW, tab: "perdidos", search: "nada" });
  assert.equal(narrowed.rows.length, 0);
  assert.deepEqual(narrowed.indicators, all);
  assert.equal(ordersCount(1), "1 pedido");
  assert.equal(ordersCount(2, " no mês"), "2 pedidos no mês");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboardView, goalsView, parsePeriod, periodStart, sellersView, shiftMonth, shortMonth } from "@/lib/dashboard-view";
import type { DashboardOrder } from "@/lib/db/dashboard";

const order = (over: Partial<DashboardOrder>): DashboardOrder => ({
  number: "261001-AAAA", status: "fechado", sellerEmail: "ana@x", sellerName: "Ana", deliveryUf: "MA", discount: 0, ipi: 0.13,
  createdOn: "2026-10-01", closedOn: "2026-10-02", items: [{ name: "Supino", quantity: 1, tableUnitPrice: 1000 }], ...over,
});

const ORDERS = [
  order({}),
  order({ number: "261003-BBBB", sellerEmail: "bia@x", sellerName: "Bia", deliveryUf: "SP", discount: 0.1, items: [{ name: "Supino", quantity: 2, tableUnitPrice: 1000 }, { name: "Leg press", quantity: 1, tableUnitPrice: 5000 }] }),
  order({ number: "261004-CCCC", status: "em_negociacao", closedOn: null }),
  order({ number: "261005-DDDD", status: "aguardando_aprovacao", closedOn: null }),
  order({ number: "261005-EEEE", status: "perdido", closedOn: null }),
  // Criado em setembro e fechado em outubro: conta no fechado de outubro, não no funil de outubro.
  order({ number: "260920-FFFF", createdOn: "2026-09-20", closedOn: "2026-10-05", items: [{ name: "Esteira", quantity: 1, tableUnitPrice: 2000 }] }),
  // Fechado em agosto: fora de "este mês", dentro de 3 meses, ano e 12 meses.
  order({ number: "260810-GGGG", createdOn: "2026-08-10", closedOn: "2026-08-11" }),
  order({ number: "251005-HHHH", createdOn: "2025-10-05", closedOn: "2025-10-06" }),
];

test("períodos: este mês, 3 meses, ano e 12 meses", () => {
  assert.equal(parsePeriod("12m"), "12m");
  for (const value of [undefined, "", "x"]) assert.equal(parsePeriod(value), "mes");
  assert.deepEqual(["mes", "3m", "ano", "12m"].map((period) => periodStart(period as "mes", "2026-02-10")), ["2026-02", "2025-12", "2026-01", "2025-03"]);
  assert.deepEqual([shiftMonth("2026-01", -1), shiftMonth("2026-12", 1), shiftMonth("2026-10", -11)], ["2025-12", "2027-01", "2025-11"]);
  assert.equal(shortMonth("2026-10"), "out/26");
});

test("dashboard do mês: fechado, ticket, conversão, desconto médio, funil e rankings", () => {
  const view = dashboardView(ORDERS, "mes", "2026-10-06");
  // 1.130 + (7.000 × 0,9 × 1,13 = 7.119) + 2.260
  assert.deepEqual(view.closed, { total: 10509, count: 3 });
  assert.equal(view.averageTicket, 3503);
  assert.equal(view.averageDiscount?.toFixed(4), "0.0333");
  // Criados em outubro: 2 fechados e 1 perdido decidem a conversão.
  assert.deepEqual(view.funnel, { created: 5, negotiating: 1, waiting: 1, closed: 2, lost: 1 });
  assert.equal(view.conversion?.toFixed(4), "0.6667");
  assert.deepEqual(view.bySeller, [{ label: "Bia", value: 7119 }, { label: "Ana", value: 3390 }]);
  assert.deepEqual(view.byState, [{ label: "SP", value: 7119 }, { label: "MA", value: 3390 }]);
  // Sem IPI, já com o desconto do pedido.
  assert.deepEqual(view.byProduct, [{ label: "Leg press", value: 4500 }, { label: "Supino", value: 2800 }, { label: "Esteira", value: 2000 }]);
  assert.deepEqual(view.closedNumbers, ["261001-AAAA", "261003-BBBB", "260920-FFFF"]);
});

test("dashboard: doze meses no gráfico, do mais antigo ao atual, seja qual for o período", () => {
  const view = dashboardView(ORDERS, "mes", "2026-10-06");
  assert.equal(view.byMonth.length, 12);
  assert.deepEqual([view.byMonth[0].label, view.byMonth[11].label], ["nov/25", "out/26"]);
  assert.deepEqual(view.byMonth.filter((bar) => bar.value > 0), [{ label: "ago/26", value: 1130 }, { label: "out/26", value: 10509 }]);
  // Outubro de 2025 já saiu dos doze meses.
  assert.deepEqual([dashboardView(ORDERS, "3m", "2026-10-06").closed.count, dashboardView(ORDERS, "ano", "2026-10-06").closed.count, dashboardView(ORDERS, "12m", "2026-10-06").closed.count], [4, 4, 4]);
  const empty = dashboardView([], "mes", "2026-10-06");
  assert.deepEqual([empty.closed.total, empty.averageTicket, empty.conversion, empty.averageDiscount, empty.bySeller.length], [0, null, null, null, 0]);
});

test("quem está vendendo: pedidos, em aberto, fechados e o total fechado de cada um", () => {
  assert.deepEqual(sellersView(ORDERS), [
    { sellerEmail: "bia@x", sellerName: "Bia", orders: 1, open: 0, closed: 1, closedTotal: 7119 },
    { sellerEmail: "ana@x", sellerName: "Ana", orders: 7, open: 2, closed: 4, closedTotal: 5650 },
  ]);
});

test("metas do mês: a equipe primeiro, depois quem tem meta ou vendeu", () => {
  const sellers = [{ email: "ana@x", name: "Ana" }, { email: "bia@x", name: "Bia" }, { email: "caio@x", name: "Caio" }, { email: "dani@x", name: "Dani" }];
  const goals = [{ sellerEmail: null, amount: 20000 }, { sellerEmail: "ana@x", amount: 6780 }, { sellerEmail: "caio@x", amount: 5000 }];
  const view = goalsView(ORDERS, goals, sellers, "2026-10");
  assert.deepEqual(
    view.map((row) => [row.label, row.goal, row.closed, row.rate === null ? null : Number(row.rate.toFixed(3))]),
    [["Toda a equipe", 20000, 10509, 0.525], ["Bia", 0, 7119, null], ["Ana", 6780, 3390, 0.5], ["Caio", 5000, 0, 0]],
  );
  assert.deepEqual(goalsView([], [], sellers, "2026-10"), [{ label: "Toda a equipe", sellerEmail: null, goal: 0, closed: 0, rate: null }]);
});

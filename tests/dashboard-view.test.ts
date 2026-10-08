import assert from "node:assert/strict";
import { test } from "node:test";
import { cashForecast, change, dashboardView, goalsView, previousRange, parsePeriod, periodStart, sellersView, shiftMonth, shortMonth } from "@/lib/dashboard-view";
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

test("em aberto por idade: o que está em negociação ou esperando aprovação hoje, pelo tempo desde a abertura", () => {
  const open = (number: string, createdOn: string, status: DashboardOrder["status"] = "em_negociacao") =>
    order({ number, status, createdOn, closedOn: null, ipi: 0 });
  const view = dashboardView(
    [open("A", "2026-10-06"), open("B", "2026-09-29", "aguardando_aprovacao"), open("C", "2026-09-20"), open("D", "2026-08-01"), order({}), order({ number: "L", status: "perdido", closedOn: null })],
    "mes",
    "2026-10-06",
  );
  assert.deepEqual(view.open, {
    total: 4000,
    count: 4,
    byAge: [
      { label: "Até 7 dias", value: 2000, count: 2 },
      { label: "16 a 30 dias", value: 1000, count: 1 },
      { label: "Mais de 30 dias", value: 1000, count: 1 },
    ],
  });
});

test("período anterior: mesmo tamanho logo antes; no Ano, janeiro ao mesmo mês do ano passado; variação só quando há com o que comparar", () => {
  assert.deepEqual(previousRange("mes", "2026-10-06"), { start: "2026-09", end: "2026-09" });
  assert.deepEqual(previousRange("3m", "2026-10-06"), { start: "2026-05", end: "2026-07" });
  assert.deepEqual(previousRange("12m", "2026-10-06"), { start: "2024-11", end: "2025-10" });
  assert.deepEqual(previousRange("ano", "2026-10-06"), { start: "2025-01", end: "2025-10" });

  // Setembro não teve pedido fechado: nada a comparar.
  const month = dashboardView(ORDERS, "mes", "2026-10-06");
  assert.deepEqual(month.previous.closed, { total: 0, count: 0 });
  assert.equal(change(month.closed.total, month.previous.closed.total), null);
  // Em 12 meses, o período anterior pega o pedido fechado em outubro de 2025 (1.130).
  const year = dashboardView(ORDERS, "12m", "2026-10-06");
  assert.deepEqual(year.previous.closed, { total: 1130, count: 1 });
  assert.deepEqual(year.previous.closedNumbers, ["251005-HHHH"]);
  assert.equal(year.previous.averageTicket, 1130);
  assert.equal(change(year.closed.total, year.previous.closed.total)?.toFixed(2), ((year.closed.total - 1130) / 1130).toFixed(2));
  assert.equal(change(50, 100), -0.5);
  assert.equal(change(null, 100), null);
  // Os pedidos fechados de cada mês do gráfico, para o lucro por mês da diretoria.
  assert.deepEqual(month.closedByMonth.at(-1), { label: "out/26", numbers: ["261001-AAAA", "261003-BBBB", "260920-FFFF"] });
  assert.deepEqual(month.closedByMonth.find((item) => item.label === "ago/26")?.numbers, ["260810-GGGG"]);
  assert.equal(month.closedByMonth.length, 12);
});

test("caixa previsto: seis meses, cada valor no mês do vencimento; o vencido e o sem data contam no mês atual; acumulado soma os saldos", () => {
  const cash = cashForecast(
    [{ dueDate: "2026-09-10", amount: 1000 }, { dueDate: null, amount: 500 }, { dueDate: "2026-10-20", amount: 2000 }, { dueDate: "2026-12-05", amount: 3000.555 }, { dueDate: "2027-04-01", amount: 9999 }],
    [{ dueDate: "2026-10-05", amount: 800 }, { dueDate: "2026-11-10", amount: 4000 }],
    "2026-10-08",
  );
  assert.deepEqual(cash.map((month) => month.label), ["outubro/2026", "novembro/2026", "dezembro/2026", "janeiro/2027", "fevereiro/2027", "março/2027"]);
  assert.deepEqual(cash[0], { label: "outubro/2026", comesIn: 3500, goesOut: 800, balance: 2700, accumulated: 2700 });
  assert.deepEqual(cash[1], { label: "novembro/2026", comesIn: 0, goesOut: 4000, balance: -4000, accumulated: -1300 });
  assert.deepEqual([cash[2].comesIn, cash[2].accumulated, cash[5].accumulated], [3000.56, 1700.56, 1700.56]);
});

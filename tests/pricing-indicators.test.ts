import assert from "node:assert/strict";
import { test } from "node:test";
import { orderIndicators } from "@/lib/pricing/indicators";
import { downPaymentFromRate } from "@/lib/pricing/payment";

const closed = (invoiceTotal: number, discount: number, closedOn = "2026-09-30") => ({ status: "fechado", discount, invoiceTotal, closedOn });
/** The three closed orders of the print of Pedidos. */
const PRINT = [closed(45226.67, 0), closed(111259.41, 0.28), closed(114708.28, 0.2)];

test("indicadores: os três pedidos fechados do print", () => {
  const indicators = orderIndicators(PRINT, "2026-09");
  assert.deepEqual(indicators.closedInMonth, { total: 271194.36, count: 3 });
  assert.equal(indicators.closeRate, 1);
  assert.equal(((indicators.averageClosedDiscount ?? 0) * 100).toFixed(1), "16.0");
  assert.deepEqual(indicators.open, { total: 0, count: 0 });
});

test("indicadores: perdidos entram na taxa, outro mês sai do card, em negociação tem o seu", () => {
  const orders = [
    ...PRINT,
    { status: "perdido", discount: 0.1, invoiceTotal: 50000, closedOn: null },
    { status: "em_negociacao", discount: 0.05, invoiceTotal: 30000.5, closedOn: null },
    { status: "em_negociacao", discount: 0, invoiceTotal: 10000, closedOn: null },
    { status: "aguardando_aprovacao", discount: 0.3, invoiceTotal: 99999, closedOn: null },
    closed(20000, 0.1, "2026-10-02"),
  ];
  const september = orderIndicators(orders, "2026-09");
  assert.deepEqual(september.closedInMonth, { total: 271194.36, count: 3 });
  assert.deepEqual(september.open, { total: 40000.5, count: 2 });
  // Taxa e desconto médio olham todos os fechados, não só os do mês.
  assert.equal(september.closeRate, 4 / 5);
  assert.equal(((september.averageClosedDiscount ?? 0) * 100).toFixed(1), "14.5");
  assert.deepEqual(orderIndicators(orders, "2026-10").closedInMonth, { total: 20000, count: 1 });
  assert.equal(orderIndicators([...PRINT, { status: "perdido", discount: 0, invoiceTotal: 1, closedOn: null }], "2026-09").closeRate, 0.75);
});

test("indicadores: sem fechados nem perdidos não há taxa nem média; mês malformado é erro", () => {
  const none = orderIndicators([{ status: "em_negociacao", discount: 0, invoiceTotal: 100, closedOn: null }], "2026-09");
  assert.equal(none.closeRate, null);
  assert.equal(none.averageClosedDiscount, null);
  assert.deepEqual(orderIndicators([], "2026-09"), {
    open: { total: 0, count: 0 },
    closedInMonth: { total: 0, count: 0 },
    closeRate: null,
    averageClosedDiscount: null,
  });
  for (const month of ["2026-9", "09/2026", "", "2026-09-01"]) assert.throws(() => orderIndicators([], month), /Mês inválido/, month);
});

test("entrada por percentual: em centavos, sobre o total da nota", () => {
  assert.equal(downPaymentFromRate(0.65, 45226.67), 29397.34);
  assert.equal(downPaymentFromRate(0.5, 100.01), 50.01);
  assert.equal(downPaymentFromRate(0, 45226.67), 0);
  assert.equal(downPaymentFromRate(1, 45226.67), 45226.67);
  for (const rate of [-0.1, 1.01, Number.NaN]) assert.throws(() => downPaymentFromRate(rate, 100), /0% a 100%/, String(rate));
  assert.throws(() => downPaymentFromRate(0.5, -1), /Total da nota/);
});

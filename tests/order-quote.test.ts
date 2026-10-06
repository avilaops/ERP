import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublishedTable } from "@/lib/db/price-table";
import { closingProblems, paymentOf } from "@/lib/order-quote";
import type { SaleQuote } from "@/lib/pricing/order";

// Só o que `paymentOf` lê da versão: IPI, comissão e entrada mínima da política.
const TABLE = { ipi: 0.13, commission: 0.02, minDownPayment: 0.65 } as PublishedTable;
const sale = (invoiceTotal: number) => ({ invoiceTotal }) as SaleQuote;

const AGREED = {
  downPayment: 75000,
  downPaymentMethod: "PIX",
  downPaymentDate: "2026-09-28",
  balanceMethod: "Boleto",
  installmentCount: 3,
  firstInstallmentDays: 30,
  installmentIntervalDays: 30,
  closedAt: null,
};

test("pagamento do print: nota de 114.708,28, entrada de 75.000,00 e saldo em 3 parcelas", () => {
  const plan = paymentOf(AGREED, sale(114708.28), TABLE, "2026-10-06");
  assert.deepEqual([plan.downPayment, plan.balance, plan.installmentsTotal], [75000, 39708.28, 39708.28]);
  assert.equal((plan.downPaymentRate * 100).toFixed(1), "65.4");
  assert.deepEqual([plan.policyDownPayment, plan.meetsPolicy], [74560.38, true]);
  assert.deepEqual(
    plan.receipts.map(({ label, dueDate, method, amount, commission }) => [label, dueDate, method, amount, commission]),
    [
      ["Entrada", "2026-09-28", "PIX", 75000, 1327.43],
      ["1/3", "2026-10-28", "Boleto", 13236.09, 234.27],
      ["2/3", "2026-11-27", "Boleto", 13236.09, 234.27],
      ["3/3", "2026-12-27", "Boleto", 13236.1, 234.27],
    ],
  );
});

test("pagamento: sem data da entrada, as parcelas contam do fechamento e, sem ele, de hoje", () => {
  const today = paymentOf({ ...AGREED, downPaymentDate: null }, sale(114708.28), TABLE, "2026-10-06");
  assert.deepEqual(today.receipts.map((item) => item.dueDate), ["2026-10-06", "2026-11-05", "2026-12-05", "2027-01-04"]);
  const closed = paymentOf({ ...AGREED, downPaymentDate: null, closedAt: new Date("2026-10-01T15:00:00Z") }, sale(114708.28), TABLE, "2026-10-06");
  assert.equal(closed.receipts[0].dueDate, "2026-10-01");
});

test("pagamento: à vista não tem parcela; sem entrada não há linha de entrada; sem parcelas combinadas, só o saldo", () => {
  const full = paymentOf({ ...AGREED, downPayment: 1000 }, sale(1000), TABLE, "2026-10-06");
  assert.deepEqual([full.balance, full.receipts.length, full.installmentsTotal, full.downPaymentRate], [0, 1, 0, 1]);
  const none = paymentOf({ ...AGREED, downPayment: 0, installmentCount: 1 }, sale(1000), TABLE, "2026-10-06");
  assert.deepEqual(none.receipts.map((item) => [item.label, item.amount]), [["1/1", 1000]]);
  assert.equal(none.meetsPolicy, false);
  const open = paymentOf({ ...AGREED, installmentCount: null }, sale(100000), TABLE, "2026-10-06");
  assert.deepEqual([open.balance, open.receipts.length, open.installmentsTotal], [25000, 1, 0]);
  assert.equal(paymentOf(AGREED, sale(0), TABLE, "2026-10-06").downPaymentRate, 0);
});

test("fechar: a lista do que falta, na ordem da tela", () => {
  const blank = { customer: null, deliveryUf: null, productionDays: null, downPayment: 0, downPaymentMethod: null, balanceMethod: null, installmentCount: null };
  assert.deepEqual(closingProblems(blank, sale(1000)), [
    "Informe o cliente.",
    "Informe o estado de entrega.",
    "Informe o prazo de fabricação.",
    "Informe em quantas parcelas o saldo será pago.",
    "Informe a forma de pagamento do saldo.",
  ]);
  const paid = { ...blank, deliveryUf: "SP" as const, productionDays: 90, downPayment: 1000 };
  assert.deepEqual(closingProblems(paid, sale(1000)), ["Informe o cliente.", "Informe a forma da entrada."]);
  assert.deepEqual(closingProblems({ ...paid, downPayment: 1500, downPaymentMethod: "PIX" }, sale(1000)), [
    "Informe o cliente.",
    "A entrada é maior que o total da nota.",
  ]);
});

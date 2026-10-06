import assert from "node:assert/strict";
import { test } from "node:test";
import { commissionBase, commissionOn, commissionPaymentDate } from "@/lib/pricing/commission";
import { roundCents } from "@/lib/pricing/money";
import { quoteOrder } from "@/lib/pricing/order";
import { DEFAULT_PARAMS } from "@/lib/pricing/params";
import { addDays, installments, requiredDownPayment } from "@/lib/pricing/payment";
import { chinaPayment } from "@/lib/pricing/product";

const P = DEFAULT_PARAMS;

test("entrada mínima: Mesa Flexora com 20% de desconto em SP (manual, regra da entrada)", () => {
  const china = chinaPayment(8146.64, P);
  const netSale = 19204.61 * 0.8;
  const downPayment = requiredDownPayment({ chinaPayment: china, netSale }, P);
  const target = netSale * P.targetNetProfit;

  assert.equal(roundCents(china), 8553.97);
  assert.equal(roundCents(target), 2304.55);
  assert.equal(roundCents(downPayment - china - target), 195.65);
  assert.equal(roundCents(downPayment), 11054.17);
  // Conferência do manual, feita com os valores já em centavos.
  assert.equal(roundCents(11054.17 - roundCents(commissionOn(downPayment, P))), 10858.52);
  assert.equal(((downPayment / (netSale * (1 + P.ipi))) * 100).toFixed(0), "64");
});

test("entrada mínima: a conta do pedido devolve os mesmos valores", () => {
  const quote = quoteOrder(
    {
      items: [{ quantity: 1, tableUnitPrice: 19204.61, unitRealCost: 6148.97, unitAdvisoryCost: 8146.64 }],
      discount: 0.2,
      destination: { uf: "SP", taxpayer: false },
    },
    P,
  );
  assert.equal(quote.chinaPayment, 8553.97);
  assert.equal(quote.targetNetProfit, 2304.55);
  assert.equal(quote.downPaymentCommission, 195.65);
  assert.equal(quote.requiredDownPayment, 11054.17);
  assert.equal((quote.requiredDownPaymentRate * 100).toFixed(0), "64");
});

test("parcelas: saldo em 3 vezes, resto na última (print do pagamento)", () => {
  const parts = installments({ balance: 39708.28, count: 3, firstInDays: 30, intervalDays: 30, from: "2026-09-28" });
  assert.deepEqual(parts, [
    { number: 1, amount: 13236.09, dueDate: "2026-10-28" },
    { number: 2, amount: 13236.09, dueDate: "2026-11-27" },
    { number: 3, amount: 13236.1, dueDate: "2026-12-27" },
  ]);
  assert.equal(roundCents(parts.reduce((total, part) => total + part.amount, 0)), 39708.28);
});

test("parcelas: a soma fecha com o saldo em qualquer divisão", () => {
  for (const [balance, count] of [[100, 3], [0.05, 7], [1000, 1], [39708.28, 12], [0, 2]]) {
    const parts = installments({ balance, count, firstInDays: 0, intervalDays: 15, from: "2026-01-31" });
    assert.equal(parts.length, count);
    assert.equal(roundCents(parts.reduce((total, part) => total + part.amount, 0)), balance, `${balance} em ${count}`);
    assert.ok(parts.every((part) => part.amount >= 0));
  }
});

test("parcelas: entrada inválida dá erro", () => {
  const base = { balance: 100, count: 2, firstInDays: 30, intervalDays: 30, from: "2026-09-28" };
  assert.throws(() => installments({ ...base, count: 0 }), /parcelas/);
  assert.throws(() => installments({ ...base, count: 2.5 }), /parcelas/);
  assert.throws(() => installments({ ...base, firstInDays: -1 }), /Prazos/);
  assert.throws(() => installments({ ...base, balance: -1 }), /Saldo a parcelar não pode ser negativo/);
  assert.throws(() => installments({ ...base, balance: Number.NaN }), /Saldo a parcelar precisa ser um valor/);
  assert.throws(() => installments({ ...base, from: "28/09/2026" }), /Data inválida/);
});

test("datas: dias corridos, sem depender do fuso do servidor", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["America/Sao_Paulo", "UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      process.env.TZ = zone;
      assert.equal(addDays("2026-09-30", 90), "2026-12-29", zone);
      assert.equal(addDays("2026-09-30", 7), "2026-10-07", zone);
      assert.equal(addDays("2026-09-28", 0), "2026-09-28", zone);
      assert.equal(addDays("2024-02-28", 2), "2024-03-01", zone);
      assert.equal(commissionPaymentDate("2026-09-28", 5), "2026-10-05", zone);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("datas: formato ou dia que não existe dá erro", () => {
  for (const date of ["2026-02-30", "2026-13-01", "2026-9-30", "30/09/2026", ""]) {
    assert.throws(() => addDays(date, 1), /Data inválida/, date);
  }
  assert.throws(() => addDays("2026-09-30", 1.5), /inteiro/);
});

test("comissão: 2% do recebido, descontado o IPI", () => {
  assert.equal(roundCents(commissionBase(75000, P)), 66371.68);
  assert.equal(roundCents(commissionOn(75000, P)), 1327.43);
  assert.equal(roundCents(commissionOn(13236.1, P)), 234.27);
  assert.equal(commissionOn(0, P), 0);
});

test("comissão e entrada mínima recusam valor negativo ou que não é número", () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -100]) {
    assert.throws(() => commissionOn(bad, P), /Valor recebido precisa ser/, String(bad));
    assert.throws(() => commissionBase(bad, P), /Valor recebido precisa ser/, String(bad));
    assert.throws(
      () => requiredDownPayment({ chinaPayment: bad, netSale: 1000 }, P),
      /Pagamento na China precisa ser/,
      String(bad),
    );
    assert.throws(
      () => requiredDownPayment({ chinaPayment: 1000, netSale: bad }, P),
      /Venda sem IPI precisa ser/,
      String(bad),
    );
  }
  assert.equal(requiredDownPayment({ chinaPayment: 0, netSale: 0 }, P), 0);
});

test("comissão: paga no dia 05 do mês seguinte ao recebimento", () => {
  assert.equal(commissionPaymentDate("2026-09-28", 5), "2026-10-05");
  assert.equal(commissionPaymentDate("2026-12-15", 5), "2027-01-05");
  assert.equal(commissionPaymentDate("2026-01-31", 5), "2026-02-05");
  assert.equal(commissionPaymentDate("2026-10-05", 5), "2026-11-05");
  // O dia é da empresa: de 1 a 28, para existir em todo mês.
  assert.equal(commissionPaymentDate("2026-01-31", 28), "2026-02-28");
  assert.equal(commissionPaymentDate("2026-12-01", 10), "2027-01-10");
  for (const day of [0, 29, 31, 5.5, Number.NaN]) assert.throws(() => commissionPaymentDate("2026-10-05", day), /de 1 a 28/, String(day));
});

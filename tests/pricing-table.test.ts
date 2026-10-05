import assert from "node:assert/strict";
import { test } from "node:test";
import { roundCents } from "@/lib/pricing/money";
import { DEFAULT_PARAMS, validateParams } from "@/lib/pricing/params";
import type { PricingParams } from "@/lib/pricing/params";
import { chinaPayment, realCost } from "@/lib/pricing/product";
import { INTERNAL_ICMS, UFS } from "@/lib/pricing/states";
import { discountedMultiplier, maxDiscounts, tableMultiplier, tablePrice, withIpi } from "@/lib/pricing/table";
import { channelRate, preTaxProfit, saleTaxes, worstCase } from "@/lib/pricing/taxes";

const P = DEFAULT_PARAMS;

const near = (actual: number, expected: number, tolerance: number, label?: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance + 1e-9, `${label ?? "valor"}: ${actual} longe de ${expected}`);

/** Percentage with one decimal place, as the prototype shows it. */
const percent = (rate: number) => (rate * 100).toFixed(1);

test("centavos: arredonda metade para cima, sem ruído de ponto flutuante", () => {
  assert.equal(roundCents(1.005), 1.01);
  assert.equal(roundCents(2.675), 2.68);
  assert.equal(roundCents(7304.307), 7304.31);
  assert.equal(roundCents(0.1 + 0.2), 0.3);
  assert.equal(roundCents(-1.005), -1.01);
  assert.equal(roundCents(0), 0);
  assert.throws(() => roundCents(Number.NaN), /inválido/);
});

test("parâmetros: valores atuais do manual", () => {
  assert.deepEqual(P, {
    targetNetProfit: 0.15,
    freeDiscount: 0.2,
    safetyMargin: 0.05,
    minDownPayment: 0.65,
    proposalValidityDays: 7,
    icmsSp: 0.18,
    pisCofins: 0.0925,
    ipi: 0.13,
    incomeTax: 0.34,
    commission: 0.02,
    ads: 0.005,
    gateway: 0,
    icmsInterstate: 0.04,
    otherSalesRate: 0.025,
  });
  assert.doesNotThrow(() => validateParams(P));
});

test("parâmetros: taxa fora de [0, 1) e dias que não são inteiro positivo dão erro em português", () => {
  const bad: Partial<PricingParams>[] = [
    { targetNetProfit: -0.01 },
    { freeDiscount: 1 },
    { ipi: 1.3 },
    { commission: Number.NaN },
    { otherSalesRate: 1 },
  ];
  for (const change of bad) {
    assert.throws(() => validateParams({ ...P, ...change }), /Parâmetro inválido/, JSON.stringify(change));
  }
  assert.throws(() => validateParams({ ...P, commission: 2 }), /"Comissão" precisa ser uma taxa/);
  for (const proposalValidityDays of [0, -7, 7.5, Number.NaN]) {
    assert.throws(() => validateParams({ ...P, proposalValidityDays }), /Validade da proposta/);
  }
  assert.doesNotThrow(() => validateParams({ ...P, gateway: 0, freeDiscount: 0.999 }));
});

test("estados: 27 UFs sem repetição, MA com 23% e nenhuma acima dela", () => {
  assert.equal(UFS.length, 27);
  assert.equal(new Set(UFS).size, 27);
  assert.deepEqual(Object.keys(INTERNAL_ICMS).sort(), [...UFS].sort());
  assert.equal(INTERNAL_ICMS.MA, 0.23);
  assert.equal(INTERNAL_ICMS.SP, 0.18);
  for (const uf of UFS) {
    assert.ok(INTERNAL_ICMS[uf] > 0 && INTERNAL_ICMS[uf] <= INTERNAL_ICMS.MA, uf);
  }
});

test("ICMS e DIFAL por destino", () => {
  const ma = saleTaxes(P, { uf: "MA", taxpayer: false });
  assert.equal(ma.icms, 0.04);
  near(ma.difal, 0.19, 1e-12);
  assert.deepEqual(saleTaxes(P, { uf: "MA", taxpayer: true }), { icms: 0.04, difal: 0 });
  assert.deepEqual(saleTaxes(P, { uf: "SP", taxpayer: false }), { icms: 0.18, difal: 0 });
  assert.deepEqual(saleTaxes(P, { uf: "SP", taxpayer: true }), { icms: 0.18, difal: 0 });
});

test("DIFAL nunca é negativo, mesmo com interestadual acima da alíquota interna", () => {
  assert.equal(saleTaxes({ ...P, icmsInterstate: 0.3 }, { uf: "MA", taxpayer: false }).difal, 0);
});

test("custo real e valor da China (Mesa Flexora)", () => {
  near(realCost({ advisoryCost: 8146.64, taxCredit: 0.281156, packaging: 0 }, P), 6148.97, 0.01);
  near(chinaPayment(8146.64, P), 8553.97, 0.01);
  near(chinaPayment(8738.77, P), 9175.71, 0.01);
});

test("custo real: a embalagem soma depois, sem margem de segurança", () => {
  const without = realCost({ advisoryCost: 1000, taxCredit: 0.2, packaging: 0 }, P);
  near(without, 840, 1e-9);
  near(realCost({ advisoryCost: 1000, taxCredit: 0.2, packaging: 50 }, P), 890, 1e-9);
});

test("pior caso e multiplicadores (print de Parâmetros)", () => {
  const worst = worstCase(P);
  assert.equal(worst.uf, "MA");
  assert.equal(worst.taxpayer, false);
  near(worst.icms + worst.difal, 0.23, 1e-12);
  near(channelRate(P), 0.1425, 1e-12);
  near(worst.rate, 0.3725, 1e-12);
  assert.equal(percent(worst.rate), "37.3");
  assert.equal(preTaxProfit(P).toFixed(4), "0.2273");
  assert.equal(percent(preTaxProfit(P)), "22.7");
  assert.equal(discountedMultiplier(P).toFixed(3), "2.499");
  assert.equal(tableMultiplier(P).toFixed(3), "3.123");
});

test("preço de tabela sem e com IPI (print de Produtos e custos)", () => {
  const rows = [
    [6148.97, 19204.61, 21701.21],
    [6665.86, 20818.99, 23525.46],
    [8788.29, 27447.81, 31016.03],
    [6648.63, 20765.18, 23464.65],
  ];
  for (const [cost, table, tableWithIpi] of rows) {
    near(tablePrice(cost, P), table, 0.02, `tabela de ${cost}`);
    near(withIpi(tablePrice(cost, P), P), tableWithIpi, 0.02, `tabela com IPI de ${cost}`);
  }
});

test("parâmetros sem preço possível dão erro, não preço negativo nem infinito", () => {
  // Worst case 0.3725 + lucro antes do IR: 0.6275 fecha o divisor em zero.
  const zero = { ...P, targetNetProfit: 0.6275 * (1 - P.incomeTax) };
  const negative = { ...P, targetNetProfit: 0.9 };
  for (const params of [zero, negative]) {
    assert.throws(() => discountedMultiplier(params), /sem preço possível/);
    assert.throws(() => tableMultiplier(params), /sem preço possível/);
    assert.throws(() => tablePrice(6148.97, params), /sem preço possível/);
  }
});

test("desconto máximo por destino (colunas Máx. SP e Máx. c/IE)", () => {
  const item = { tableTotal: 19204.61, cost: 6148.97 };
  assert.equal(percent(maxDiscounts(item, P, { uf: "SP", taxpayer: false }).atTarget), "28.9");
  assert.equal(percent(maxDiscounts(item, P, { uf: "MA", taxpayer: true }).atTarget), "45.8");

  const order = maxDiscounts({ tableTotal: 40023.6, cost: 12814.83 }, P, { uf: "MA", taxpayer: false });
  assert.equal(percent(order.atTarget), "20.0");
  assert.equal(percent(order.noLoss), "49.0");
});

test("desconto máximo: total de tabela zerado dá erro", () => {
  assert.throws(() => maxDiscounts({ tableTotal: 0, cost: 10 }, P, { uf: "SP", taxpayer: true }), /maior que zero/);
});

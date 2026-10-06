import assert from "node:assert/strict";
import { test } from "node:test";
import { roundCents } from "@/lib/pricing/money";
import { DEFAULT_PARAMS, validateParams } from "@/lib/pricing/params";
import type { PricingParams } from "@/lib/pricing/params";
import { chinaPayment, realCost } from "@/lib/pricing/product";
import { DEFAULT_STATE_RATES, UFS } from "@/lib/pricing/states";
import { discountedMultiplier, maxDiscounts, productPrices, tableMultiplier, tablePrice, withIpi } from "@/lib/pricing/table";
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
    lossProvision: 0,
    warrantyProvision: 0,
    defaultProvision: 0,
    fixedFeePerOrder: 0,
    fixedMonthlyExpenses: 0,
    stateRates: DEFAULT_STATE_RATES,
  });
  // Dezenove campos de um número só, mais a tabela de alíquotas por estado.
  assert.equal(Object.keys(P).length, 20);
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
  for (const fixedMonthlyExpenses of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => validateParams({ ...P, fixedMonthlyExpenses }), /"Despesas fixas por mês" precisa ser um valor/);
  }
  assert.doesNotThrow(() => validateParams({ ...P, gateway: 0, freeDiscount: 0.999, fixedMonthlyExpenses: 50000 }));
});

test("estados: 27 UFs sem repetição; na tabela inicial, MA com 23% e nenhuma acima dela", () => {
  assert.equal(UFS.length, 27);
  assert.equal(new Set(UFS).size, 27);
  assert.deepEqual(Object.keys(DEFAULT_STATE_RATES).sort(), [...UFS].sort());
  assert.deepEqual(DEFAULT_STATE_RATES.MA, { internalIcms: 0.23, fcp: 0 });
  assert.deepEqual(DEFAULT_STATE_RATES.SP, { internalIcms: 0.18, fcp: 0 });
  for (const uf of UFS) {
    const { internalIcms } = DEFAULT_STATE_RATES[uf];
    assert.ok(internalIcms > 0 && internalIcms <= DEFAULT_STATE_RATES.MA.internalIcms, uf);
  }
  assert.equal(P.stateRates, DEFAULT_STATE_RATES);
});

test("alíquotas por estado vêm dos parâmetros: mudar a tabela muda o DIFAL, o pior destino e o preço", () => {
  const withRate = (uf: (typeof UFS)[number], rate: { internalIcms: number; fcp: number }): PricingParams => ({
    ...P,
    stateRates: { ...P.stateRates, [uf]: rate },
  });

  // Reforma: o RS passa a 25%. Vira o pior destino sem tocar no código.
  const reform = withRate("RS", { internalIcms: 0.25, fcp: 0 });
  near(saleTaxes(reform, { uf: "RS", taxpayer: false }).difal, 0.21, 1e-12);
  assert.equal(worstCase(reform).uf, "RS");
  assert.ok(tableMultiplier(reform) > tableMultiplier(P));
  // E o MA, que não mudou, continua com 19%.
  near(saleTaxes(reform, { uf: "MA", taxpayer: false }).difal, 0.19, 1e-12);

  // FCP soma no que fica com a empresa: RJ com 22% + 2% supera o MA (23%, sem FCP).
  const fcp = withRate("RJ", { internalIcms: 0.22, fcp: 0.02 });
  near(saleTaxes(fcp, { uf: "RJ", taxpayer: false }).difal, 0.2, 1e-12);
  assert.equal(worstCase(fcp).uf, "RJ");
  // Contribuinte e venda dentro de SP não pagam DIFAL nem FCP.
  assert.deepEqual(saleTaxes(fcp, { uf: "RJ", taxpayer: true }), { icms: 0.04, difal: 0 });
  assert.deepEqual(saleTaxes(withRate("SP", { internalIcms: 0.3, fcp: 0.02 }), { uf: "SP", taxpayer: false }), { icms: 0.18, difal: 0 });
  // Interna abaixo da interestadual: o DIFAL é zero, mas o FCP continua.
  near(saleTaxes(withRate("AC", { internalIcms: 0.03, fcp: 0.01 }), { uf: "AC", taxpayer: false }).difal, 0.01, 1e-12);
});

test("parâmetros: estado sem alíquota ou com taxa inválida é recusado", () => {
  const missing = Object.fromEntries(Object.entries(P.stateRates).filter(([uf]) => uf !== "MA")) as PricingParams["stateRates"];
  assert.throws(() => validateParams({ ...P, stateRates: missing }), /falta a alíquota do estado MA/);
  for (const bad of [{ internalIcms: 1, fcp: 0 }, { internalIcms: -0.1, fcp: 0 }, { internalIcms: Number.NaN, fcp: 0 }]) {
    assert.throws(() => validateParams({ ...P, stateRates: { ...P.stateRates, MA: bad } }), /"ICMS interno de MA"/);
  }
  assert.throws(() => validateParams({ ...P, stateRates: { ...P.stateRates, MA: { internalIcms: 0.23, fcp: 1.5 } } }), /"FCP de MA"/);
});

test("ICMS e DIFAL por destino", () => {
  const ma = saleTaxes(P, { uf: "MA", taxpayer: false });
  assert.equal(ma.icms, 0.04);
  near(ma.difal, 0.19, 1e-12);
  assert.deepEqual(saleTaxes(P, { uf: "MA", taxpayer: true }), { icms: 0.04, difal: 0 });
  assert.deepEqual(saleTaxes(P, { uf: "SP", taxpayer: false }), { icms: 0.18, difal: 0 });
  assert.deepEqual(saleTaxes(P, { uf: "SP", taxpayer: true }), { icms: 0.18, difal: 0 });
});

test("UF de destino fora da lista dá erro com o nome do problema", () => {
  const destination = { uf: "XX", taxpayer: false } as unknown as Parameters<typeof saleTaxes>[1];
  assert.throws(() => saleTaxes(P, destination), /UF de destino inválida/);
  assert.throws(() => maxDiscounts({ tableTotal: 100, cost: 10 }, P, destination), /UF de destino inválida/);
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

/** The four products of the print, with the tax credit in full precision (seven places). */
const PRINT_PRODUCTS = [
  { code: "LD-B001", advisoryCost: 8146.64, taxCredit: 0.2811565, realCost: 6148.97, table: 19204.61, withIpi: 21701.21 },
  { code: "LD-B002", advisoryCost: 8738.77, taxCredit: 0.2735316, realCost: 6665.86, table: 20818.99, withIpi: 23525.46 },
  { code: "LD-B003", advisoryCost: 11571.09, taxCredit: 0.2766628, realCost: 8788.29, table: 27447.81, withIpi: 31016.03 },
  { code: "LD-B004", advisoryCost: 8719.03, taxCredit: 0.2737689, realCost: 6648.63, table: 20765.18, withIpi: 23464.65 },
];

test("tabela fecha no centavo com o crédito em precisão cheia (print de Produtos e custos)", () => {
  for (const product of PRINT_PRODUCTS) {
    const cost = realCost({ advisoryCost: product.advisoryCost, taxCredit: product.taxCredit, packaging: 0 }, P);
    const table = tablePrice(cost, P);
    assert.equal(roundCents(cost), product.realCost, `custo real de ${product.code}`);
    assert.equal(roundCents(table), product.table, `tabela de ${product.code}`);
    assert.equal(roundCents(withIpi(table, P)), product.withIpi, `tabela com IPI de ${product.code}`);

    const item = { tableTotal: table, cost };
    assert.equal(percent(maxDiscounts(item, P, { uf: "SP", taxpayer: false }).atTarget), "28.9", product.code);
    assert.equal(percent(maxDiscounts(item, P, { uf: "MA", taxpayer: true }).atTarget), "45.8", product.code);
  }
});

test("colunas calculadas da linha: as do print, com Máx. SP 28,9% e Máx. c/IE 45,8%", () => {
  for (const product of PRINT_PRODUCTS) {
    const prices = productPrices({ advisoryCost: product.advisoryCost, taxCredit: product.taxCredit, packaging: 0 }, P);
    assert.ok(prices, product.code);
    assert.equal(roundCents(prices.realCost), product.realCost, `custo real de ${product.code}`);
    assert.equal(roundCents(prices.table), product.table, `tabela de ${product.code}`);
    assert.equal(roundCents(prices.tableWithIpi), product.withIpi, `tabela com IPI de ${product.code}`);
    assert.equal(percent(prices.maxSp), "28.9", product.code);
    assert.equal(percent(prices.maxTaxpayer), "45.8", product.code);
  }
});

test("colunas calculadas: sem preço de tabela não há colunas; a embalagem soma inteira ao custo real", () => {
  assert.equal(productPrices({ advisoryCost: 0, taxCredit: 0, packaging: 0 }, P), null);

  const cost = { advisoryCost: 8146.64, taxCredit: 0.2811565, packaging: 0 };
  const without = productPrices(cost, P);
  const packed = productPrices({ ...cost, packaging: 100 }, P);
  assert.ok(without && packed);
  near(packed.realCost - without.realCost, 100, 1e-9);
  assert.equal(packed.table, tablePrice(packed.realCost, P));

  // Só embalagem já dá preço: o custo real é ela.
  assert.equal(productPrices({ advisoryCost: 0, taxCredit: 0, packaging: 100 }, P)?.realCost, 100);
  assert.throws(() => productPrices({ ...cost, advisoryCost: -1 }, P), /Custo da assessoria precisa ser/);
});

test("partir do custo real já arredondado custa um centavo na tabela: por isso ele não é guardado", () => {
  assert.equal(roundCents(tablePrice(6148.97, P)), 19204.62);
  const full = realCost({ advisoryCost: 8146.64, taxCredit: 0.2811565, packaging: 0 }, P);
  assert.equal(roundCents(tablePrice(full, P)), 19204.61);
});

test("funções de base recusam entrada que não é valor em reais ou taxa, em português", () => {
  const product = { advisoryCost: 8146.64, taxCredit: 0.28, packaging: 0 };
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    assert.throws(() => realCost({ ...product, advisoryCost: bad }, P), /Custo da assessoria precisa ser/, String(bad));
    assert.throws(() => realCost({ ...product, packaging: bad }, P), /Embalagem precisa ser/, String(bad));
    assert.throws(() => chinaPayment(bad, P), /Custo da assessoria precisa ser/, String(bad));
    assert.throws(() => tablePrice(bad, P), /Custo real precisa ser/, String(bad));
    assert.throws(
      () => maxDiscounts({ tableTotal: 100, cost: bad }, P, { uf: "SP", taxpayer: true }),
      /Custo precisa ser/,
      String(bad),
    );
  }
  for (const taxCredit of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1, 2]) {
    assert.throws(() => realCost({ ...product, taxCredit }, P), /Crédito de impostos precisa ser uma taxa/, String(taxCredit));
  }
  for (const tableTotal of [Number.NaN, Number.POSITIVE_INFINITY, 0, -5]) {
    assert.throws(
      () => maxDiscounts({ tableTotal, cost: 10 }, P, { uf: "SP", taxpayer: true }),
      /Total de tabela precisa ser maior que zero/,
      String(tableTotal),
    );
  }
  // Zero continua valendo onde faz sentido.
  assert.equal(realCost({ advisoryCost: 0, taxCredit: 0, packaging: 0 }, P), 0);
  assert.equal(tablePrice(0, P), 0);
  assert.equal(chinaPayment(0, P), 0);
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

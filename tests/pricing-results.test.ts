import assert from "node:assert/strict";
import { test } from "node:test";
import { roundCents } from "@/lib/pricing/money";
import { DEFAULT_PARAMS } from "@/lib/pricing/params";
import { breakEvenRevenue, paramsResult, suggestedDownPayment } from "@/lib/pricing/results";

const P = DEFAULT_PARAMS;

/** The four products of the print (produtos-custos.jpg), credit in full precision. */
const PRODUCTS = [
  { advisoryCost: 8146.64, taxCredit: 0.2811565, packaging: 0 }, // LD-B001
  { advisoryCost: 8738.77, taxCredit: 0.2735316, packaging: 0 }, // LD-B002
  { advisoryCost: 11571.09, taxCredit: 0.2766628, packaging: 0 }, // LD-B003
  { advisoryCost: 8719.03, taxCredit: 0.2737689, packaging: 0 }, // LD-B004
];

const percent = (rate: number, digits = 1) => (rate * 100).toFixed(digits);

test("faturamento de equilíbrio: despesas fixas sobre o lucro antes do IR", () => {
  assert.equal(breakEvenRevenue(P), 0);
  assert.equal(roundCents(breakEvenRevenue({ ...P, fixedMonthlyExpenses: 50000 })), 220000);
});

test("entrada mínima sugerida: pior produto, arredondada para cima de 5 em 5 pontos (print: 65%)", () => {
  const suggestion = suggestedDownPayment(PRODUCTS, P);
  assert.ok(suggestion);
  assert.equal(suggestion.worstIndex, 0);
  assert.equal(percent(suggestion.exactRate), "63.7");
  assert.equal(suggestion.rate, 0.65);
});

test("entrada mínima sugerida: só o LD-B002 dá 63,15% e também sugere 65%", () => {
  const suggestion = suggestedDownPayment([PRODUCTS[1]], P);
  assert.ok(suggestion);
  assert.ok(suggestion.exactRate > 0.631 && suggestion.exactRate < 0.632, String(suggestion.exactRate));
  assert.equal(suggestion.rate, 0.65);
  assert.equal(suggestion.worstIndex, 0);
});

test("entrada mínima sugerida: sem produto não há sugestão", () => {
  assert.equal(suggestedDownPayment([], P), null);
  // Produto de custo zero não tem venda sobre a qual medir a entrada.
  assert.equal(suggestedDownPayment([{ advisoryCost: 0, taxCredit: 0, packaging: 0 }], P), null);
});

test("entrada mínima sugerida: 65,0% exatos não sobem para 70%", () => {
  // Sem IPI, comissão, lucro, margem de segurança nem desconto livre, a entrada é só a
  // China: custo ÷ tabela = 1 − impostos e taxas do pior caso. Com Ads de 0,25% dá 65%.
  const params = {
    ...P,
    ipi: 0,
    commission: 0,
    targetNetProfit: 0,
    incomeTax: 0,
    freeDiscount: 0,
    safetyMargin: 0,
    ads: 0.0025,
  };
  const suggestion = suggestedDownPayment([{ advisoryCost: 1000, taxCredit: 0, packaging: 0 }], params);
  assert.ok(suggestion);
  assert.ok(Math.abs(suggestion.exactRate - 0.65) < 1e-12, String(suggestion.exactRate));
  assert.equal(suggestion.rate, 0.65);

  // Um pouco acima do degrau já sobe.
  const above = suggestedDownPayment([{ advisoryCost: 1000, taxCredit: 0, packaging: 0 }], { ...params, ads: 0.002 });
  assert.equal(above?.rate, 0.7);
});

test("quadro Resultado com os parâmetros atuais (print parametros-1.jpg)", () => {
  const result = paramsResult(P, PRODUCTS);

  assert.equal(result.tableMultiplier.toFixed(3), "3.123");
  assert.equal(percent(result.markup), "212.3");
  assert.equal(result.worstDestination.uf, "MA");
  assert.equal(result.worstDestination.taxpayer, false);
  assert.equal(percent(result.worstIcmsAndDifal), "23.0");
  assert.equal(percent(result.worstRate), "37.3");
  assert.equal(percent(result.preTaxProfit), "22.7");
  assert.equal(result.discountedMultiplier.toFixed(3), "2.499");
  assert.equal(result.fixedMonthlyExpenses, 0);
  assert.equal(result.breakEvenRevenue, 0);
  assert.equal(result.suggestedDownPayment?.rate, 0.65);
});

test("quadro Resultado sem produto com custo: tudo calculado, sem sugestão de entrada", () => {
  const result = paramsResult(P, []);
  assert.equal(result.tableMultiplier.toFixed(3), "3.123");
  assert.equal(result.suggestedDownPayment, null);
});

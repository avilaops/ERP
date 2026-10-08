import assert from "node:assert/strict";
import { test } from "node:test";
import { saleBreakdown } from "@/lib/pricing/breakdown";
import { quoteOrder } from "@/lib/pricing/order";
import { DEFAULT_PARAMS } from "@/lib/pricing/params";

// A linha Nacional da Ludus: sem IPI, sem margem, 7% e 12% na saída; o caso do protótipo (Suporte Agachamento, SP, 30%).
const NATIONAL = { ...DEFAULT_PARAMS, ipi: 0, safetyMargin: 0, freeDiscount: 0.3, otherSalesRate: 0, lossProvision: 0.01, warrantyProvision: 0.015 };
const order = (uf: "SP" | "MA", taxpayer: boolean, freight = 0) => ({ items: [{ quantity: 1, tableUnitPrice: 8620.1, unitRealCost: 2415, unitAdvisoryCost: 2415 }], discount: 0.3, destination: { uf, taxpayer }, freight });

test("para onde vai cada real: as linhas são as contas do quadro da diretoria, abertas; o caso do protótipo fecha ao centavo", () => {
  const quote = quoteOrder(order("SP", false), NATIONAL);
  const lines = saleBreakdown(quote, NATIONAL, { uf: "SP", taxpayer: false });
  assert.deepEqual(lines.map((line) => [line.label, line.amount]), [
    ["Valor da venda", 6034.07],
    ["ICMS (18%)", -1086.13],
    ["PIS + COFINS (9,25%)", -558.15],
    ["Comissão, anúncios e taxas do canal (2,5%)", -150.85],
    ["Perdas, garantia e inadimplência (2,5%)", -150.85],
    ["Custo dos equipamentos", -2415],
    ["Sobra antes do IR", 1673.08],
    ["IRPJ + CSLL (34% da sobra)", -568.85],
    ["Lucro líquido", 1104.23],
  ]);
  assert.equal(lines.at(-1)!.share.toFixed(3), "0.183");
  // Impostos e taxas somam o que o quadro mostra numa linha só.
  const taxes = lines.filter((line) => /ICMS|PIS|Comissão|Perdas/.test(line.label)).reduce((sum, line) => sum + line.amount, 0);
  assert.ok(Math.abs(-taxes - quote.taxes) <= 0.02);
});

test("para onde vai cada real: DIFAL, frete e taxa fixa só aparecem quando existem", () => {
  const params = { ...NATIONAL, fixedFeePerOrder: 50, stateRates: { ...NATIONAL.stateRates, MA: { internalIcms: 0.23, fcp: 0, outboundIcms: 0.07 } } };
  const labels = saleBreakdown(quoteOrder(order("MA", false, 300), params), params, { uf: "MA", taxpayer: false }).map((line) => line.label);
  assert.ok(labels.includes("ICMS (7%)") && labels.includes("DIFAL e fundo do destino (16%)") && labels.includes("Frete por nossa conta") && labels.includes("Taxa fixa do pedido"));
  const plain = saleBreakdown(quoteOrder(order("MA", true), NATIONAL), NATIONAL, { uf: "MA", taxpayer: true }).map((line) => line.label);
  assert.ok(!plain.some((label) => /DIFAL|Frete|Taxa fixa/.test(label)));
});

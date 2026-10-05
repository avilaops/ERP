import assert from "node:assert/strict";
import { test } from "node:test";
import { discountBand, policyCheck, quoteOrder } from "@/lib/pricing/order";
import type { OrderInput } from "@/lib/pricing/order";
import { DEFAULT_PARAMS } from "@/lib/pricing/params";
import { maxDiscounts } from "@/lib/pricing/table";

const P = DEFAULT_PARAMS;

const FLEXORA = { quantity: 1, tableUnitPrice: 19204.61, unitRealCost: 6148.97, unitAdvisoryCost: 8146.64 };
const SECOND = { quantity: 1, tableUnitPrice: 20818.99, unitRealCost: 6665.86, unitAdvisoryCost: 8738.77 };

/** The order in the manual's screenshots: two items, no discount, MA, non-taxpayer. */
const MANUAL_ORDER: OrderInput = {
  items: [FLEXORA, SECOND],
  discount: 0,
  destination: { uf: "MA", taxpayer: false },
};

const percent = (rate: number, digits: number) => (rate * 100).toFixed(digits);

test("pedido-gabarito: resumo e quadro Só o diretor vê, exatos ao centavo", () => {
  const quote = quoteOrder(MANUAL_ORDER, P);

  assert.equal(quote.tableTotal, 40023.6);
  assert.equal(quote.netSale, 40023.6);
  assert.equal(quote.ipi, 5203.07);
  assert.equal(quote.invoiceTotal, 45226.67);

  assert.equal(percent(quote.taxRate, 2), "18.25");
  assert.equal(quote.taxes, 7304.31);
  assert.equal(percent(quote.difalRate, 2), "19.00");
  assert.equal(quote.difal, 7604.48);
  assert.equal(quote.equipmentCost, 12814.83);
  assert.equal(quote.freight, 0);
  assert.equal(quote.profitBeforeIncomeTax, 12299.98);
  assert.equal(quote.incomeTax, 4181.99);
  assert.equal(quote.netProfit, 8117.99);
  assert.equal(percent(quote.netProfitRate, 1), "20.3");

  assert.equal(quote.chinaPayment, 17729.68);
  assert.equal(quote.targetNetProfit, 6003.54);
  assert.equal(quote.downPaymentCommission, 427.63);
  assert.equal(quote.requiredDownPayment, 24160.85);
  assert.equal(percent(quote.requiredDownPaymentRate, 0), "53");
});

test("pedido-gabarito: linhas dos itens", () => {
  const { lines } = quoteOrder(MANUAL_ORDER, P);
  assert.deepEqual(lines[0], {
    quantity: 1,
    unitPrice: 19204.61,
    unitDiscount: 0,
    unitIpi: 2496.6,
    unitWithIpi: 21701.21,
    totalWithIpi: 21701.21,
  });
  assert.equal(lines[1].unitWithIpi, 23525.46);
  assert.equal(lines.length, 2);
});

test("pedido: desconto reduz o valor sem IPI; quantidade multiplica custo e China", () => {
  const quote = quoteOrder(
    { items: [{ ...FLEXORA, quantity: 2 }], discount: 0.2, destination: { uf: "SP", taxpayer: true } },
    P,
  );
  assert.equal(quote.tableTotal, 38409.22);
  assert.equal(quote.netSale, 30727.38);
  assert.equal(quote.difal, 0);
  assert.equal(percent(quote.taxRate, 2), "32.25");
  assert.equal(quote.equipmentCost, 12297.94);
  assert.equal(quote.chinaPayment, 17107.94);
  assert.deepEqual(quote.lines[0], {
    quantity: 2,
    unitPrice: 19204.61,
    unitDiscount: 3840.92,
    unitIpi: 1997.28,
    unitWithIpi: 17360.97,
    totalWithIpi: 34721.93,
  });
});

test("pedido: frete por nossa conta sai antes do IR", () => {
  const quote = quoteOrder({ ...MANUAL_ORDER, freight: 1000 }, P);
  assert.equal(quote.freight, 1000);
  assert.equal(quote.profitBeforeIncomeTax, 11299.98);
  assert.equal(quote.incomeTax, 3841.99);
  assert.equal(quote.netProfit, 7457.99);
});

test("pedido no prejuízo não paga IR", () => {
  const quote = quoteOrder({ ...MANUAL_ORDER, discount: 0.6 }, P);
  assert.ok(quote.profitBeforeIncomeTax < 0);
  assert.equal(quote.incomeTax, 0);
  assert.equal(quote.netProfit, quote.profitBeforeIncomeTax);
});

test("pedido inválido dá erro em português", () => {
  assert.throws(() => quoteOrder({ ...MANUAL_ORDER, items: [] }, P), /sem itens/);
  assert.throws(() => quoteOrder({ ...MANUAL_ORDER, items: [{ ...FLEXORA, quantity: 0 }] }, P), /Quantidade/);
  assert.throws(() => quoteOrder({ ...MANUAL_ORDER, items: [{ ...FLEXORA, quantity: 1.5 }] }, P), /Quantidade/);
  assert.throws(() => quoteOrder({ ...MANUAL_ORDER, items: [{ ...FLEXORA, tableUnitPrice: 0 }] }, P), /preço ou custo/);
  assert.throws(() => quoteOrder({ ...MANUAL_ORDER, discount: 1 }, P), /Desconto/);
  assert.throws(() => quoteOrder({ ...MANUAL_ORDER, discount: -0.1 }, P), /Desconto/);
  assert.throws(() => quoteOrder({ ...MANUAL_ORDER, freight: -1 }, P), /Frete/);
});

test("faixa do desconto: na meta, abaixo da meta e prejuízo", () => {
  const max = { atTarget: 0.2, noLoss: 0.49 };
  assert.equal(discountBand(0, max), "na-meta");
  assert.equal(discountBand(0.2, max), "na-meta");
  assert.equal(discountBand(0.21, max), "abaixo-da-meta");
  assert.equal(discountBand(0.49, max), "abaixo-da-meta");
  assert.equal(discountBand(0.5, max), "prejuizo");
});

test("política: o pedido-gabarito só pede aprovação pela entrada", () => {
  const quote = quoteOrder(MANUAL_ORDER, P);
  const max = maxDiscounts(
    { tableTotal: quote.tableTotal, cost: quote.equipmentCost },
    P,
    MANUAL_ORDER.destination,
  );
  const band = discountBand(MANUAL_ORDER.discount, max);
  assert.equal(band, "na-meta");

  const check = (downPayment: number) =>
    policyCheck({ discount: 0, downPayment, invoiceTotal: quote.invoiceTotal, band }, P);

  // 25.000,00 é 55% da nota; a política pede 65% (29.397,34).
  assert.deepEqual(check(25000), { needsApproval: true, reasons: ["entrada-abaixo-da-politica"] });
  assert.deepEqual(check(30000), { needsApproval: false, reasons: [] });
  assert.deepEqual(check(29397.34), { needsApproval: false, reasons: [] });
  assert.equal(check(29397.33).needsApproval, true);
});

test("política: 25% de desconto em SP está na meta, mas acima do desconto livre", () => {
  const destination = { uf: "SP", taxpayer: false } as const;
  const quote = quoteOrder({ items: [FLEXORA], discount: 0.25, destination }, P);
  const max = maxDiscounts({ tableTotal: quote.tableTotal, cost: quote.equipmentCost }, P, destination);
  const band = discountBand(0.25, max);
  assert.equal(band, "na-meta");
  assert.deepEqual(
    policyCheck({ discount: 0.25, downPayment: quote.invoiceTotal, invoiceTotal: quote.invoiceTotal, band }, P),
    { needsApproval: true, reasons: ["desconto-acima-do-livre"] },
  );
});

test("política: os três motivos juntos, e o desconto livre exato não pede aprovação", () => {
  assert.deepEqual(policyCheck({ discount: 0.5, downPayment: 0, invoiceTotal: 1000, band: "prejuizo" }, P), {
    needsApproval: true,
    reasons: ["desconto-acima-do-livre", "fora-da-meta", "entrada-abaixo-da-politica"],
  });
  assert.deepEqual(policyCheck({ discount: 0.2, downPayment: 650, invoiceTotal: 1000, band: "na-meta" }, P), {
    needsApproval: false,
    reasons: [],
  });
});

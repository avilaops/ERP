import assert from "node:assert/strict";
import { test } from "node:test";
import { discountBand, orderBand, orderMaxDiscounts, policyCheck, quoteOrder, quoteSale } from "@/lib/pricing/order";
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
  assert.throws(() => quoteOrder({ ...MANUAL_ORDER, freight: -1 }, P), /Frete não pode ser negativo/);
  assert.throws(() => quoteOrder({ ...MANUAL_ORDER, freight: Number.NaN }, P), /Frete precisa ser um valor/);
  assert.throws(() => quoteOrder({ ...MANUAL_ORDER, discount: Number.NaN }, P), /Desconto/);
});

test("conta do pedido confere os parâmetros antes de calcular", () => {
  assert.throws(() => quoteOrder(MANUAL_ORDER, { ...P, ipi: 1.3 }), /Parâmetro inválido: "IPI destacado na nota"/);
  assert.throws(() => quoteOrder(MANUAL_ORDER, { ...P, commission: Number.NaN }), /Parâmetro inválido: "Comissão"/);
  assert.throws(
    () => quoteOrder(MANUAL_ORDER, { ...P, fixedMonthlyExpenses: -1 }),
    /Parâmetro inválido: "Despesas fixas por mês"/,
  );
  const destination = { uf: "XX", taxpayer: false } as unknown as OrderInput["destination"];
  assert.throws(() => quoteOrder({ ...MANUAL_ORDER, destination }, P), /UF de destino inválida/);
});

test("faixa do desconto: na meta, abaixo da meta e prejuízo", () => {
  const max = { atTarget: 0.2, noLoss: 0.49 };
  assert.equal(discountBand(0, max), "na-meta");
  assert.equal(discountBand(0.2, max), "na-meta");
  assert.equal(discountBand(0.21, max), "abaixo-da-meta");
  assert.equal(discountBand(0.49, max), "abaixo-da-meta");
  assert.equal(discountBand(0.5, max), "prejuizo");
});

test("faixa do desconto: 20% em MA não contribuinte = na-meta, apesar do preço arredondado a centavos", () => {
  const destination = { uf: "MA", taxpayer: false } as const;
  const cases: OrderInput["items"][] = [[FLEXORA, SECOND], [FLEXORA], [SECOND]];
  for (const items of cases) {
    const quote = quoteOrder({ items, discount: P.freeDiscount, destination }, P);
    const max = maxDiscounts({ tableTotal: quote.tableTotal, cost: quote.equipmentCost }, P, destination);
    // O limite sai 19,99999...% ou 20,00000...%: a tela mostra 20,0% nos três.
    assert.equal(percent(max.atTarget, 1), "20.0");
    const band = discountBand(P.freeDiscount, max);
    assert.equal(band, "na-meta");
    assert.deepEqual(
      policyCheck(
        { discount: P.freeDiscount, downPayment: quote.invoiceTotal, invoiceTotal: quote.invoiceTotal, band },
        P,
      ),
      { needsApproval: false, reasons: [] },
    );
  }
});

test("faixa do desconto: a folga é de um centésimo de ponto, não mais", () => {
  const max = { atTarget: 0.2, noLoss: 0.49 };
  assert.equal(discountBand(0.2001, max), "na-meta");
  assert.equal(discountBand(0.2002, max), "abaixo-da-meta");
  assert.equal(discountBand(0.4901, max), "abaixo-da-meta");
  assert.equal(discountBand(0.4902, max), "prejuizo");
});

test("faixa e política recusam desconto que não é número de 0% até menos de 100%", () => {
  const max = { atTarget: 0.2, noLoss: 0.49 };
  for (const discount of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1, 1.5]) {
    assert.throws(() => discountBand(discount, max), /Desconto precisa ser/, String(discount));
    assert.throws(
      () => policyCheck({ discount, downPayment: 1000, invoiceTotal: 1000, band: "na-meta" }, P),
      /Desconto precisa ser/,
      String(discount),
    );
  }
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

test("venda sem custo: o resumo e as linhas do pedido-gabarito, só com preço de tabela e IPI", () => {
  const items = MANUAL_ORDER.items.map(({ quantity, tableUnitPrice }) => ({ quantity, tableUnitPrice }));
  const sale = quoteSale({ items, discount: 0 }, { ipi: P.ipi });

  assert.equal(sale.tableTotal, 40023.6);
  assert.equal(sale.netSale, 40023.6);
  assert.equal(sale.ipi, 5203.07);
  assert.equal(sale.invoiceTotal, 45226.67);
  assert.deepEqual(sale.lines[0], {
    quantity: 1,
    unitPrice: 19204.61,
    unitDiscount: 0,
    unitIpi: 2496.6,
    unitWithIpi: 21701.21,
    totalWithIpi: 21701.21,
  });
  assert.deepEqual(Object.keys(sale), ["lines", "tableTotal", "discount", "netSale", "ipi", "invoiceTotal"]);
});

test("venda sem custo e conta completa dão os mesmos seis campos", () => {
  const cases: OrderInput[] = [
    MANUAL_ORDER,
    { items: [{ ...FLEXORA, quantity: 2 }], discount: 0.2, destination: { uf: "SP", taxpayer: true } },
    { items: [FLEXORA, { ...SECOND, quantity: 3 }], discount: 0.125, destination: { uf: "RS", taxpayer: false }, freight: 900 },
  ];
  for (const order of cases) {
    const full = quoteOrder(order, P);
    const sale = quoteSale(order, P);
    assert.deepEqual(sale, {
      lines: full.lines,
      tableTotal: full.tableTotal,
      discount: full.discount,
      netSale: full.netSale,
      ipi: full.ipi,
      invoiceTotal: full.invoiceTotal,
    });
  }
});

test("venda sem custo recusa pedido vazio, quantidade, preço, desconto e IPI inválidos", () => {
  const item = { quantity: 1, tableUnitPrice: 100 };
  assert.throws(() => quoteSale({ items: [], discount: 0 }, P), /Pedido sem itens/);
  assert.throws(() => quoteSale({ items: [{ ...item, quantity: 0 }], discount: 0 }, P), /Quantidade do item/);
  assert.throws(() => quoteSale({ items: [{ ...item, quantity: 1.5 }], discount: 0 }, P), /Quantidade do item/);
  assert.throws(() => quoteSale({ items: [{ ...item, tableUnitPrice: 0 }], discount: 0 }, P), /preço ou custo inválido/);
  assert.throws(() => quoteSale({ items: [item], discount: 1 }, P), /Desconto precisa ser/);
  assert.throws(() => quoteSale({ items: [item], discount: 0 }, { ipi: 1.3 }), /IPI precisa ser uma taxa/);
});

test("descontos máximos do pedido-gabarito: 20,0% na meta e 49,0% sem prejuízo", () => {
  const max = orderMaxDiscounts(MANUAL_ORDER, P);
  assert.equal(percent(max.atTarget, 1), "20.0");
  assert.equal(percent(max.noLoss, 1), "49.0");
  assert.equal(orderBand(MANUAL_ORDER, P), "na-meta");
  assert.equal(orderBand({ ...MANUAL_ORDER, discount: 0.3 }, P), "abaixo-da-meta");
  assert.equal(orderBand({ ...MANUAL_ORDER, discount: 0.6 }, P), "prejuizo");
});

test("descontos máximos: o frete entra no custo, e o limite da meta é onde o lucro do quadro bate a meta", () => {
  for (const freight of [0, 1500]) {
    const order = { ...MANUAL_ORDER, freight };
    const max = orderMaxDiscounts(order, P);
    const atTarget = quoteOrder({ ...order, discount: max.atTarget }, P);
    assert.ok(Math.abs(atTarget.netProfitRate - P.targetNetProfit) < 1e-9, `frete ${freight}: ${atTarget.netProfitRate}`);
    const noLoss = quoteOrder({ ...order, discount: max.noLoss }, P);
    assert.ok(Math.abs(noLoss.netProfit) < 0.01, `frete ${freight}: lucro ${noLoss.netProfit}`);
  }
  // Com frete por nossa conta sobra menos desconto.
  assert.ok(orderMaxDiscounts({ ...MANUAL_ORDER, freight: 1500 }, P).atTarget < orderMaxDiscounts(MANUAL_ORDER, P).atTarget);
  assert.throws(() => orderMaxDiscounts({ ...MANUAL_ORDER, freight: -1 }, P), /Frete não pode ser negativo/);
});

test("taxa fixa por pedido: sai do lucro uma vez, como o frete, e aperta os descontos máximos", () => {
  const base = quoteOrder(MANUAL_ORDER, P);
  const withFee = quoteOrder(MANUAL_ORDER, { ...P, fixedFeePerOrder: 1000 });
  const withFreight = quoteOrder({ ...MANUAL_ORDER, freight: 1000 }, P);
  assert.equal(base.fixedFee, 0);
  assert.equal(withFee.fixedFee, 1000);
  // O mesmo efeito de mil reais de frete: no lucro e nos limites de desconto.
  assert.deepEqual([withFee.netProfit, withFee.profitBeforeIncomeTax], [withFreight.netProfit, withFreight.profitBeforeIncomeTax]);
  assert.deepEqual(orderMaxDiscounts(MANUAL_ORDER, { ...P, fixedFeePerOrder: 1000 }), orderMaxDiscounts({ ...MANUAL_ORDER, freight: 1000 }, P));
  assert.ok(withFee.netProfit < base.netProfit);
  // Não mexe no que o cliente paga.
  assert.deepEqual([withFee.invoiceTotal, withFee.netSale], [base.invoiceTotal, base.netSale]);
  assert.throws(() => quoteOrder(MANUAL_ORDER, { ...P, fixedFeePerOrder: -1 }), /Taxa fixa por pedido/);
});

test("provisões: perdas, garantia e inadimplência somam nas taxas da venda", () => {
  const base = quoteOrder(MANUAL_ORDER, P);
  // Os mesmos 2,5% de "Outras taxas", agora repartidos nas três provisões: nenhum número muda.
  const split = quoteOrder(MANUAL_ORDER, { ...P, otherSalesRate: 0, lossProvision: 0.01, warrantyProvision: 0.01, defaultProvision: 0.005 });
  assert.deepEqual([split.taxRate.toFixed(6), split.taxes, split.netProfit], [base.taxRate.toFixed(6), base.taxes, base.netProfit]);
  // Uma provisão a mais pesa como imposto.
  const more = quoteOrder(MANUAL_ORDER, { ...P, warrantyProvision: 0.02 });
  assert.equal((more.taxRate - base.taxRate).toFixed(6), "0.020000");
  assert.ok(more.netProfit < base.netProfit);
  assert.throws(() => quoteOrder(MANUAL_ORDER, { ...P, lossProvision: 1 }), /Provisão para perdas/);
});

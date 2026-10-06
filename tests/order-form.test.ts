import assert from "node:assert/strict";
import { test } from "node:test";
import { BAND_TEXT, parseOrderPayment, parseOrderTerms, parseQuantity, REASON_TEXT, STATUS_LABELS, UF_NAMES } from "@/lib/order-form";
import type { PaymentField, TermsField } from "@/lib/order-form";
import { UFS } from "@/lib/pricing/states";

const reader = (values: Partial<Record<TermsField, string>>) => (key: TermsField) => values[key] ?? null;

test("condições: o que foi digitado vira desconto em fração, UF, prazo e frete", () => {
  assert.deepEqual(
    parseOrderTerms(reader({ discount: "12,5", deliveryUf: "ma", taxpayer: "sim", productionDays: " 90 ", freight: "1.234,56", notes: "  entrega em novembro " })),
    { ok: true, terms: { discount: 0.125, deliveryUf: "MA", taxpayer: true, productionDays: 90, freight: 1234.56, notes: "entrega em novembro" } },
  );
  assert.deepEqual(parseOrderTerms(reader({ discount: "20%" })), {
    ok: true,
    terms: { discount: 0.2, deliveryUf: null, taxpayer: false, productionDays: null, freight: 0, notes: null },
  });
});

test("condições: tudo em branco é pedido sem desconto, sem estado, sem prazo e sem frete", () => {
  const blank = { ok: true, terms: { discount: 0, deliveryUf: null, taxpayer: false, productionDays: null, freight: 0, notes: null } };
  assert.deepEqual(parseOrderTerms(() => null), blank);
  assert.deepEqual(parseOrderTerms(reader({ discount: " ", freight: "", productionDays: "", notes: "  ", taxpayer: "nao" })), blank);
});

test("condições: cada campo inválido vira um erro com o rótulo dele, todos de uma vez", () => {
  const parsed = parseOrderTerms(reader({ discount: "abc", deliveryUf: "XX", productionDays: "0", freight: "-1" }));
  assert.deepEqual(parsed, {
    ok: false,
    errors: [
      '"Desconto": informe um percentual de 0 até menos de 100 (ex.: 12,5).',
      '"Estado de entrega": escolha um estado da lista.',
      '"Prazo de fabricação": informe um número inteiro de dias, maior que zero.',
      '"Frete por nossa conta": informe um valor em reais, zero ou mais (ex.: 1.234,56).',
    ],
  });
  for (const discount of ["100", "-5", "150"]) assert.equal(parseOrderTerms(reader({ discount })).ok, false, discount);
  for (const productionDays of ["7,5", "-1", "noventa"]) assert.equal(parseOrderTerms(reader({ productionDays })).ok, false, productionDays);
});

test("quantidade: só inteiro maior que zero", () => {
  assert.equal(parseQuantity("3"), 3);
  for (const text of [null, "", "0", "-1", "1,5", "dois"]) assert.equal(parseQuantity(text), null, String(text));
});

test("textos fixos: as cinco situações, as três faixas sem número nenhum, e as 27 UFs com nome", () => {
  assert.deepEqual(Object.values(STATUS_LABELS), ["Em negociação", "Aguardando aprovação", "Fechado", "Perdido", "Cancelado"]);
  assert.deepEqual(Object.keys(BAND_TEXT), ["na-meta", "abaixo-da-meta", "prejuizo"]);
  // A frase que a equipe lê não traz limite de desconto nem lucro.
  for (const { label, text } of Object.values(BAND_TEXT)) assert.doesNotMatch(`${label} ${text}`, /\d|%|R\$/);
  assert.deepEqual(Object.keys(UF_NAMES).sort(), [...UFS].sort());
  assert.equal(UF_NAMES.MA, "Maranhão");
});

const METHODS = ["PIX", "Boleto"];
const pay = (values: Partial<Record<PaymentField, string>>) => (key: PaymentField) => values[key] ?? null;

test("pagamento: o que foi digitado vira entrada, formas, data e parcelas", () => {
  assert.deepEqual(
    parseOrderPayment(
      pay({ downPayment: "25.000,00", downPaymentMethod: "PIX", downPaymentDate: "2026-09-30", balanceMethod: "Boleto", installmentCount: "2", firstInstallmentDays: "0", installmentIntervalDays: "30", paymentNotes: " boleto pelo banco " }),
      METHODS,
    ),
    {
      ok: true,
      payment: { downPayment: 25000, downPaymentMethod: "PIX", downPaymentDate: "2026-09-30", balanceMethod: "Boleto", installmentCount: 2, firstInstallmentDays: 0, installmentIntervalDays: 30, paymentNotes: "boleto pelo banco" },
    },
  );
  assert.deepEqual(parseOrderPayment(() => null, METHODS), {
    ok: true,
    payment: { downPayment: 0, downPaymentMethod: null, downPaymentDate: null, balanceMethod: null, installmentCount: null, firstInstallmentDays: null, installmentIntervalDays: null, paymentNotes: null },
  });
});

test("pagamento: forma fora da lista da empresa, data torta e parcela zero são recusadas, todas de uma vez", () => {
  const parsed = parseOrderPayment(
    pay({ downPayment: "-1", downPaymentMethod: "Cheque", balanceMethod: "Permuta", downPaymentDate: "30/09/2026", installmentCount: "0", firstInstallmentDays: "-3", installmentIntervalDays: "1,5" }),
    METHODS,
  );
  assert.deepEqual(parsed, {
    ok: false,
    errors: [
      '"Entrada": informe um valor em reais, zero ou mais (ex.: 25.000,00).',
      '"Forma da entrada": escolha uma forma da lista.',
      '"Forma do saldo": escolha uma forma da lista.',
      '"Data da entrada": informe uma data válida.',
      '"Parcelas do saldo": informe um número inteiro maior que zero.',
      '"1ª parcela em (dias)": informe um número inteiro, zero ou mais.',
      '"Intervalo entre parcelas (dias)": informe um número inteiro, zero ou mais.',
    ],
  });
  assert.equal(parseOrderPayment(pay({ downPaymentDate: "2026-13-40" }), METHODS).ok, false);
});

test("motivos de aprovação: frase para cada um, sem número nenhum", () => {
  assert.deepEqual(Object.keys(REASON_TEXT), ["desconto-acima-do-livre", "fora-da-meta", "entrada-abaixo-da-politica"]);
  for (const text of Object.values(REASON_TEXT)) assert.doesNotMatch(text, /\d|%|R\$/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { BAND_TEXT, parseOrderTerms, parseQuantity, STATUS_LABELS, UF_NAMES } from "@/lib/order-form";
import type { TermsField } from "@/lib/order-form";
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

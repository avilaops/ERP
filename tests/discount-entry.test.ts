import assert from "node:assert/strict";
import { test } from "node:test";
import { percentFromValue, valueFromPercent } from "@/lib/discount-entry";

test("o desconto em reais vira o percentual que o pedido guarda", () => {
  assert.equal(percentFromValue("1.000,00", 10000), "10");
  assert.equal(percentFromValue("333,33", 10000), "3,3333");
  assert.equal(percentFromValue("", 10000), "0");
});

test("o desconto em reais para em 95% e não inventa percentual sem total ou sem número", () => {
  assert.equal(percentFromValue("99.999,00", 10000), "95");
  assert.equal(percentFromValue("abc", 10000), null);
  assert.equal(percentFromValue("100,00", 0), null);
});

test("o percentual digitado aparece em reais sobre o total de tabela", () => {
  assert.equal(valueFromPercent("10", 12345.6), "1.234,56");
  assert.equal(valueFromPercent("0", 10000), "");
  assert.equal(valueFromPercent("x", 10000), "");
});

test("ida e volta: o valor em reais digitado é o desconto que o pedido mostra", () => {
  const total = 187450.37;
  const percent = percentFromValue("12.345,67", total);
  assert.ok(percent);
  assert.equal(valueFromPercent(percent, total), "12.345,67");
});

test("cliente quer pagar: o total aceito vira o desconto que dá esse total, com e sem IPI", async () => {
  const { percentFromTotal } = await import("@/lib/discount-entry");
  assert.equal(percentFromTotal("258.830,20", 410841.58, 1), "36,999999");
  assert.equal(percentFromTotal("9.000,00", 10000, 1), "10");
  assert.equal(percentFromTotal("10.170,00", 10000, 1.13), "10");
  assert.equal(percentFromTotal("20.000,00", 10000, 1), "0");
  assert.equal(percentFromTotal("", 10000, 1), null);
  assert.equal(percentFromTotal("100,00", 0, 1), null);
});

test("entrada em % e em R$: uma calcula a outra sobre o total do pedido; 100% é aceito e texto inválido não inventa valor", async () => {
  const { sharePercentFromValue, valueFromSharePercent } = await import("@/lib/discount-entry");
  // O caso do vídeo do cliente: R$ 50.000 de R$ 111.259,41 são 44,9%.
  assert.equal(sharePercentFromValue("50.000,00", 111259.41), "44,9");
  assert.equal(sharePercentFromValue("111.259,41", 111259.41), "100");
  assert.equal(valueFromSharePercent("70", 14196.45), "9.937,52");
  assert.equal(valueFromSharePercent("30 %", 100000), "30.000,00");
  assert.equal(valueFromSharePercent("12,5", 1000), "125,00");
  assert.equal(valueFromSharePercent("100", 1000), "1.000,00");
  for (const wrong of ["abc", "101", "-5", ""]) assert.equal(valueFromSharePercent(wrong, 1000), "", wrong);
  assert.equal(sharePercentFromValue("abc", 1000), null);
  assert.equal(sharePercentFromValue("10,00", 0), null);
});

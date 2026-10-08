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

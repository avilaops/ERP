import assert from "node:assert/strict";
import test from "node:test";
import { parseStockCount } from "@/lib/stock-count";

test("contagem aceita até quatro casas decimais e vírgula brasileira", () => {
  assert.equal(parseStockCount("12"), 12);
  assert.equal(parseStockCount("12,5"), 12.5);
  assert.equal(parseStockCount("0.1250"), 0.125);
});

test("contagem rejeita negativos, excesso de precisão e texto", () => {
  assert.equal(parseStockCount("-1"), null);
  assert.equal(parseStockCount("1,00001"), null);
  assert.equal(parseStockCount("doze"), null);
});

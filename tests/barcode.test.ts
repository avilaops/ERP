import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { code128cSymbols, code128cWidths } from "@/lib/fiscal/barcode";

const require = createRequire(import.meta.url);

test("código de barras da chave: 22 pares entre o início C, o verificador e a parada", () => {
  const key = "35261012345678000195550010000001231482917360";
  const symbols = code128cSymbols(key);
  assert.equal(symbols.length, 25);
  assert.deepEqual([symbols[0], symbols[1], symbols[2], symbols.at(-1)], [105, 35, 26, 106]);
  // Cada símbolo tem 11 módulos; a parada, 13.
  assert.equal(code128cWidths(key).reduce((sum, width) => sum + width, 0), 24 * 11 + 13);
  assert.throws(() => code128cSymbols("123"), /par de dígitos/);
});

test("código de barras: as barras são as mesmas de outra implementação (jsbarcode)", () => {
  const { default: CODE128C } = require("jsbarcode/bin/barcodes/CODE128/CODE128C.js") as { default: new (data: string, options: object) => { encode(): { data: string } } };
  for (const key of ["35261012345678000195550010000001231482917360", "00000000000000000000000000000000000000000000", "99887766554433221100998877665544332211009988", "0102030405060708091011121314151617181920"]) {
    const bits = code128cWidths(key).map((width, index) => (index % 2 === 0 ? "1" : "0").repeat(width)).join("");
    assert.equal(bits, new CODE128C(key, {}).encode().data, key);
  }
});

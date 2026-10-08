import assert from "node:assert/strict";
import { test } from "node:test";
import { lineHref, pickLine } from "@/lib/lines-view";

const LINES = [
  { id: 1, name: "Importada", imported: true, products: 0, versions: 0 },
  { id: 4, name: "Nacional", imported: false, products: 0, versions: 0 },
];

test("linha da tela: a pedida no endereço, ou a primeira quando não vem ou não existe", () => {
  assert.equal(pickLine(LINES, "4").name, "Nacional");
  assert.equal(pickLine(LINES, ["4", "1"]).name, "Nacional");
  for (const asked of [undefined, "", "9", "abc", "4; DROP", "-1"]) assert.equal(pickLine(LINES, asked).name, "Importada");
  assert.throws(() => pickLine([], "1"), /Nenhuma linha/);
});

test("endereço de uma tela numa linha guarda os outros parâmetros preenchidos", () => {
  assert.equal(lineHref("/tabela-precos", 4), "/tabela-precos?linha=4");
  assert.equal(lineHref("/tabela-precos", 4, { uf: "MA", q: undefined }), "/tabela-precos?linha=4&uf=MA");
});

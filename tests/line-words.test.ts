import assert from "node:assert/strict";
import { test } from "node:test";
import { lineWords } from "@/lib/line-words";
import { fieldLabel, NEW_PRODUCT_FIELDS, parseProductForm } from "@/lib/product-form";

test("linha importada fala em assessoria e China; linha nacional, em custo de compra e fornecedor", () => {
  const imported = lineWords(true);
  const domestic = lineWords(false);
  assert.deepEqual([imported.cost, imported.pay, imported.pasteButton], ["Custo assessoria R$", "Pagar na China", "Colar custos da assessoria"]);
  assert.deepEqual([domestic.cost, domestic.pay, domestic.pasteButton], ["Custo de compra R$", "Pagar ao fornecedor", "Colar custos do fornecedor"]);
  // Nenhuma palavra de importação sobra na linha nacional.
  assert.doesNotMatch(Object.values(domestic).join(" "), /assessoria|China|importa|dólar/i);
  assert.deepEqual(Object.keys(imported), Object.keys(domestic));
});

test("campo do custo do equipamento: o rótulo e a recusa usam a palavra da linha", () => {
  assert.equal(fieldLabel("advisoryCost"), "Custo assessoria R$");
  assert.equal(fieldLabel("advisoryCost", false), "Custo de compra R$");
  assert.equal(fieldLabel("name", false), fieldLabel("name"));
  const read = (key: string) => (key === "name" ? "Banco" : key === "advisoryCost" ? "abc" : "");
  const imported = parseProductForm(NEW_PRODUCT_FIELDS, read);
  const domestic = parseProductForm(NEW_PRODUCT_FIELDS, read, false);
  assert.ok(!imported.ok && imported.errors[0].startsWith('"Custo assessoria R$"'));
  assert.ok(!domestic.ok && domestic.errors[0].startsWith('"Custo de compra R$"'));
});

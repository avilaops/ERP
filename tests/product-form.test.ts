import assert from "node:assert/strict";
import { test } from "node:test";
import type { Product } from "@/lib/db/products";
import {
  EMPTY_NEW_PRODUCT,
  fieldLabel,
  NEW_PRODUCT_FIELDS,
  parseProductForm,
  productToRow,
  rawProductValues,
  ROW_FIELDS,
} from "@/lib/product-form";
import type { NewProductKey, ProductFormValues, RowKey } from "@/lib/product-form";

const row = (values: Partial<ProductFormValues<RowKey>>) =>
  parseProductForm(ROW_FIELDS, (key) => ({ name: "Mesa Flexora", ...values })[key] ?? null);

const PRODUCT: Product = {
  id: 7,
  name: "MESA FLEXORA - BATERIA DE PESOS",
  code: "LD-B001",
  description: null,
  supplierName: "DHZ",
  supplierModel: "SM5001",
  supplierPriceUsd: 605,
  advisoryCost: 8146.64,
  taxCredit: 0.2811565,
  packaging: 0,
  active: true,
  hasPhoto: false,
};

test("linha: o que o banco guarda vai para os campos e volta igual, com o crédito em precisão cheia", () => {
  const values = productToRow(PRODUCT);
  assert.deepEqual(values, {
    name: "MESA FLEXORA - BATERIA DE PESOS",
    code: "LD-B001",
    advisoryCost: "8.146,64",
    taxCredit: "28,11565",
    packaging: "0,00",
  });
  assert.deepEqual(parseProductForm(ROW_FIELDS, (key) => values[key]), {
    ok: true,
    input: { name: PRODUCT.name, code: "LD-B001", advisoryCost: 8146.64, taxCredit: 0.2811565, packaging: 0 },
  });
});

test("linha: outros valores também vão e voltam iguais", () => {
  for (const change of [
    { advisoryCost: 11571.09, taxCredit: 0.2766628, packaging: 149.9 },
    { advisoryCost: 0.01, taxCredit: 0.28115651, packaging: 1234.56 },
    { advisoryCost: 1250000, taxCredit: 0, packaging: 0.5 },
  ]) {
    const values = productToRow({ ...PRODUCT, ...change });
    const parsed = parseProductForm(ROW_FIELDS, (key) => values[key]);
    assert.ok(parsed.ok, JSON.stringify(change));
    if (parsed.ok) assert.deepEqual(parsed.input, { name: PRODUCT.name, code: "LD-B001", ...change });
  }
});

test("linha: sem custo e sem código aparecem em branco; custo zero no banco também", () => {
  assert.equal(productToRow({ ...PRODUCT, advisoryCost: null, code: null }).advisoryCost, "");
  assert.equal(productToRow({ ...PRODUCT, advisoryCost: null, code: null }).code, "");
  assert.equal(productToRow({ ...PRODUCT, advisoryCost: 0 }).advisoryCost, "");
});

test("leitura: custo vazio é sem custo, embalagem e crédito vazios valem zero, código vazio é nulo", () => {
  assert.deepEqual(row({}), {
    ok: true,
    input: { name: "Mesa Flexora", code: null, advisoryCost: null, taxCredit: 0, packaging: 0 },
  });
  assert.deepEqual(row({ name: "  Mesa  ", code: " LD-B001 ", advisoryCost: " R$ 8.146,64 ", taxCredit: " 9,25 ", packaging: "50" }), {
    ok: true,
    input: { name: "Mesa", code: "LD-B001", advisoryCost: 8146.64, taxCredit: 0.0925, packaging: 50 },
  });
});

test("leitura: custo zero é recusado com a orientação de deixar em branco", () => {
  for (const advisoryCost of ["0", "0,00", "R$ 0"]) {
    assert.deepEqual(row({ advisoryCost }), {
      ok: false,
      errors: ["Custo da assessoria: deixe em branco se ainda não há custo."],
      invalid: ["advisoryCost"],
    });
  }
});

test("leitura: cada campo inválido vira um erro com o rótulo dele, todos de uma vez", () => {
  const parsed = row({ name: "  ", advisoryCost: "abc", taxCredit: "100", packaging: "-1" });
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.deepEqual(parsed.invalid, ["name", "advisoryCost", "taxCredit", "packaging"]);
  assert.deepEqual(parsed.errors, [
    '"Nome": informe o nome do equipamento.',
    '"Custo assessoria R$": informe um valor em reais (ex.: 8.146,64) ou deixe em branco.',
    '"Crédito imp. %": informe um percentual de 0 até menos de 100 (ex.: 28,11565).',
    '"Embalagem R$": informe um valor em reais, zero ou mais (ex.: 1.234,56).',
  ]);

  for (const advisoryCost of ["-1", "8146.64", "8,146.64", "1,234", "1e3"]) {
    assert.equal(row({ advisoryCost }).ok, false, advisoryCost);
  }
  for (const taxCredit of ["-1", "150", "28%", "abc"]) assert.equal(row({ taxCredit }).ok, false, taxCredit);
  assert.equal(parseProductForm(ROW_FIELDS, () => null).ok, false);
});

test("cadastro: só o nome é obrigatório; a referência do fornecedor é lida junto", () => {
  assert.equal(NEW_PRODUCT_FIELDS.length, 8);
  assert.ok(ROW_FIELDS.every((key) => (NEW_PRODUCT_FIELDS as readonly string[]).includes(key)));
  assert.equal(fieldLabel("supplierPriceUsd"), "Preço do fornecedor US$");

  const typed: Partial<ProductFormValues<NewProductKey>> = { name: "Peck Deck" };
  assert.deepEqual(parseProductForm(NEW_PRODUCT_FIELDS, (key) => typed[key] ?? null), {
    ok: true,
    input: {
      name: "Peck Deck",
      code: null,
      supplierName: null,
      supplierModel: null,
      supplierPriceUsd: null,
      advisoryCost: null,
      taxCredit: 0,
      packaging: 0,
    },
  });

  const full = { ...typed, supplierName: " DHZ ", supplierModel: "SM5004", supplierPriceUsd: "605", code: "LD-B004" };
  const parsed = parseProductForm(NEW_PRODUCT_FIELDS, (key: NewProductKey) => full[key] ?? null);
  assert.ok(parsed.ok);
  if (parsed.ok) {
    assert.equal(parsed.input.supplierName, "DHZ");
    assert.equal(parsed.input.supplierPriceUsd, 605);
  }

  const bad = parseProductForm(NEW_PRODUCT_FIELDS, (key: NewProductKey) => ({ ...full, supplierPriceUsd: "seiscentos" })[key] ?? null);
  assert.deepEqual(bad, {
    ok: false,
    errors: ['"Preço do fornecedor US$": informe um valor em dólar, zero ou mais (ex.: 605 ou 1.234,56).'],
    invalid: ["supplierPriceUsd"],
  });
});

test("o texto digitado é devolvido como veio, para a tela repetir", () => {
  assert.deepEqual(rawProductValues(ROW_FIELDS, (key) => (key === "advisoryCost" ? " abc " : null)), {
    name: "",
    code: "",
    advisoryCost: " abc ",
    taxCredit: "",
    packaging: "",
  });
  assert.equal(Object.keys(EMPTY_NEW_PRODUCT).length, 8);
  assert.ok(Object.values(EMPTY_NEW_PRODUCT).every((value) => value === ""));
});

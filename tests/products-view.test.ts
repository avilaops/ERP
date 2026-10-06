import assert from "node:assert/strict";
import { test } from "node:test";
import type { Product } from "@/lib/db/products";
import {
  counterText,
  hasCost,
  listHref,
  parseTab,
  PRODUCT_TABS,
  supplierLine,
  viewProducts,
} from "@/lib/products-view";
import type { ProductTab } from "@/lib/products-view";

let nextId = 1;
const product = (change: Partial<Product>): Product => ({
  id: nextId++,
  name: "Equipamento",
  code: null,
  description: null,
  supplierName: null,
  supplierModel: null,
  supplierPriceUsd: null,
  advisoryCost: null,
  taxCredit: 0,
  packaging: 0,
  active: true,
  hasPhoto: false,
  ...change,
});

const PRODUCTS = [
  product({ name: "MESA FLEXORA - BATERIA DE PESOS", code: "LD-B001", supplierName: "DHZ", supplierModel: "SM5001", advisoryCost: 8146.64 }),
  product({ name: "Cadeira Extensão", code: "LD-B002" }),
  product({ name: "Leg Press 180", code: "LD-B003", advisoryCost: 0 }),
  product({ name: "Peck Deck", advisoryCost: 8719.03, supplierName: "Fábrica Júpiter" }),
  product({ name: "Fora de linha", code: "LD-X900", active: false }),
];

const names = (tab: ProductTab, search = "") => viewProducts(PRODUCTS, { tab, search }).map((item) => item.name);

test("abas: a da URL, com Ativos como padrão e para valor desconhecido", () => {
  assert.deepEqual(PRODUCT_TABS.map((tab) => tab.label), ["Ativos", "Sem custo", "Sem código", "Inativos"]);
  for (const tab of PRODUCT_TABS) assert.equal(parseTab(tab.key), tab.key);
  for (const value of [undefined, "", "qualquer", "ATIVOS", "sem custo"]) assert.equal(parseTab(value), "ativos");
});

test("abas: cada uma com o seu critério", () => {
  assert.deepEqual(names("ativos"), [
    "MESA FLEXORA - BATERIA DE PESOS",
    "Cadeira Extensão",
    "Leg Press 180",
    "Peck Deck",
  ]);
  // Custo nulo e custo zero são "sem custo"; o inativo sem custo não entra.
  assert.deepEqual(names("sem-custo"), ["Cadeira Extensão", "Leg Press 180"]);
  assert.deepEqual(names("sem-codigo"), ["Peck Deck"]);
  assert.deepEqual(names("inativos"), ["Fora de linha"]);

  assert.equal(hasCost({ advisoryCost: null }), false);
  assert.equal(hasCost({ advisoryCost: 0 }), false);
  assert.equal(hasCost({ advisoryCost: 0.01 }), true);
});

test("busca: nome, código, fornecedor e modelo, sem diferenciar maiúsculas nem acentos", () => {
  assert.deepEqual(names("ativos", "flexora"), ["MESA FLEXORA - BATERIA DE PESOS"]);
  assert.deepEqual(names("ativos", "extensao"), ["Cadeira Extensão"]);
  assert.deepEqual(names("ativos", "EXTENSÃO"), ["Cadeira Extensão"]);
  assert.deepEqual(names("ativos", "ld-b003"), ["Leg Press 180"]);
  assert.deepEqual(names("ativos", "dhz"), ["MESA FLEXORA - BATERIA DE PESOS"]);
  assert.deepEqual(names("ativos", "jupiter"), ["Peck Deck"]);
  assert.deepEqual(names("ativos", "sm5001"), ["MESA FLEXORA - BATERIA DE PESOS"]);
  assert.deepEqual(names("ativos", "  peck  "), ["Peck Deck"]);
  assert.deepEqual(names("ativos", "não existe"), []);
});

test("busca: vazia não filtra, e vale dentro da aba atual", () => {
  assert.equal(names("ativos", "").length, 4);
  assert.equal(names("ativos", "   ").length, 4);
  assert.deepEqual(names("sem-custo", "leg"), ["Leg Press 180"]);
  assert.deepEqual(names("ativos", "fora de linha"), []);
  assert.deepEqual(names("inativos", "LD-X"), ["Fora de linha"]);
});

test("ordem: por código, com número comparado como número; sem código por último, por nome", () => {
  const list = [
    product({ name: "Zeta", code: null }),
    product({ name: "B dez", code: "LD-B10" }),
    product({ name: "Álamo", code: null }),
    product({ name: "B dois", code: "LD-B2" }),
    product({ name: "A um", code: "ld-a1" }),
  ];
  assert.deepEqual(
    viewProducts(list, { tab: "ativos", search: "" }).map((item) => item.name),
    ["A um", "B dois", "B dez", "Álamo", "Zeta"],
  );
  // A lista recebida não é reordenada.
  assert.equal(list[0].name, "Zeta");
});

test("contador: singular e plural, com a margem que vier dos parâmetros", () => {
  assert.equal(counterText(133, 0.05), "133 itens · custo com margem de segurança de 5%");
  assert.equal(counterText(1, 0.05), "1 item · custo com margem de segurança de 5%");
  assert.equal(counterText(0, 0.08), "0 itens · custo com margem de segurança de 8%");
});

test("referência do fornecedor: só o que existir, com o dólar como no protótipo", () => {
  assert.equal(supplierLine({ supplierName: "DHZ", supplierModel: "SM5001", supplierPriceUsd: 605 }), "DHZ · SM5001 · US$ 605");
  assert.equal(supplierLine({ supplierName: null, supplierModel: "SM5001", supplierPriceUsd: 1234.5 }), "SM5001 · US$ 1.234,50");
  assert.equal(supplierLine({ supplierName: "DHZ", supplierModel: null, supplierPriceUsd: null }), "DHZ");
  assert.equal(supplierLine({ supplierName: null, supplierModel: null, supplierPriceUsd: null }), "");
});

test("endereço da lista: guarda a aba e a busca, sem o que é padrão", () => {
  assert.equal(listHref("/produtos", "ativos", ""), "/produtos");
  assert.equal(listHref("/produtos", "sem-custo", ""), "/produtos?aba=sem-custo");
  assert.equal(listHref("/produtos", "ativos", " mesa flexora "), "/produtos?q=mesa+flexora");
  assert.equal(listHref("/produtos", "inativos", "a&b"), "/produtos?aba=inativos&q=a%26b");
});

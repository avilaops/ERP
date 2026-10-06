import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { PublishedSnapshot } from "@/lib/db/price-table";
import type { Product } from "@/lib/db/products";
import { showDate } from "@/lib/format";
import { draftPriceTable, NOTHING_TO_PUBLISH, pendingChanges, pendingText, publishNotice } from "@/lib/price-table";
import type { PendingChanges } from "@/lib/price-table";
import { DEFAULT_PARAMS } from "@/lib/pricing/params";

const P = DEFAULT_PARAMS;

const product = (id: number, change: Partial<Product>): Product => ({
  id,
  name: `Equipamento ${id}`,
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

/** The four products of the print (tests/pricing-table.test.ts), with the published prices. */
const PRINT = [
  product(1, { code: "LD-B001", name: "MESA FLEXORA", advisoryCost: 8146.64, taxCredit: 0.2811565 }),
  product(2, { code: "LD-B002", name: "CADEIRA EXTENSORA", advisoryCost: 8738.77, taxCredit: 0.2735316 }),
  product(3, { code: "LD-B003", name: "LEG PRESS 180", advisoryCost: 11571.09, taxCredit: 0.2766628 }),
  product(4, { code: "LD-B004", name: "PECK DECK", advisoryCost: 8719.03, taxCredit: 0.2737689 }),
];

const published = (products: Product[] = PRINT, params = P): PublishedSnapshot => ({
  version: 35,
  publishedAt: new Date("2026-10-05T12:00:00Z"),
  publishedBy: "rogerio@ludus.test",
  ...draftPriceTable(params, products),
});

const NONE: PendingChanges = { rules: false, costs: 0, added: 0, removed: 0, renamed: 0 };

test("rascunho: os quatro preços do print, em centavos", () => {
  const draft = draftPriceTable(P, PRINT);
  assert.equal(draft.params, P);
  assert.deepEqual(
    draft.items.map((item) => [item.code, item.table, item.tableWithIpi]),
    [
      ["LD-B001", 19204.61, 21701.21],
      ["LD-B002", 20818.99, 23525.46],
      ["LD-B003", 27447.81, 31016.03],
      ["LD-B004", 20765.18, 23464.65],
    ],
  );
  assert.deepEqual(draft.items[0], {
    productId: 1,
    code: "LD-B001",
    name: "MESA FLEXORA",
    advisoryCost: 8146.64,
    taxCredit: 0.2811565,
    packaging: 0,
    table: 19204.61,
    tableWithIpi: 21701.21,
  });
});

test("rascunho: fica de fora o inativo, o sem custo e o de custo zero; sem código entra", () => {
  const draft = draftPriceTable(P, [
    product(1, { advisoryCost: 100, active: false }),
    product(2, { advisoryCost: null }),
    product(3, { advisoryCost: 0 }),
    product(4, { advisoryCost: 0, packaging: 50 }),
    product(5, { advisoryCost: 100, code: null }),
  ]);
  assert.deepEqual(draft.items.map((item) => [item.productId, item.code]), [[5, null]]);
  assert.deepEqual(draftPriceTable(P, []).items, []);
});

test("pendências: rascunho igual ao publicado não tem nada pendente", () => {
  assert.equal(pendingChanges(draftPriceTable(P, PRINT), published()), null);
});

test("pendências: cada tipo de mudança, isolado", () => {
  const pending = (products: Product[], params = P) => pendingChanges(draftPriceTable(params, products), published());
  const change = (index: number, patch: Partial<Product>) => PRINT.map((item, at) => (at === index ? { ...item, ...patch } : item));

  assert.deepEqual(pending(PRINT, { ...P, freeDiscount: 0.15 }), { ...NONE, rules: true });
  // Despesas fixas não mexem no preço, mas também são regra que a equipe ainda não recebeu.
  assert.deepEqual(pending(PRINT, { ...P, fixedMonthlyExpenses: 1000 }), { ...NONE, rules: true });

  assert.deepEqual(pending(change(0, { advisoryCost: 8200 })), { ...NONE, costs: 1 });
  assert.deepEqual(pending(change(0, { taxCredit: 0.28 })), { ...NONE, costs: 1 });
  assert.deepEqual(pending(change(0, { packaging: 10 })), { ...NONE, costs: 1 });

  assert.deepEqual(pending([...PRINT, product(9, { advisoryCost: 500 })]), { ...NONE, added: 1 });

  assert.deepEqual(pending(PRINT.slice(1)), { ...NONE, removed: 1 });
  assert.deepEqual(pending(change(1, { active: false })), { ...NONE, removed: 1 });
  assert.deepEqual(pending(change(1, { advisoryCost: null })), { ...NONE, removed: 1 });

  assert.deepEqual(pending(change(2, { name: "LEG PRESS 45" })), { ...NONE, renamed: 1 });
  assert.deepEqual(pending(change(2, { code: "LD-B030" })), { ...NONE, renamed: 1 });
  assert.deepEqual(pending(change(2, { code: null })), { ...NONE, renamed: 1 });
});

test("pendências: um produto conta uma vez só, e custo vem antes de nome", () => {
  const products = [
    { ...PRINT[0], advisoryCost: 8200, name: "MESA FLEXORA 2" },
    { ...PRINT[1], name: "CADEIRA" },
    PRINT[2],
    product(9, { advisoryCost: 500 }),
  ];
  assert.deepEqual(pendingChanges(draftPriceTable({ ...P, ipi: 0.1 }, products), published()), {
    rules: true,
    costs: 1,
    added: 1,
    removed: 1,
    renamed: 1,
  });
});

test("pendências: sem versão publicada, tudo é novo", () => {
  assert.deepEqual(pendingChanges(draftPriceTable(P, PRINT), null), { ...NONE, added: 4 });
  assert.deepEqual(pendingChanges(draftPriceTable(P, []), null), NONE);
});

test("texto dos pendentes: o do print, a ordem das partes, singular e plural", () => {
  assert.equal(pendingText({ ...NONE, rules: true }), "regras de desconto/impostos");
  assert.equal(pendingText({ ...NONE, costs: 1 }), "custo de 1 equipamento");
  assert.equal(pendingText({ ...NONE, costs: 12 }), "custo de 12 equipamentos");
  assert.equal(pendingText({ ...NONE, added: 1 }), "1 equipamento novo");
  assert.equal(pendingText({ ...NONE, added: 3 }), "3 equipamentos novos");
  assert.equal(pendingText({ ...NONE, removed: 1 }), "1 equipamento fora da tabela");
  assert.equal(pendingText({ ...NONE, renamed: 2 }), "nome ou código de 2 equipamentos");
  assert.equal(
    pendingText({ rules: true, costs: 2, added: 1, removed: 3, renamed: 1 }),
    "custo de 2 equipamentos; 1 equipamento novo; 3 equipamentos fora da tabela; nome ou código de 1 equipamento; regras de desconto/impostos",
  );
});

test("aviso de Produtos e custos: as quatro situações", () => {
  const draft = draftPriceTable(P, PRINT);
  const empty = draftPriceTable(P, []);
  const latest = published();

  // Há versão e há pendência: o aviso do print.
  assert.deepEqual(publishNotice(draft, latest, { ...NONE, rules: true }), {
    pending: true,
    strong: "A equipe ainda vê a tabela v35.",
    text: "Pendentes: regras de desconto/impostos.",
    next: 36,
  });
  // Primeira publicação.
  assert.deepEqual(publishNotice(draft, null, pendingChanges(draft, null)), {
    pending: true,
    strong: "A equipe ainda não vê nenhuma tabela.",
    text: "Pendente: primeira publicação, com 4 equipamentos.",
    next: 1,
  });
  assert.equal(publishNotice(draftPriceTable(P, PRINT.slice(0, 1)), null, null).text, "Pendente: primeira publicação, com 1 equipamento.");
  // Nada pendente: sem amarelo e sem botão.
  assert.deepEqual(publishNotice(draft, latest, null), {
    pending: false,
    strong: null,
    text: "A equipe vê a tabela v35, publicada em 05/10/2026 por rogerio@ludus.test.",
    next: null,
  });
  // Rascunho sem itens: não há botão, com ou sem versão.
  assert.deepEqual(publishNotice(empty, null, pendingChanges(empty, null)), {
    pending: true,
    strong: "A equipe ainda não vê nenhuma tabela.",
    text: NOTHING_TO_PUBLISH,
    next: null,
  });
  assert.deepEqual(publishNotice(empty, latest, pendingChanges(empty, latest)), {
    pending: true,
    strong: "A equipe ainda vê a tabela v35.",
    text: `Pendentes: 4 equipamentos fora da tabela. ${NOTHING_TO_PUBLISH}`,
    next: null,
  });
});

test("data: dia de São Paulo, qualquer que seja o fuso do servidor", () => {
  assert.equal(showDate(new Date("2026-10-05T12:00:00Z")), "05/10/2026");
  // 01:30 UTC ainda é a noite anterior em São Paulo.
  assert.equal(showDate(new Date("2026-10-06T01:30:00Z")), "05/10/2026");
  assert.equal(showDate(new Date("2026-01-01T03:00:00Z")), "01/01/2026");
});

test("versão publicada não se altera nem se apaga: a camada de banco não tem como", () => {
  const source = readFileSync(new URL("../src/lib/db/price-table.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bUPDATE\b|\bDELETE FROM\b|\bTRUNCATE\b/);
  const migration = readFileSync(new URL("../db/migrations/0003_tabela_publicada.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /ON DELETE/i);
});

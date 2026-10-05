import assert from "node:assert/strict";
import { test } from "node:test";
import type { PriceTableVersion, PublishedSnapshot, PublishedTable } from "@/lib/db/price-table";
import type { Product } from "@/lib/db/products";
import { draftPriceTable } from "@/lib/price-table";
import { chosenVersion, priceTableView } from "@/lib/price-table-view";
import { DEFAULT_PARAMS } from "@/lib/pricing/params";

const product = (id: number, name: string, code: string | null, advisoryCost: number, taxCredit: number): Product => ({
  id,
  name,
  code,
  supplierName: null,
  supplierModel: null,
  supplierPriceUsd: null,
  advisoryCost,
  taxCredit,
  packaging: 0,
  active: true,
});

const PUBLISHED_AT = new Date("2026-10-05T12:00:00Z");

/** The v1 of the print, as the directors read it. */
const SNAPSHOT: PublishedSnapshot = {
  version: 1,
  publishedAt: PUBLISHED_AT,
  publishedBy: "rogerio@ludus.test",
  ...draftPriceTable(DEFAULT_PARAMS, [
    product(1, "MESA FLEXORA - BATERIA DE PESOS", "LD-B001", 8146.64, 0.2811565),
    product(2, "CADEIRA EXTENSORA - BATERIA DE PESOS", "LD-B002", 8738.77, 0.2735316),
    product(3, "LEG PRESS 180 - BATERIA DE PESOS", "LD-B003", 11571.09, 0.2766628),
    product(4, "PECK DECK - BATERIA DE PESOS", "LD-B004", 8719.03, 0.2737689),
  ]),
};

/** The same version as the team reads it: what `loadPublishedTable` returns. */
const TABLE: PublishedTable = {
  version: 1,
  publishedAt: PUBLISHED_AT,
  freeDiscount: SNAPSHOT.params.freeDiscount,
  ipi: SNAPSHOT.params.ipi,
  minDownPayment: SNAPSHOT.params.minDownPayment,
  proposalValidityDays: SNAPSHOT.params.proposalValidityDays,
  commission: SNAPSHOT.params.commission,
  items: SNAPSHOT.items.map(({ productId, code, name, table, tableWithIpi }) => ({ productId, code, name, table, tableWithIpi })),
};

test("equipe: só preço e desconto livre; nada de custo nem de desconto máximo no que vai para a tela", () => {
  const view = priceTableView(TABLE, null, "");
  assert.deepEqual(view.columns, ["Tabela s/IPI", "c/IPI", "Desconto livre"]);
  assert.deepEqual(view.rows[0], {
    id: 1,
    name: "MESA FLEXORA - BATERIA DE PESOS",
    code: "LD-B001",
    cells: ["R$ 19.204,61", "R$ 21.701,21", "20%"],
  });
  assert.equal(view.rows.length, 4);
  assert.ok(view.rows.every((row) => row.cells.length === 3));

  const sent = JSON.stringify(view);
  for (const secret of ["6.148,97", "8.146,64", "28,9%", "45,8%", "28,11565", "Custo", "Máx", "rogerio"]) {
    assert.ok(!sent.includes(secret), `a tela da equipe contém ${secret}`);
  }
  for (const shown of ["19.204,61", "21.701,21", "20%"]) assert.ok(sent.includes(shown), shown);
});

test("diretoria: ganha custo real e descontos máximos, calculados com o retrato da versão", () => {
  const view = priceTableView(TABLE, SNAPSHOT, "");
  assert.deepEqual(view.columns, ["Tabela s/IPI", "c/IPI", "Desconto livre", "Custo real", "Máx. SP", "Máx. c/IE"]);
  assert.deepEqual(view.rows[0].cells, ["R$ 19.204,61", "R$ 21.701,21", "20%", "R$ 6.148,97", "28,9%", "45,8%"]);
  assert.deepEqual(view.rows[2].cells.slice(3), ["R$ 8.788,29", "28,9%", "45,8%"]);

  // Os parâmetros são os da versão: com outra margem de segurança no retrato, o custo real é outro.
  const other = priceTableView(TABLE, { ...SNAPSHOT, params: { ...SNAPSHOT.params, safetyMargin: 0.1 } }, "");
  assert.notEqual(other.rows[0].cells[3], "R$ 6.148,97");
  // Item sem custo no retrato não derruba a tela.
  const partial = priceTableView(TABLE, { ...SNAPSHOT, items: SNAPSHOT.items.slice(1) }, "");
  assert.deepEqual(partial.rows[0].cells.slice(3), ["—", "—", "—"]);
});

test("busca por nome e código, sem diferenciar maiúsculas nem acentos; contador no singular e no plural", () => {
  const names = (search: string) => priceTableView(TABLE, null, search).rows.map((row) => row.code);
  assert.deepEqual(names("flexora"), ["LD-B001"]);
  assert.deepEqual(names("ld-b003"), ["LD-B003"]);
  assert.deepEqual(names("  PRESS "), ["LD-B003"]);
  assert.deepEqual(names("bateria"), ["LD-B001", "LD-B002", "LD-B003", "LD-B004"]);
  assert.deepEqual(names("zzz"), []);

  const accented: PublishedTable = { ...TABLE, items: [{ ...TABLE.items[0], name: "Cadeira Extensão" }] };
  assert.equal(priceTableView(accented, null, "extensao").rows.length, 1);
  assert.equal(priceTableView(accented, null, "EXTENSÃO").rows.length, 1);

  assert.equal(priceTableView(TABLE, null, "").counter, "4 equipamentos");
  assert.equal(priceTableView(TABLE, null, "flexora").counter, "1 equipamento");
  assert.equal(priceTableView(TABLE, null, "zzz").counter, "0 equipamentos");
});

test("ordem por código, com número comparado como número; sem código por último, por nome", () => {
  const item = (productId: number, name: string, code: string | null) => ({ productId, name, code, table: 10, tableWithIpi: 11.3 });
  const table: PublishedTable = {
    ...TABLE,
    items: [item(1, "Zeta", null), item(2, "B dez", "LD-B10"), item(3, "Álamo", null), item(4, "B dois", "LD-B2")],
  };
  assert.deepEqual(priceTableView(table, null, "").rows.map((row) => row.name), ["B dois", "B dez", "Álamo", "Zeta"]);
  // A lista recebida não é reordenada.
  assert.equal(table.items[0].name, "Zeta");
});

test("qual versão aparece: só quem pode escolher sai da mais nova", () => {
  const versions: PriceTableVersion[] = [3, 2, 1].map((version) => ({ version, publishedAt: PUBLISHED_AT, publishedBy: "x" }));
  // Diretoria.
  assert.equal(chosenVersion(true, "1", versions), 1);
  assert.equal(chosenVersion(true, undefined, versions), 3);
  for (const invalid of ["9", "0", "abc", "1.5", "-1", "", " 1"]) assert.equal(chosenVersion(true, invalid, versions), 3, invalid);
  // Gerente e vendedor: o endereço não escolhe nada.
  assert.equal(chosenVersion(false, "1", versions), 3);
  assert.equal(chosenVersion(false, undefined, versions), 3);
  // Nada publicado.
  assert.equal(chosenVersion(true, "1", []), null);
  assert.equal(chosenVersion(false, undefined, []), null);
});

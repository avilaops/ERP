import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublishedSnapshot } from "@/lib/db/price-table";
import type { PriceTableDraft } from "@/lib/price-table";
import { priceTableReview, pricingRuleChanges } from "@/lib/price-table-review";
import { DEFAULT_PARAMS } from "@/lib/pricing/params";

const item = (productId: number, name: string, changes: Partial<PriceTableDraft["items"][number]> = {}) => ({
  productId,
  name,
  code: `LD-${productId}`,
  advisoryCost: 1_000,
  taxCredit: 0.1,
  packaging: 50,
  table: 2_000,
  tableWithIpi: 2_260,
  ...changes,
});

const published = (items: PriceTableDraft["items"]): PublishedSnapshot => ({
  version: 6,
  lineId: 1,
  publishedAt: new Date("2026-10-01T12:00:00Z"),
  publishedBy: "diretoria@teste.local",
  params: structuredClone(DEFAULT_PARAMS),
  items,
});

test("revisão classifica custo, cadastro, inclusão e remoção sem listar itens iguais", () => {
  const old = [item(1, "Alterou custo"), item(2, "Nome antigo"), item(3, "Saiu")];
  const draft: PriceTableDraft = {
    params: structuredClone(DEFAULT_PARAMS),
    items: [item(1, "Alterou custo", { advisoryCost: 1_200 }), item(2, "Nome novo"), item(4, "Entrou")],
  };
  const rows = priceTableReview(draft, published(old));
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.productId, row.category])), {
    1: "custos",
    4: "novos",
    2: "cadastro",
    3: "removidos",
  });
  assert.equal(rows.find((row) => row.productId === 1)?.before?.credit, "10,00%");
  assert.equal(rows.find((row) => row.productId === 4)?.before, null);
  assert.equal(rows.find((row) => row.productId === 3)?.after, null);
});

test("revisão mostra regras escalares e estaduais em formato operacional", () => {
  const before = published([item(1, "Igual")]);
  const params = structuredClone(DEFAULT_PARAMS);
  params.freeDiscount = 0.25;
  params.fixedFeePerOrder = 35.5;
  params.stateRates.MA.internalIcms = 0.24;
  params.stateRates.RJ.outboundIcms = 0.07;
  const changes = pricingRuleChanges({ params, items: before.items }, before);
  assert.deepEqual(changes.filter((change) => ["Desconto livre do vendedor", "Taxa fixa por pedido", "ICMS interno de MA", "ICMS de saída para RJ"].includes(change.field)), [
    { field: "Desconto livre do vendedor", before: "20,00%", after: "25,00%" },
    { field: "Taxa fixa por pedido", before: "R$ 0", after: "R$ 35,50" },
    { field: "ICMS interno de MA", before: "23,00%", after: "24,00%" },
    { field: "ICMS de saída para RJ", before: "Regra geral", after: "7,00%" },
  ]);
});

test("mudança apenas de regra mostra o efeito antes e depois em cada equipamento", () => {
  const before = published([item(1, "Igual")]);
  const params = structuredClone(DEFAULT_PARAMS);
  params.freeDiscount += 0.01;
  const rows = priceTableReview({ params, items: [item(1, "Igual", { table: 2_020, tableWithIpi: 2_282.6 })] }, before);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "regras");
  assert.notEqual(rows[0].before?.table, rows[0].after?.table);
});

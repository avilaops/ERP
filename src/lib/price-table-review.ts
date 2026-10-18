import type { PriceTableItem, PublishedSnapshot } from "@/lib/db/price-table";
import type { PriceTableDraft } from "@/lib/price-table";
import { samePricingParams } from "@/lib/price-table";
import { showMoney, showPercent } from "@/lib/format";
import { RATE_LABELS } from "@/lib/pricing/params";
import type { PricingParams, ScalarParams } from "@/lib/pricing/params";
import { UFS } from "@/lib/pricing/states";
import { productPrices } from "@/lib/pricing/table";

export type ReviewCategory = "custos" | "novos" | "removidos" | "cadastro" | "regras";
export type ReviewFigures = { cost: string; credit: string; packaging: string; realCost: string; table: string; tableWithIpi: string; maxSp: string; maxTaxpayer: string };
export type PriceTableReviewRow = { productId: number; name: string; code: string | null; category: ReviewCategory; before: ReviewFigures | null; after: ReviewFigures | null };

const figures = (item: PriceTableItem, params: PriceTableDraft["params"]): ReviewFigures => {
  const derived = productPrices({ advisoryCost: item.advisoryCost, taxCredit: item.taxCredit, packaging: item.packaging }, params);
  return {
    cost: showMoney(item.advisoryCost), credit: showPercent(item.taxCredit, 2), packaging: showMoney(item.packaging),
    realCost: derived ? showMoney(derived.realCost) : "—", table: showMoney(item.table), tableWithIpi: showMoney(item.tableWithIpi),
    maxSp: derived ? showPercent(derived.maxSp, 2) : "—", maxTaxpayer: derived ? showPercent(derived.maxTaxpayer, 2) : "—",
  };
};

export function priceTableReviewRow(
  current: PriceTableItem | null,
  published: PriceTableItem | null,
  category: ReviewCategory,
  draftParams: PricingParams,
  publishedParams: PricingParams | null,
): PriceTableReviewRow {
  const source = current ?? published;
  if (!source) throw new Error("Revisão de tabela sem equipamento.");
  return {
    productId: source.productId,
    name: source.name,
    code: source.code,
    category,
    before: published && publishedParams ? figures(published, publishedParams) : null,
    after: current ? figures(current, draftParams) : null,
  };
}
/** One row per affected product. Inputs and commercial consequences are shown together. */
export function priceTableReview(draft: PriceTableDraft, published: PublishedSnapshot | null): PriceTableReviewRow[] {
  const before = new Map((published?.items ?? []).map((item) => [item.productId, item]));
  const rows: PriceTableReviewRow[] = [];
  for (const item of draft.items) {
    const old = before.get(item.productId) ?? null;
    before.delete(item.productId);
    const category: ReviewCategory | null = !old ? "novos" : old.advisoryCost !== item.advisoryCost || old.taxCredit !== item.taxCredit || old.packaging !== item.packaging ? "custos" : old.name !== item.name || old.code !== item.code ? "cadastro" : published && !samePricingParams(draft.params, published.params) ? "regras" : null;
    if (category) rows.push(priceTableReviewRow(item, old, category, draft.params, published?.params ?? null));
  }
  for (const old of before.values()) rows.push({ productId: old.productId, name: old.name, code: old.code, category: "removidos", before: published ? figures(old, published.params) : null, after: null });
  return rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }) || a.productId - b.productId);
}

export function pricingRuleChanges(draft: PriceTableDraft, published: PublishedSnapshot | null): { field: string; before: string; after: string }[] {
  if (!published) return [];
  const changes: { field: string; before: string; after: string }[] = [];
  const add = (field: string, before: number, after: number, format: (value: number) => string) => {
    if (before !== after) changes.push({ field, before: format(before), after: format(after) });
  };
  for (const [key, label] of Object.entries(RATE_LABELS) as [keyof typeof RATE_LABELS, string][]) {
    add(label, published.params[key], draft.params[key], (value) => showPercent(value, 2));
  }
  const scalar: [keyof ScalarParams, string, (value: number) => string][] = [
    ["proposalValidityDays", "Validade da proposta", (value) => `${value} dia${value === 1 ? "" : "s"}`],
    ["fixedFeePerOrder", "Taxa fixa por pedido", showMoney],
    ["fixedMonthlyExpenses", "Despesas fixas mensais", showMoney],
  ];
  for (const [key, label, format] of scalar) add(label, published.params[key], draft.params[key], format);
  for (const uf of UFS) {
    const before = published.params.stateRates[uf];
    const after = draft.params.stateRates[uf];
    add(`ICMS interno de ${uf}`, before.internalIcms, after.internalIcms, (value) => showPercent(value, 2));
    add(`FCP de ${uf}`, before.fcp, after.fcp, (value) => showPercent(value, 2));
    addOptionalRate(`ICMS de saída para ${uf}`, before.outboundIcms, after.outboundIcms, changes);
  }
  return changes;
}

function addOptionalRate(
  field: string,
  before: PricingParams["stateRates"][keyof PricingParams["stateRates"]]["outboundIcms"],
  after: PricingParams["stateRates"][keyof PricingParams["stateRates"]]["outboundIcms"],
  changes: { field: string; before: string; after: string }[],
) {
  if ((before ?? null) === (after ?? null)) return;
  changes.push({
    field,
    before: before == null ? "Regra geral" : showPercent(before, 2),
    after: after == null ? "Regra geral" : showPercent(after, 2),
  });
}

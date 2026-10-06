import type { PriceTableItem, PriceTableVersion, PublishedSnapshot } from "@/lib/db/price-table";
import type { Product } from "@/lib/db/products";
import { showDate } from "@/lib/format";
import { roundCents } from "@/lib/pricing/money";
import type { PricingParams } from "@/lib/pricing/params";
import { UFS } from "@/lib/pricing/states";
import { productPrices } from "@/lib/pricing/table";
import { hasCost } from "@/lib/products-view";

/** The directors' draft as it would be published: parameters and one item per product on sale. */
export type PriceTableDraft = { params: PricingParams; items: PriceTableItem[] };

/**
 * What would be published now: the active products that have a cost and a table
 * price. A product without code goes in. The prices leave the engine in full
 * precision and are rounded to cents only here, on the way out.
 */
export function draftPriceTable(params: PricingParams, products: Product[]): PriceTableDraft {
  const items = products.flatMap((product): PriceTableItem[] => {
    if (!product.active || !hasCost(product) || product.advisoryCost === null) return [];
    const { advisoryCost, taxCredit, packaging } = product;
    const prices = productPrices({ advisoryCost, taxCredit, packaging }, params);
    if (!prices) return [];
    return [
      {
        productId: product.id,
        code: product.code,
        name: product.name,
        advisoryCost,
        taxCredit,
        packaging,
        table: roundCents(prices.table),
        tableWithIpi: roundCents(prices.tableWithIpi),
      },
    ];
  });
  return { params, items };
}

/** Whether two sets of parameters are the same, the rates of every state included. */
function sameParams(a: PricingParams, b: PricingParams): boolean {
  const { stateRates: ratesA, ...scalarsA } = a;
  const { stateRates: ratesB, ...scalarsB } = b;
  const keys = Object.keys(scalarsA) as (keyof typeof scalarsA)[];
  if (keys.some((key) => scalarsA[key] !== scalarsB[key])) return false;
  return UFS.every((uf) => ratesA[uf].internalIcms === ratesB[uf].internalIcms && ratesA[uf].fcp === ratesB[uf].fcp);
}

export type PendingChanges = {
  /** Some parameter differs from the published ones. */
  rules: boolean;
  /** Products on both sides with another cost, credit or packaging. */
  costs: number;
  /** Products in the draft that the version does not have. */
  added: number;
  /** Products of the version that left the draft: deactivated, removed or without cost. */
  removed: number;
  /** Products on both sides, same costs, another name or code. */
  renamed: number;
};

/**
 * What the draft has that the team does not see yet. `null` when it is equal to
 * the published version. Without a version everything is new. Each product
 * counts once: a change of cost comes before a change of name.
 */
export function pendingChanges(draft: PriceTableDraft, published: PublishedSnapshot | null): PendingChanges | null {
  if (!published) return { rules: false, costs: 0, added: draft.items.length, removed: 0, renamed: 0 };

  const pending: PendingChanges = {
    rules: !sameParams(draft.params, published.params),
    costs: 0,
    added: 0,
    removed: 0,
    renamed: 0,
  };

  const before = new Map(published.items.map((item) => [item.productId, item]));
  for (const item of draft.items) {
    const old = before.get(item.productId);
    before.delete(item.productId);
    if (!old) pending.added += 1;
    else if (item.advisoryCost !== old.advisoryCost || item.taxCredit !== old.taxCredit || item.packaging !== old.packaging) {
      pending.costs += 1;
    } else if (item.name !== old.name || item.code !== old.code) pending.renamed += 1;
  }
  pending.removed = before.size;

  const changed = pending.rules || pending.costs + pending.added + pending.removed + pending.renamed > 0;
  return changed ? pending : null;
}

const equipment = (count: number) => (count === 1 ? "1 equipamento" : `${count} equipamentos`);

/** The pending changes in one line, as the yellow notice shows them. */
export function pendingText(pending: PendingChanges): string {
  return [
    pending.costs > 0 && `custo de ${equipment(pending.costs)}`,
    pending.added > 0 && `${equipment(pending.added)} ${pending.added === 1 ? "novo" : "novos"}`,
    pending.removed > 0 && `${equipment(pending.removed)} fora da tabela`,
    pending.renamed > 0 && `nome ou código de ${equipment(pending.renamed)}`,
    pending.rules && "regras de desconto/impostos",
  ]
    .filter((part) => part !== false)
    .join("; ");
}

export const NOTHING_TO_PUBLISH = "Nenhum equipamento ativo com custo: não há o que publicar.";

/** The notice between the heading and the list of Produtos e custos, already as text. */
export type PublishNotice = {
  /** `true` is the yellow notice: the team does not see the draft yet. */
  pending: boolean;
  /** The sentence in bold, or `null`. */
  strong: string | null;
  text: string;
  /** The version the button publishes, or `null` when there is no button. */
  next: number | null;
};

export function publishNotice(
  draft: PriceTableDraft,
  latest: PriceTableVersion | null,
  pending: PendingChanges | null,
): PublishNotice {
  const empty = draft.items.length === 0;
  const next = empty ? null : (latest?.version ?? 0) + 1;

  if (!latest) {
    return {
      pending: true,
      strong: "A equipe ainda não vê nenhuma tabela.",
      text: empty ? NOTHING_TO_PUBLISH : `Pendente: primeira publicação, com ${equipment(draft.items.length)}.`,
      next,
    };
  }
  if (!pending) {
    return {
      pending: false,
      strong: null,
      text: `A equipe vê a tabela v${latest.version}, publicada em ${showDate(latest.publishedAt)} por ${latest.publishedBy}.`,
      next: null,
    };
  }
  return {
    pending: true,
    strong: `A equipe ainda vê a tabela v${latest.version}.`,
    text: `Pendentes: ${pendingText(pending)}.${empty ? ` ${NOTHING_TO_PUBLISH}` : ""}`,
    next,
  };
}

/** What the publish action answers to the notice. */
export type PublishState = { status: "idle" | "published" | "error"; message: string | null };

export const IDLE_PUBLISH: PublishState = { status: "idle", message: null };

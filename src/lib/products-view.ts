import type { Product } from "@/lib/db/products";
import { showPercent } from "@/lib/format";

/** The tabs of Produtos e custos, in the order of the screen. The first is the default. */
export const PRODUCT_TABS = [
  { key: "ativos", label: "Ativos" },
  { key: "sem-custo", label: "Sem custo" },
  { key: "sem-codigo", label: "Sem código" },
  { key: "inativos", label: "Inativos" },
] as const;

export type ProductTab = (typeof PRODUCT_TABS)[number]["key"];

/** The tab named in the address; anything unknown falls back to Ativos. */
export function parseTab(value: string | undefined): ProductTab {
  return PRODUCT_TABS.find((tab) => tab.key === value)?.key ?? "ativos";
}

/** A cost of zero gives no table price, so it counts as "without cost". */
export function hasCost(product: Pick<Product, "advisoryCost">): boolean {
  return product.advisoryCost !== null && product.advisoryCost > 0;
}

export function inTab(product: Product, tab: ProductTab): boolean {
  switch (tab) {
    case "ativos":
      return product.active;
    case "sem-custo":
      return product.active && !hasCost(product);
    case "sem-codigo":
      return product.active && product.code === null;
    case "inativos":
      return !product.active;
  }
}

/** Lower case and without accents: "Extensão" and "extensao" are the same text. */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Whether any of the texts has what is searched for. Blank search matches everything. */
export function matchesText(texts: (string | null)[], search: string): boolean {
  const wanted = fold(search.trim());
  if (wanted === "") return true;
  return texts.some((text) => text !== null && fold(text).includes(wanted));
}

/** Looks for the text in name, code, supplier and supplier model. */
export function matchesSearch(product: Product, search: string): boolean {
  return matchesText([product.name, product.code, product.supplierName, product.supplierModel], search);
}

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/** By code (LD-B2 before LD-B10); what has no code comes last, by name. */
export function compareByCode(a: { code: string | null; name: string }, b: { code: string | null; name: string }): number {
  if (a.code === null || b.code === null) {
    if (a.code !== b.code) return a.code === null ? 1 : -1;
    return collator.compare(a.name, b.name);
  }
  return collator.compare(a.code, b.code);
}

/** What the list shows: the products of the tab that match the search, in the order of the screen. */
export function viewProducts(products: Product[], { tab, search }: { tab: ProductTab; search: string }): Product[] {
  return products
    .filter((product) => inTab(product, tab) && matchesSearch(product, search))
    .sort((a, b) => compareByCode(a, b) || a.id - b.id);
}

/** The counter in the corner of the list. The margin comes from the parameters, never from the text. */
export function counterText(count: number, safetyMargin: number): string {
  return `${count} ${count === 1 ? "item" : "itens"} · custo com margem de segurança de ${showPercent(safetyMargin, 0)}`;
}

/** The supplier reference under the name: `DHZ · SM5001 · US$ 605`, with only what exists. */
export function supplierLine(product: Pick<Product, "supplierName" | "supplierModel" | "supplierPriceUsd">): string {
  const price = product.supplierPriceUsd;
  const digits = price !== null && Number.isInteger(price) ? 0 : 2;
  return [
    product.supplierName,
    product.supplierModel,
    price === null
      ? null
      : `US$ ${price.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: 2 })}`,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

/** The address of the list for a tab and a search, without what is default. */
export function listHref(base: string, tab: ProductTab, search: string, lineId: number | null = null): string {
  const query = new URLSearchParams();
  if (lineId !== null) query.set("linha", String(lineId));
  if (tab !== "ativos") query.set("aba", tab);
  if (search.trim() !== "") query.set("q", search.trim());
  const text = query.toString();
  return text === "" ? base : `${base}?${text}`;
}

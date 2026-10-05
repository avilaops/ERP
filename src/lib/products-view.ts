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

/** Looks for the text in name, code, supplier and supplier model. Blank text matches everything. */
export function matchesSearch(product: Product, search: string): boolean {
  const wanted = fold(search.trim());
  if (wanted === "") return true;
  return [product.name, product.code, product.supplierName, product.supplierModel].some(
    (text) => text !== null && fold(text).includes(wanted),
  );
}

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/** By code (LD-B2 before LD-B10); products without code come last, by name. */
function byCode(a: Product, b: Product): number {
  if (a.code === null || b.code === null) {
    if (a.code !== b.code) return a.code === null ? 1 : -1;
    return collator.compare(a.name, b.name) || a.id - b.id;
  }
  return collator.compare(a.code, b.code) || a.id - b.id;
}

/** What the list shows: the products of the tab that match the search, in the order of the screen. */
export function viewProducts(products: Product[], { tab, search }: { tab: ProductTab; search: string }): Product[] {
  return products.filter((product) => inTab(product, tab) && matchesSearch(product, search)).sort(byCode);
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
export function listHref(base: string, tab: ProductTab, search: string): string {
  const query = new URLSearchParams();
  if (tab !== "ativos") query.set("aba", tab);
  if (search.trim() !== "") query.set("q", search.trim());
  const text = query.toString();
  return text === "" ? base : `${base}?${text}`;
}

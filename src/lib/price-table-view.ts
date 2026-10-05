import type { PriceTableVersion, PublishedSnapshot, PublishedTable } from "@/lib/db/price-table";
import { formatPercent, showMoney, showPercent } from "@/lib/format";
import { roundCents } from "@/lib/pricing/money";
import { productPrices } from "@/lib/pricing/table";
import { compareByCode, matchesText } from "@/lib/products-view";

export type PriceTableView = {
  /** The titles after "Equipamento". */
  columns: string[];
  rows: { id: number; name: string; code: string | null; cells: string[] }[];
  counter: string;
};

const TEAM_COLUMNS = ["Tabela s/IPI", "c/IPI", "Desconto livre"];
const DIRECTOR_COLUMNS = ["Custo real", "Máx. SP", "Máx. c/IE"];
const NONE = "—";

/**
 * The lines of Tabela de preços, already as text. With `snapshot` null (seller,
 * manager) there is no column of cost nor of largest discount: what is not here
 * cannot reach the browser. With it, those columns are calculated by the engine
 * from the costs and the parameters of that same version, never from the draft.
 */
export function priceTableView(table: PublishedTable, snapshot: PublishedSnapshot | null, search: string): PriceTableView {
  const costs = new Map(snapshot?.items.map((item) => [item.productId, item]));
  const freeDiscount = `${formatPercent(table.freeDiscount)}%`;

  const rows = table.items
    .filter((item) => matchesText([item.name, item.code], search))
    .sort((a, b) => compareByCode(a, b) || a.productId - b.productId)
    .map((item) => {
      const cells = [showMoney(item.table), showMoney(item.tableWithIpi), freeDiscount];
      if (snapshot) {
        const cost = costs.get(item.productId);
        const prices = cost ? productPrices(cost, snapshot.params) : null;
        cells.push(
          prices ? showMoney(roundCents(prices.realCost)) : NONE,
          prices ? showPercent(prices.maxSp) : NONE,
          prices ? showPercent(prices.maxTaxpayer) : NONE,
        );
      }
      return { id: item.productId, name: item.name, code: item.code, cells };
    });

  return {
    columns: snapshot ? [...TEAM_COLUMNS, ...DIRECTOR_COLUMNS] : TEAM_COLUMNS,
    rows,
    counter: rows.length === 1 ? "1 equipamento" : `${rows.length} equipamentos`,
  };
}

/**
 * Which version the page shows. The team always gets the newest; only who may
 * choose (the directors) gets the one asked for in the address, when it exists.
 * `versions` comes from the newest to the oldest; `null` when nothing was published.
 */
export function chosenVersion(mayChoose: boolean, requested: string | undefined, versions: PriceTableVersion[]): number | null {
  const newest = versions[0]?.version ?? null;
  if (!mayChoose || requested === undefined || !/^\d+$/.test(requested)) return newest;
  const wanted = Number(requested);
  return versions.some((item) => item.version === wanted) ? wanted : newest;
}

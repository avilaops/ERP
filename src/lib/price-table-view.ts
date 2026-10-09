import type { PriceTableVersion, PublishedSnapshot, PublishedTable } from "@/lib/db/price-table";
import { formatPercent, showMoney, showPercent } from "@/lib/format";
import { roundCents } from "@/lib/pricing/money";
import { productPrices } from "@/lib/pricing/table";
import { compareByCode, matchesText } from "@/lib/products-view";

export type PriceTableView = {
  /** The titles after "Equipamento". */
  columns: string[];
  rows: { id: number; name: string; code: string | null; cells: string[]; /** The price the list shows first: the one the customer pays per unit. */ main: string }[];
  /** What the main price is: with IPI, or the only price of a line without IPI. */
  mainLabel: string;
  counter: string;
};

const TEAM_COLUMNS = ["Tabela s/IPI", "c/IPI", "Desconto livre"];
/** A company without IPI (national line): one price, no "c/IPI". */
const TEAM_COLUMNS_WITHOUT_IPI = ["Preço de tabela", "Desconto livre"];
const DIRECTOR_COLUMNS = ["Custo real", "Máx. SP", "Máx. c/IE"];
const NONE = "—";

/**
 * The lines of Tabela de preços, already as text. With `snapshot` null (seller,
 * manager) there is no column of cost nor of largest discount: what is not here
 * cannot reach the browser. With it, those columns are calculated by the engine
 * from the costs and the parameters of that same version, never from the draft.
 */
export function priceTableView(
  table: PublishedTable,
  snapshot: PublishedSnapshot | null,
  search: string,
  /** For who approves orders: the largest discount of the destination chosen. `null` for the rest of the team. */
  authority: number | null = null,
): PriceTableView {
  const costs = new Map(snapshot?.items.map((item) => [item.productId, item]));
  const freeDiscount = `${formatPercent(table.freeDiscount)}%`;
  const hasIpi = table.ipi > 0;
  const authorityColumns = authority === null ? [] : [`Com ${freeDiscount} de desconto`, "Máx. sua alçada", "Menor preço"];

  const rows = table.items
    .filter((item) => matchesText([item.name, item.code], search))
    .sort((a, b) => compareByCode(a, b) || a.productId - b.productId)
    .map((item) => {
      const cells = hasIpi ? [showMoney(item.table), showMoney(item.tableWithIpi), freeDiscount] : [showMoney(item.table), freeDiscount];
      if (authority !== null) {
        cells.push(showMoney(roundCents(item.table * (1 - table.freeDiscount))), showPercent(authority), showMoney(roundCents(item.table * (1 - authority))));
      }
      if (snapshot) {
        const cost = costs.get(item.productId);
        const prices = cost ? productPrices(cost, snapshot.params) : null;
        cells.push(
          prices ? showMoney(roundCents(prices.realCost)) : NONE,
          prices ? showPercent(prices.maxSp) : NONE,
          prices ? showPercent(prices.maxTaxpayer) : NONE,
        );
      }
      return { id: item.productId, name: item.name, code: item.code, cells, main: showMoney(hasIpi ? item.tableWithIpi : item.table) };
    });

  return {
    columns: [...(hasIpi ? TEAM_COLUMNS : TEAM_COLUMNS_WITHOUT_IPI), ...authorityColumns, ...(snapshot ? DIRECTOR_COLUMNS : [])],
    rows,
    mainLabel: hasIpi ? "com IPI" : "preço de tabela",
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

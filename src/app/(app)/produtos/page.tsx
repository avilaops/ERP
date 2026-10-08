import { LineTabs } from "@/components/LineTabs";
import { listLines } from "@/lib/db/product-lines";
import { LINE_PARAM, pickLine } from "@/lib/lines-view";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { menuItem } from "@/lib/auth/permissions";
import { loadParams } from "@/lib/db/params";
import { latestVersion, loadPublishedSnapshot, nextVersionNumber } from "@/lib/db/price-table";
import { listProducts } from "@/lib/db/products";
import type { Product } from "@/lib/db/products";
import { showMoney, showPercent } from "@/lib/format";
import { roundCents } from "@/lib/pricing/money";
import type { PricingParams } from "@/lib/pricing/params";
import { productPrices } from "@/lib/pricing/table";
import { draftPriceTable, pendingChanges, publishNotice } from "@/lib/price-table";
import { productToRow } from "@/lib/product-form";
import { counterText, hasCost, listHref, parseTab, PRODUCT_TABS, supplierLine, viewProducts } from "@/lib/products-view";
import {
  createProductAction,
  deleteProductAction,
  pasteAdvisoryCostsAction,
  publishPriceTableAction,
  setProductActiveAction,
  updateProductAction,
} from "./actions";
import { ProductRow } from "./ProductRow";
import type { ProductRowData } from "./ProductRow";
import { ProductTools } from "./ProductTools";
import { PublishBanner } from "./PublishBanner";

const ITEM = menuItem("produtos");

export const metadata = { title: `${ITEM.label} · ERP` };
export const dynamic = "force-dynamic";

const NONE = "—";
/** The typed columns keep room for `11.571,09` and for the credit in full precision; their titles may wrap. */
const COLUMNS: [string, string][] = [
  ["Custo assessoria R$", "min-w-28"],
  ["Crédito imp. %", "min-w-26"],
  ["Embalagem R$", "min-w-24"],
  ["Custo real", ""],
  ["Tabela s/IPI", ""],
  ["Máx. SP", ""],
  ["Máx. c/IE", ""],
];

/** Every figure of the row is calculated here, on the server, by the engine. */
function toRow(product: Product, params: PricingParams): ProductRowData {
  const prices = hasCost(product)
    ? productPrices(
        { advisoryCost: product.advisoryCost ?? 0, taxCredit: product.taxCredit, packaging: product.packaging },
        params,
      )
    : null;
  const money = (value: number) => showMoney(roundCents(value));

  return {
    id: product.id,
    active: product.active,
    values: productToRow(product),
    hasPhoto: product.hasPhoto,
    supplier: supplierLine(product),
    realCost: prices ? money(prices.realCost) : NONE,
    table: prices ? money(prices.table) : NONE,
    tableWithIpi: prices ? money(prices.tableWithIpi) : null,
    maxSp: prices ? showPercent(prices.maxSp) : NONE,
    maxTaxpayer: prices ? showPercent(prices.maxTaxpayer) : NONE,
  };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);

  const query = await searchParams;
  const tab = parseTab(first(query.aba));
  const search = (first(query.q) ?? "").trim();

  // One product line at a time: its equipments, its parameters and its published table.
  const lines = await listLines(conn);
  const line = pickLine(lines, query[LINE_PARAM]);
  const several = lines.length > 1;
  const [params, products, latest, nextNumber] = await Promise.all([
    loadParams(conn, line.id),
    listProducts({ lineId: line.id }, conn),
    latestVersion(conn, line.id),
    nextVersionNumber(conn),
  ]);
  // What the team sees against what would be published now.
  const published = latest ? await loadPublishedSnapshot(latest.version, conn) : null;
  const draft = draftPriceTable(params, products);
  const notice = publishNotice(draft, latest, pendingChanges(draft, published), nextNumber);
  const rows = viewProducts(products, { tab, search }).map((product) => toRow(product, params));

  return (
    <>
      <ProductTools
        create={createProductAction}
        paste={pasteAdvisoryCostsAction}
        lineId={line.id}
        heading={
          <>
            <h1 className="text-2xl font-semibold">{ITEM.label}</h1>
            <p className="mt-1 max-w-2xl text-slate-600">
              Digite o custo que a assessoria passar. Preço e alçadas recalculam ao salvar a linha; a equipe só vê
              depois que você publicar.
            </p>
          </>
        }
      />

      <LineTabs lines={lines} current={line.id} path={ITEM.href} />

      <PublishBanner key={line.id} notice={notice} action={publishPriceTableAction} lineId={line.id} />

      <section className="mt-6 rounded-lg border border-slate-200 bg-white" aria-label="Equipamentos">
        <div className="flex flex-wrap items-end justify-between gap-4 p-4">
          <div className="flex flex-col gap-3">
            <nav aria-label="Abas" className="flex w-fit rounded-lg border border-slate-200 p-0.5 text-sm">
              {PRODUCT_TABS.map(({ key, label }) => (
                <Link
                  key={key}
                  href={listHref(ITEM.href, key, search, several ? line.id : null)}
                  aria-current={key === tab ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 font-medium ${
                    key === tab ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <form method="get" action={ITEM.href} role="search" className="flex w-full gap-2 sm:w-auto">
              {tab !== "ativos" && <input type="hidden" name="aba" value={tab} />}
              {several && <input type="hidden" name={LINE_PARAM} value={line.id} />}
              <input
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Buscar nome, código ou fornecedor"
                aria-label="Buscar nome, código ou fornecedor"
                className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm sm:w-72 sm:flex-none outline-none focus:ring-2 focus:ring-brand"
              />
              <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
                Buscar
              </button>
            </form>
          </div>
          <p className="text-xs text-slate-600">{counterText(rows.length, params.safetyMargin)}</p>
        </div>

        {rows.length === 0 ? (
          <p className="border-t border-slate-200 p-6 text-slate-600">
            {search === "" ? "Nenhum equipamento nesta aba." : `Nenhum equipamento encontrado para "${search}".`}
          </p>
        ) : (
          <>
            {/* On a phone each equipment is a card that opens its own screen; the table is for wider screens. */}
            <ul className="border-t border-slate-200 md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="border-t border-slate-200 first:border-t-0">
                  <Link href={`${ITEM.href}/${row.id}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.values.name}</span>
                      <span className="block truncate text-xs text-slate-500">{[row.values.code || "sem código", row.supplier].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold">{row.tableWithIpi ?? "sem custo"}</span>
                      <span className="block text-xs text-slate-500">{row.tableWithIpi ? (row.tableWithIpi === row.table ? "preço de tabela" : "tabela c/ IPI") : "toque para informar"}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          <div className="relative hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-t border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="min-w-64 px-2 py-2 pl-4 text-left align-bottom font-semibold">
                    Equipamento
                  </th>
                  {COLUMNS.map(([column, width]) => (
                    <th key={column} scope="col" className={`${width || "whitespace-nowrap"} px-2 py-2 text-right align-bottom font-semibold`}>
                      {column}
                    </th>
                  ))}
                  {/* Stays in sight when a narrow screen makes the table scroll sideways. */}
                  <th scope="col" className="sticky right-0 bg-slate-50 px-2 py-2 pr-4">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ProductRow
                    key={row.id}
                    row={row}
                    save={updateProductAction}
                    setActive={setProductActiveAction}
                    remove={deleteProductAction}
                  />
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    </>
  );
}

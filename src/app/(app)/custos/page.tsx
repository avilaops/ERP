import Link from "next/link";
import { LineTabs } from "@/components/LineTabs";
import { ListPager, ListQuery } from "@/components/ListQuery";
import { CARD, EmptyState, INPUT, PageHeader, PRIMARY, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem } from "@/lib/auth/permissions";
import { loadParams } from "@/lib/db/params";
import { listLines } from "@/lib/db/product-lines";
import { latestVersion, loadPublishedParams, nextVersionNumber } from "@/lib/db/price-table";
import { loadProductPublicationSummary, loadProductTabCounts, queryProducts } from "@/lib/db/products";
import type { Product } from "@/lib/db/products";
import { tenantDb } from "@/lib/db/pool";
import { showMoney, showPercent } from "@/lib/format";
import { LINE_PARAM, lineHref, pickLine } from "@/lib/lines-view";
import { listHref, parseListQuery } from "@/lib/list-query";
import { lineWords } from "@/lib/line-words";
import { publishNoticeFromCount, samePricingParams } from "@/lib/price-table";
import { productToRow } from "@/lib/product-form";
import { roundCents } from "@/lib/pricing/money";
import type { PricingParams } from "@/lib/pricing/params";
import { productPrices } from "@/lib/pricing/table";
import { hasCost, PRODUCT_TABS, supplierLine } from "@/lib/products-view";
import { pasteAdvisoryCostsAction } from "../produtos/actions";
import { PublishBanner } from "../produtos/PublishBanner";
import type { ProductRowData } from "../produtos/ProductRow";
import { CostRow } from "./CostRow";
import { CostsTools } from "./CostsTools";
import { updateProductCostsAction } from "./actions";
import { ActionForm } from "../pedidos/ActionForm";

const ITEM = menuItem("custos");
const NONE = "—";
export const metadata = { title: `${ITEM.label} · ERP` };
export const dynamic = "force-dynamic";
const formatNcm = (ncm: string) => /^\d{8}$/.test(ncm) ? `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6)}` : ncm;
function toRow(product: Product, params: PricingParams): ProductRowData {
  const prices = hasCost(product) ? productPrices({ advisoryCost: product.advisoryCost ?? 0, taxCredit: product.taxCredit, packaging: product.packaging }, params) : null;
  const money = (value: number) => showMoney(roundCents(value));
  return { id: product.id, active: product.active, values: productToRow(product), hasPhoto: product.hasPhoto, supplier: supplierLine(product), ncm: product.ncm ? `NCM ${formatNcm(product.ncm)}` : "sem NCM", realCost: prices ? money(prices.realCost) : NONE, table: prices ? money(prices.table) : NONE, tableWithIpi: prices ? money(prices.tableWithIpi) : null, maxSp: prices ? showPercent(prices.maxSp, 2) : NONE, maxTaxpayer: prices ? showPercent(prices.maxTaxpayer, 2) : NONE, taxCreditDisplay: showPercent(product.taxCredit, 2) };
}

export default async function CustosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("custos");
  const conn = tenantDb(session.tenant.slug);
  const raw = await searchParams;
  const lines = await listLines(conn);
  const line = pickLine(lines, raw[LINE_PARAM]);
  const options = { sorts: ["codigo", "nome", "custo", "credito", "embalagem"] as const, defaultSort: "codigo" as const, filters: { aba: PRODUCT_TABS.map((tab) => tab.key), linha: lines.map((item) => String(item.id)) } };
  const query = parseListQuery({ ...raw, linha: String(line.id) }, options);
  const tab = (query.filters.aba?.[0] ?? "ativos") as (typeof PRODUCT_TABS)[number]["key"];
  const [params, latest, nextNumber, result, counts] = await Promise.all([loadParams(conn, line.id), latestVersion(conn, line.id), nextVersionNumber(conn), queryProducts(query, line.id, conn), loadProductTabCounts(line.id, conn)]);
  const publishedParams = latest ? await loadPublishedParams(latest.version, conn) : null;
  const publication = await loadProductPublicationSummary(line.id, latest?.version ?? null, publishedParams ? !samePricingParams(params, publishedParams) : false, params.safetyMargin, conn);
  const rows = result.items.map((product) => toRow(product, params));
  const words = lineWords(line.imported);
  const opensProducts = allows(session, "produtos");
  return <>
    <PageHeader title={ITEM.label} hint="Custos, créditos e preços dos equipamentos." />
    <div className="mt-3"><CostsTools action={pasteAdvisoryCostsAction} imported={line.imported} /></div>
    <LineTabs lines={lines} current={line.id} path={ITEM.href} />
    <PublishBanner key={line.id} notice={publishNoticeFromCount(publication.itemCount, latest, publication.pending, nextNumber)} lineId={line.id} />
    <nav aria-label="Situação dos equipamentos" className="view-tabs mt-4 flex-nowrap overflow-x-auto">{PRODUCT_TABS.map(({ key, label }) => { const filters = { linha: [String(line.id)], ...(key === "ativos" ? {} : { aba: [key] }) }; return <Link key={key} href={listHref(ITEM.href, query, { filters, page: 1 }, options)} aria-current={key === tab ? "page" : undefined}>{label} ({counts[key]})</Link>; })}</nav>
    <section className={`${CARD} mt-3 list-screen`} aria-label="Custos dos produtos"><ListQuery path={ITEM.href} query={query} options={options} searchLabel="Buscar custo por produto, código ou fornecedor" searchPlaceholder="Produto, código ou fornecedor" sorts={[{ value: "codigo", label: "Código" }, { value: "nome", label: "Nome" }, { value: "custo", label: words.cost }, { value: "credito", label: "Crédito tributário" }, { value: "embalagem", label: "Embalagem" }]} />
      {rows.length === 0 ? <EmptyState title="Nenhum custo encontrado" description="Ajuste a aba, a busca ou os filtros para ver outros equipamentos." action={<Link href={lineHref(ITEM.href, line.id)} className={SECONDARY}>Limpar busca e filtros</Link>} /> : <div className="list-results"><ul className="2xl:hidden">{rows.map((row) => <li key={row.id} className="border-t border-slate-200 px-4 py-3 first:border-t-0">{opensProducts ? <Link href={`/produtos/${row.id}`} className="break-words font-medium text-brand underline">{row.values.name}</Link> : <strong className="break-words font-medium">{row.values.name}</strong>}<p className="mt-1 text-xs text-slate-500">{row.values.code || "sem código"} · {row.supplier}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><div><dt className="text-slate-500">{words.cost}</dt><dd>{row.values.advisoryCost || NONE}</dd></div><div><dt className="text-slate-500">Crédito tributário</dt><dd>{row.taxCreditDisplay}</dd></div><div><dt className="text-slate-500">Embalagem</dt><dd>{row.values.packaging}</dd></div><div><dt className="text-slate-500">Preço com IPI</dt><dd>{row.tableWithIpi ?? NONE}</dd></div></dl><details className="mt-3"><summary className="disclosure-heading !px-0 text-brand">Editar custo<span className="disclosure-marker" aria-hidden="true">+</span></summary><ActionForm action={updateProductCostsAction} className="grid gap-3 pt-3 sm:grid-cols-3"><input type="hidden" name="id" value={row.id} /><input type="hidden" name="wording" value={line.imported ? "importada" : "nacional"} /><label className="text-sm">{words.cost}<input name="advisoryCost" defaultValue={row.values.advisoryCost} inputMode="decimal" className={INPUT} /></label><label className="text-sm">Crédito tributário<input name="taxCredit" defaultValue={row.values.taxCredit} inputMode="decimal" className={INPUT} /></label><label className="text-sm">Embalagem<input name="packaging" defaultValue={row.values.packaging} inputMode="decimal" className={INPUT} /></label><button type="submit" className={PRIMARY}>Salvar custos</button></ActionForm></details></li>)}</ul><div className="hidden 2xl:block overflow-x-auto"><table className="w-full min-w-[1100px] table-fixed text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-1/4 px-3 py-2 text-left">Equipamento</th><th className="px-3 py-2 text-right">{words.cost}</th><th className="px-3 py-2 text-right">Crédito tributário</th><th className="px-3 py-2 text-right">Embalagem</th><th className="px-3 py-2 text-right">Custo e preço</th><th className="px-3 py-2 text-right">Descontos</th><th className="px-3 py-2"><span className="sr-only">Ações</span></th></tr></thead><tbody>{rows.map((row) => <CostRow key={row.id} row={row} imported={line.imported} action={updateProductCostsAction} productHref={opensProducts ? `/produtos/${row.id}` : undefined} />)}</tbody></table></div></div>}
      <ListPager path={ITEM.href} query={query} options={options} result={result} noun={["custo", "custos"]} />
    </section>
  </>;
}

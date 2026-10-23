import Link from "next/link";
import { LineTabs } from "@/components/LineTabs";
import { ListPager, ListQuery } from "@/components/ListQuery";
import { CARD, EmptyState, PageHeader, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { loadParams } from "@/lib/db/params";
import { latestVersion, loadPublishedParams, nextVersionNumber } from "@/lib/db/price-table";
import { loadProductPublicationSummary, loadProductTabCounts, queryProducts } from "@/lib/db/products";
import type { Product } from "@/lib/db/products";
import { listLines } from "@/lib/db/product-lines";
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
import { counterText, hasCost, PRODUCT_TABS, supplierLine } from "@/lib/products-view";
import { ActionForm } from "../pedidos/ActionForm";
import { ConfirmButton } from "../pedidos/ConfirmButton";
import { createProductAction, deleteProductAction, deleteProductsWithoutCodeAction, pasteAdvisoryCostsAction, setProductActiveAction, updateProductAction } from "./actions";
import { ProductRow } from "./ProductRow";
import type { ProductRowData } from "./ProductRow";
import { ProductTools } from "./ProductTools";
import { PublishBanner } from "./PublishBanner";

const ITEM = menuItem("produtos");
const NONE = "—";

export const metadata = { title: `${ITEM.label} · ERP` };
export const dynamic = "force-dynamic";

const formatNcm = (ncm: string) => (/^\d{8}$/.test(ncm) ? `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6)}` : ncm);
function toRow(product: Product, params: PricingParams): ProductRowData {
  const prices = hasCost(product) ? productPrices({ advisoryCost: product.advisoryCost ?? 0, taxCredit: product.taxCredit, packaging: product.packaging }, params) : null;
  const money = (value: number) => showMoney(roundCents(value));
  return { id: product.id, active: product.active, values: productToRow(product), hasPhoto: product.hasPhoto, supplier: supplierLine(product), ncm: product.ncm ? `NCM ${formatNcm(product.ncm)}` : "sem NCM", realCost: prices ? money(prices.realCost) : NONE, table: prices ? money(prices.table) : NONE, tableWithIpi: prices ? money(prices.tableWithIpi) : null, maxSp: prices ? showPercent(prices.maxSp, 2) : NONE, maxTaxpayer: prices ? showPercent(prices.maxTaxpayer, 2) : NONE, taxCreditDisplay: showPercent(product.taxCredit, 2) };
}

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);
  const raw = await searchParams;
  const lines = await listLines(conn);
  const line = pickLine(lines, raw[LINE_PARAM]);
  const lineValues = lines.map((item) => String(item.id));
  const options = { sorts: ["codigo", "nome"] as const, defaultSort: "codigo" as const, filters: { aba: PRODUCT_TABS.map((tab) => tab.key), linha: lineValues } };
  const query = parseListQuery({ ...raw, linha: String(line.id) }, options);
  const tab = (query.filters.aba?.[0] ?? "ativos") as (typeof PRODUCT_TABS)[number]["key"];
  const [params, latest, nextNumber, result, tabCounts] = await Promise.all([loadParams(conn, line.id), latestVersion(conn, line.id), nextVersionNumber(conn), queryProducts(query, line.id, conn), loadProductTabCounts(line.id, conn)]);
  const publishedParams = latest ? await loadPublishedParams(latest.version, conn) : null;
  const publication = await loadProductPublicationSummary(line.id, latest?.version ?? null, publishedParams ? !samePricingParams(params, publishedParams) : false, params.safetyMargin, conn);
  const notice = publishNoticeFromCount(publication.itemCount, latest, publication.pending, nextNumber);
  const rows = result.items.map((product) => toRow(product, params));
  const page = result;
  const words = lineWords(line.imported);

  return (
    <>
      <ProductTools create={createProductAction} paste={pasteAdvisoryCostsAction} lineId={line.id} imported={line.imported} heading={<PageHeader title={ITEM.label} hint="Custos e preços dos equipamentos. Alterações chegam à equipe após publicar." />} />
      <LineTabs lines={lines} current={line.id} path={ITEM.href} />
      <PublishBanner key={line.id} notice={notice} lineId={line.id} />

      <nav aria-label="Situação dos equipamentos" className="view-tabs mt-4 flex-nowrap overflow-x-auto">
        {PRODUCT_TABS.map(({ key, label }) => {
          const filters: Record<string, string[]> = { linha: [String(line.id)], ...(key === "ativos" ? {} : { aba: [key] }) };
          return <Link key={key} href={listHref(ITEM.href, query, { filters, page: 1 }, options)} aria-current={key === tab ? "page" : undefined}>{label} ({tabCounts[key]})</Link>;
        })}
      </nav>

      <section className={`${CARD} mt-3 list-screen`} aria-label="Equipamentos">
        <ListQuery path={ITEM.href} query={query} options={options} searchLabel="Buscar produto por nome, código ou fornecedor" searchPlaceholder="Nome, código ou fornecedor" sorts={[{ value: "codigo", label: "Código" }, { value: "nome", label: "Nome" }]} />
        <p className="px-4 pb-3 text-xs text-slate-600">{counterText(result.total, params.safetyMargin)}</p>
        {tab === "sem-codigo" && query.search === "" && result.total > 0 && <ActionForm action={deleteProductsWithoutCodeAction} className="border-t border-slate-200 px-4 py-3"><input type="hidden" name="lineId" value={line.id} /><ConfirmButton label={`Excluir os ${result.total} sem código`} confirmLabel={`Confirmar: excluir os ${result.total}`} className={`${SECONDARY} text-red-700`} /><p className="mt-1 text-xs text-slate-600">Saem do cadastro e da tabela publicada. Itens com histórico permanecem.</p></ActionForm>}

        {rows.length === 0 ? <div className="border-t border-slate-200"><EmptyState title="Nenhum equipamento encontrado" description="Ajuste a aba, a busca ou os filtros para ver outros equipamentos." action={<Link href={lineHref(ITEM.href, line.id)} className={SECONDARY}>Limpar busca e filtros</Link>} /></div> : <div className="list-results">
          <ul className="2xl:hidden">
            {rows.map((row) => <li key={row.id} className="border-t border-slate-200 px-4 py-3 first:border-t-0"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><Link href={`${ITEM.href}/${row.id}`} className="break-words font-medium text-brand underline">{row.values.name}</Link><p className="mt-1 break-words text-xs text-slate-500">{[row.values.code || "sem código", row.supplier, row.ncm].filter(Boolean).join(" · ")}</p></div><div className="shrink-0 text-right"><strong className="block">{row.tableWithIpi ?? "Sem custo"}</strong><span className="block text-xs text-slate-500">{row.tableWithIpi ? "Preço com IPI" : "Preço indisponível"}</span></div></div><dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><div><dt className="text-slate-500">{words.cost}</dt><dd>{row.values.advisoryCost || NONE}</dd></div><div><dt className="text-slate-500">Crédito tributário</dt><dd>{row.taxCreditDisplay}</dd></div><div><dt className="text-slate-500">Embalagem</dt><dd>{row.values.packaging || "0,00"}</dd></div><div><dt className="text-slate-500">Desconto máximo</dt><dd>SP {row.maxSp} · contribuinte {row.maxTaxpayer}</dd></div></dl><Link href={`${ITEM.href}/${row.id}`} className={`${SECONDARY} mt-3 w-full sm:w-auto`}>Editar custos e cadastro</Link></li>)}
          </ul>
          <div className="hidden 2xl:block"><table className="w-full table-fixed text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-1/4 px-3 py-2 text-left">Equipamento</th><th className="px-3 py-2 text-right">{words.cost}</th><th className="px-3 py-2 text-right">Crédito tributário</th><th className="px-3 py-2 text-right">Embalagem</th><th className="px-3 py-2 text-right">Custo real e preços</th><th className="px-3 py-2 text-right">Descontos máximos</th><th className="px-3 py-2"><span className="sr-only">Ações</span></th></tr></thead><tbody>{rows.map((row) => <ProductRow key={row.id} row={row} imported={line.imported} save={updateProductAction} setActive={setProductActiveAction} remove={deleteProductAction} />)}</tbody></table></div>
        </div>}
        <ListPager path={ITEM.href} query={query} options={options} result={page} noun={["equipamento", "equipamentos"]} />
      </section>
    </>
  );
}

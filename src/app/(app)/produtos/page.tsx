import Link from "next/link";
import { LineTabs } from "@/components/LineTabs";
import { ListPager, ListQuery } from "@/components/ListQuery";
import { ProductsGrid } from "@/components/ProductsGrid";
import { CARD, EmptyState, PageHeader, Pill, PRIMARY, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listLines } from "@/lib/db/product-lines";
import { loadProductTabCounts, queryProducts } from "@/lib/db/products";
import { tenantDb } from "@/lib/db/pool";
import { LINE_PARAM, lineHref, pickLine } from "@/lib/lines-view";
import { listHref, parseListQuery } from "@/lib/list-query";
import { PRODUCT_TABS } from "@/lib/products-view";

const ITEM = menuItem("produtos");
const NONE = "—";
export const metadata = { title: `${ITEM.label} · ERP` };
export const dynamic = "force-dynamic";
const formatNcm = (ncm: string | null) => !ncm ? NONE : /^\d{8}$/.test(ncm) ? `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6)}` : ncm;

export default async function ProdutosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);
  const raw = await searchParams;
  const lines = await listLines(conn);
  const line = pickLine(lines, raw[LINE_PARAM]);
  const options = { sorts: ["codigo", "nome", "fornecedor", "modelo", "ncm", "situacao"] as const, defaultSort: "codigo" as const, filters: { aba: PRODUCT_TABS.map((tab) => tab.key), linha: lines.map((item) => String(item.id)) } };
  const query = parseListQuery({ ...raw, linha: String(line.id) }, options);
  const tab = (query.filters.aba?.[0] ?? "ativos") as (typeof PRODUCT_TABS)[number]["key"];
  const [result, counts] = await Promise.all([queryProducts(query, line.id, conn), loadProductTabCounts(line.id, conn)]);
  const rows = result.items.map((product) => ({ id: product.id, name: product.name, code: product.code ?? NONE, supplier: product.supplierName ?? NONE, model: product.supplierModel ?? NONE, ncm: formatNcm(product.ncm), active: product.active }));
  const sortLink = (sort: (typeof options.sorts)[number]) => listHref(ITEM.href, query, { sort, direction: query.sort === sort && query.direction === "asc" ? "desc" : "asc" }, options);
  const hrefs = { name: sortLink("nome"), code: sortLink("codigo"), supplier: sortLink("fornecedor"), model: sortLink("modelo"), ncm: sortLink("ncm"), status: sortLink("situacao") };
  return <>
    <PageHeader title={ITEM.label} hint="Cadastro técnico dos equipamentos usados em pedidos, compras e estoque." actions={<><Link href="/produtos/catalogo-fornecedor" className={SECONDARY}>Catálogo do fornecedor</Link><Link href={`/produtos/novo?linha=${line.id}`} className={PRIMARY}>+ Equipamento</Link></>} />
    <LineTabs lines={lines} current={line.id} path={ITEM.href} />
    <nav aria-label="Situação dos equipamentos" className="view-tabs mt-4 flex-nowrap overflow-x-auto">{PRODUCT_TABS.map(({ key, label }) => { const filters = { linha: [String(line.id)], ...(key === "ativos" ? {} : { aba: [key] }) }; return <Link key={key} href={listHref(ITEM.href, query, { filters, page: 1 }, options)} aria-current={key === tab ? "page" : undefined}>{label} ({counts[key]})</Link>; })}</nav>
    <section className={`${CARD} mt-3 list-screen`} aria-label="Produtos cadastrados">
      <ListQuery path={ITEM.href} query={query} options={options} searchLabel="Buscar produto por nome, código ou fornecedor" searchPlaceholder="Nome, código ou fornecedor" sorts={[{ value: "codigo", label: "Código" }, { value: "nome", label: "Nome" }, { value: "fornecedor", label: "Fornecedor" }, { value: "modelo", label: "Modelo" }, { value: "ncm", label: "NCM" }, { value: "situacao", label: "Situação" }]} controls="search" />
      {rows.length === 0 ? <EmptyState title="Nenhum produto encontrado" description="Ajuste a aba ou a busca para ver outros equipamentos." action={<Link href={lineHref(ITEM.href, line.id)} className={SECONDARY}>Limpar busca</Link>} /> : <div className="list-results"><ul className="md:hidden">{rows.map((row) => <li key={row.id} className="border-t border-slate-200 px-4 py-3 first:border-t-0"><div className="flex items-start justify-between gap-3"><Link href={`${ITEM.href}/${row.id}`} className="break-words font-medium text-brand underline">{row.name}</Link><Pill tone={row.active ? "good" : "neutral"}>{row.active ? "Ativo" : "Inativo"}</Pill></div><p className="mt-1 break-words text-xs text-slate-500">{row.code} · {row.supplier} · {row.model} · NCM {row.ncm}</p></li>)}</ul><ProductsGrid rows={rows} hrefs={hrefs} sort={query.sort} direction={query.direction} /></div>}
      <ListPager path={ITEM.href} query={query} options={options} result={result} noun={["produto", "produtos"]} />
    </section>
  </>;
}

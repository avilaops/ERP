import Link from "next/link";
import { ListPager, ListQuery } from "@/components/ListQuery";
import { CARD, PageHeader, Pill, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { latestVersion, loadPublishedParams, nextVersionNumber } from "@/lib/db/price-table";
import { loadParams } from "@/lib/db/params";
import { listLines } from "@/lib/db/product-lines";
import { loadPriceTableDraftRevision, loadProductPublicationSummary } from "@/lib/db/products";
import { queryPriceTableReview } from "@/lib/db/price-table-review";
import { withTenantConnection } from "@/lib/db/pool";
import { exactLine } from "@/lib/lines-view";
import { parseListQuery } from "@/lib/list-query";
import { draftPriceTable, samePricingParams } from "@/lib/price-table";
import { priceTableReview, priceTableReviewRow, pricingRuleChanges } from "@/lib/price-table-review";
import { publishPriceTableAction } from "../actions";
import { PublishReviewForm } from "./PublishReviewForm";

const HERE = "/produtos/publicacao";
const OPTIONS = { sorts: ["nome"] as const, defaultSort: "nome" as const, filters: { categoria: ["custos", "novos", "removidos", "cadastro", "regras"], linha: [] as string[] } };
const LABELS = { custos: "Custos e tributos", novos: "Novos", removidos: "Saem da tabela", cadastro: "Nome ou código", regras: "Regras comerciais" } as const;

export const metadata = { title: "Revisar publicação · ERP" };
export const dynamic = "force-dynamic";

export default async function PublicacaoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("produtos");
  const raw = await searchParams;
  const data = await withTenantConnection(session.tenant.slug, async (conn) => {
    await conn.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    try {
      const lines = await listLines(conn);
      const line = exactLine(lines, (Array.isArray(raw.linha) ? raw.linha[0] : raw.linha) ?? null) ?? lines[0];
      if (!line) {
        await conn.query("COMMIT");
        return { lines, line: null } as const;
      }
      const options = { ...OPTIONS, filters: { ...OPTIONS.filters, linha: lines.map((item) => String(item.id)) } };
      const query = parseListQuery({ ...raw, linha: String(line.id) }, options);
      // `conn` is one pinned client so every read sees the same revision. A pg
      // client executes one query at a time; keeping these reads sequential also
      // avoids queued-query warnings becoming browser console errors.
      const params = await loadParams(conn, line.id);
      const latest = await latestVersion(conn, line.id);
      const next = await nextVersionNumber(conn);
      const revision = await loadPriceTableDraftRevision(line.id, conn);
      const publishedParams = latest ? await loadPublishedParams(latest.version, conn) : null;
      const rulesChanged = publishedParams ? !samePricingParams(params, publishedParams) : false;
      const summary = await loadProductPublicationSummary(line.id, latest?.version ?? null, rulesChanged, params.safetyMargin, conn);
      const result = await queryPriceTableReview(query, line.id, latest?.version ?? null, rulesChanged, params.safetyMargin, conn);
      const { items: rawItems, ...pagination } = result;
      const items = rawItems.map((row) => {
        const current = row.current ? draftPriceTable(params, [row.current]).items[0] ?? null : null;
        return priceTableReviewRow(current, row.published, row.category, params, publishedParams);
      });
      const rules = publishedParams && latest ? pricingRuleChanges({ params, items: [] }, { ...latest, params: publishedParams, items: [] }) : [];
      await conn.query("COMMIT");
      return { lines, line, options, query, next, revision, pending: summary.pending, items, pagination, rules } as const;
    } catch (error) {
      await conn.query("ROLLBACK");
      throw error;
    }
  });
  const { line } = data;
  if (!line) return <p>Nenhuma linha de produto cadastrada.</p>;
  const { options, query, next, revision, pending, items, pagination, rules } = data;

  return <>
    <PageHeader title={`Revisar publicação v${next}`} hint={`Linha ${line.name}. Confira alterações e efeito financeiro antes de disponibilizar à equipe.`} actions={<Link href={`/produtos?linha=${line.id}`} className={SECONDARY}>Voltar aos produtos</Link>} />
    {!pending ? <section className={`${CARD} mt-4 p-5`}><p>Nada mudou desde a tabela publicada.</p></section> : <>
      <section className={`${CARD} mt-4 p-4`} aria-label="Resumo da publicação"><div className="flex flex-wrap gap-2">{pending.costs > 0 && <Pill tone="warn">{pending.costs} custos</Pill>}{pending.added > 0 && <Pill tone="good">{pending.added} novos</Pill>}{pending.removed > 0 && <Pill tone="bad">{pending.removed} removidos</Pill>}{pending.renamed > 0 && <Pill tone="neutral">{pending.renamed} nomes ou códigos</Pill>}{pending.rules && <Pill tone="warn">Regras alteradas</Pill>}</div>{rules.length > 0 && <details className="mt-3"><summary className="min-h-[var(--control)] cursor-pointer font-medium text-brand">Ver regras alteradas</summary><dl className="grid gap-2 sm:grid-cols-2">{rules.map((rule) => <div key={rule.field}><dt className="text-sm font-medium">{rule.field}</dt><dd className="text-sm text-slate-600">{rule.before} → {rule.after}</dd></div>)}</dl></details>}</section>
      <section className={`${CARD} mt-4 list-screen`}>
        <ListQuery path={HERE} query={query} options={options} searchLabel="Buscar equipamento alterado" searchPlaceholder="Nome ou código" sorts={[{ value: "nome", label: "Nome" }]} filters={[{ key: "categoria", label: "Tipo de alteração", choices: Object.entries(LABELS).map(([value, label]) => ({ value, label })) }]} />
        {items.length === 0 ? <p className="p-6">Nenhuma alteração corresponde aos filtros.</p> : <ul className="list-results">{items.map((row) => <li key={`${row.category}-${row.productId}`} className="border-t border-slate-200 p-4 first:border-t-0"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{row.name}</strong><Pill tone={row.category === "removidos" ? "bad" : row.category === "novos" ? "good" : "warn"}>{LABELS[row.category]}</Pill></div><p className="text-xs text-slate-500">{row.code ?? "Sem código"}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Figures title="Tabela atual" values={row.before} /><Figures title="Nova tabela" values={row.after} /></div></li>)}</ul>}
        <ListPager path={HERE} query={query} options={options} result={pagination} noun={["alteração", "alterações"]} />
      </section>
      <section className={`${CARD} publication-action mt-3 flex items-center justify-between gap-3 px-3 py-2`}><p className="text-sm"><span className="sm:hidden">Publicação irreversível.</span><span className="hidden sm:inline">A publicação não pode ser desfeita. Pedidos existentes preservam a versão usada.</span></p><PublishReviewForm action={publishPriceTableAction} lineId={line.id} expected={next} revision={revision} /></section>
    </>}
  </>;
}
function Figures({ title, values }: { title: string; values: ReturnType<typeof priceTableReview>[number]["before"] }) {
  if (!values) return <div><h3 className="text-sm font-semibold">{title}</h3><p className="text-sm text-slate-500">Não estava nesta tabela.</p></div>;
  return <div><h3 className="text-sm font-semibold">{title}</h3><dl className="mt-1 grid grid-cols-2 gap-x-3 text-xs"><dt>Custo</dt><dd className="text-right">{values.cost}</dd><dt>Crédito tributário</dt><dd className="text-right">{values.credit}</dd><dt>Embalagem</dt><dd className="text-right">{values.packaging}</dd><dt>Custo real</dt><dd className="text-right">{values.realCost}</dd><dt>Preço sem IPI</dt><dd className="text-right">{values.table}</dd><dt>Preço com IPI</dt><dd className="text-right">{values.tableWithIpi}</dd><dt>Desconto máximo SP</dt><dd className="text-right">{values.maxSp}</dd><dt>Desconto contribuinte</dt><dd className="text-right">{values.maxTaxpayer}</dd></dl></div>;
}

import Link from "next/link";
import { cookies } from "next/headers";
import { FitRows } from "@/components/FitRows";
import { CARD, INPUT, PageHeader, Pill, PRIMARY, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { documentFilter, documentHref, searchDocuments } from "@/lib/db/documents";
import { rowsPerPage } from "@/lib/rows";

export const metadata = { title: "Documentos · ERP" };
export const dynamic = "force-dynamic";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("documentos");
  const conn = tenantDb(session.tenant.slug);
  const f = documentFilter(await searchParams, rowsPerPage((await cookies()).get("erp_documentos_linhas")?.value, 1));
  const result = await searchDocuments(f, session, conn);
  return <>
    <PageHeader title="Documentos" hint="Consulte o acervo e confira a versão e a fonte." actions={session.role === "DIRETORIA" ? <Link href="/documentos/coletas" className={SECONDARY}>Coletas</Link> : undefined} />
    <section className={`${CARD} mt-3`} aria-label="Biblioteca de documentos">
      <form action="/documentos" role="search" className="space-y-2 p-3">
        <label className="block text-sm font-medium" htmlFor="document-search">Termo, código ou campo</label>
        <div className="flex gap-2"><input id="document-search" name="q" defaultValue={f.q} className={`${INPUT} !mt-0`} maxLength={160} type="search" /><button className={PRIMARY}>Buscar</button></div>
        {[["colecao",f.collection],["tipo",f.kind],["estado",f.status],["categoria",f.category],["de",f.from],["ate",f.until],["versao",f.version]].map(([key,value])=>value ? <input key={key} type="hidden" name={key} value={value} /> : null)}
        <Link href={documentHref(f).replace("/documentos", "/documentos/filtros")} className={SECONDARY}>Filtros</Link>
      </form>
      <div id="document-results" className="divide-y divide-slate-200 border-t border-slate-200">
        {result.rows.length === 0 ? <p className="p-4 text-sm text-slate-600">Nenhum documento encontrado. Ajuste a busca{session.role === "DIRETORIA" ? " ou confira as coletas." : "."}</p> : result.rows.map(row => <article data-row key={row.id} className="p-3">
          <Link href={`/documentos/${row.id}`} className="flex min-h-[var(--control)] items-center break-words font-semibold text-brand underline">{row.title}</Link>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><span>{row.collection}</span><Pill tone={row.status === "indexed" ? "good" : "warn"}>{row.status === "indexed" ? "Indexado" : "Revisar extração"}</Pill></div>
        </article>)}
      </div>
      <nav data-after-rows aria-label="Resultados" className="flex flex-wrap justify-between gap-2 border-t border-slate-200 p-2">
        {f.before ? <Link href={documentHref(f, { before: "" })} className={SECONDARY}>Início da lista</Link> : <span className="self-center text-sm text-slate-600">{result.rows.length} nesta página</span>}
        {result.more && <Link href={documentHref(f, { before: `${result.rows.at(-1)!.id}:${result.rows.at(-1)!.relevance}` })} className={SECONDARY}>Próximos</Link>}
      </nav>
    </section>
    <FitRows listId="document-results" shown={f.limit} minimum={1} cookieName="erp_documentos_linhas" />
  </>;
}

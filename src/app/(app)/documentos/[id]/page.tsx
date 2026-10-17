import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, INPUT, PageHeader, Pill, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { documentContent, documentSchema, documentVersions, getDocument } from "@/lib/db/documents";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ler documento · ERP" };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("documentos");
  const conn = tenantDb(session.tenant.slug);
  const { id } = await params;
  const query = await searchParams;
  const first = (key: string) => String(Array.isArray(query[key]) ? query[key][0] ?? "" : query[key] ?? "");
  const doc = await getDocument(id, session, conn, first("versao"));
  if (!doc) notFound();
  const tab = ["conteudo", "fonte", "historico", "schema"].includes(first("aba")) ? first("aba") : "conteudo";
  const part = /^\d{1,6}$/.test(first("trecho")) ? Math.max(1, Number(first("trecho"))) : 1;
  const href = (aba: string, trecho = 1, version = String(doc.version_id)) => `/documentos/${id}?${new URLSearchParams({ aba, trecho: String(trecho), versao: version })}`;
  const content = tab === "conteudo" ? await documentContent(String(doc.version_id), part, conn) : null;
  const versions = tab === "historico" ? await documentVersions(id, conn) : [];
  const elements = tab === "schema" ? await documentSchema(String(doc.version_id), conn, first("campo")) : [];
  return <>
    <PageHeader title="Ler documento" actions={<Link href="/documentos" className={SECONDARY}>Biblioteca</Link>} />
    <h2 className="mt-2 break-words text-base font-semibold">{doc.title}</h2>
    <nav aria-label="Informações do documento" className="mt-2 flex flex-wrap gap-1">{[["conteudo", "Texto"], ["fonte", "Fonte"], ["historico", "Versões"], ["schema", "Campos"]].map(([key, label]) => <Link key={key} href={href(key)} aria-current={tab === key ? "page" : undefined} className={SECONDARY}>{label}</Link>)}</nav>
    <section className={`${CARD} mt-2 p-3`}>
      {tab === "conteudo" && <>
        {content?.chunk ? <>
          <p className="mb-2 text-sm text-slate-600">Página {content.chunk.page}{content.chunk.section ? ` · ${content.chunk.section}` : ""}</p>
          <div role="region" aria-label="Texto do documento" tabIndex={0} className="max-h-[30dvh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{content.chunk.content}</div>
          <nav aria-label="Trechos" className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {part > 1 && <Link className={SECONDARY} href={href(tab, part - 1)}>Anterior</Link>}
            <span className="text-sm">Trecho {part} de {content.total}</span>
            {part < content.total && <Link className={SECONDARY} href={href(tab, part + 1)}>Próximo</Link>}
          </nav>
        </> : <p className="text-sm">Texto não disponível para este trecho. Consulte o original ou as pendências da extração.</p>}
      </>}
      {tab === "fonte" && <div className="max-h-[40dvh] space-y-3 overflow-y-auto break-words text-sm" tabIndex={0} role="region" aria-label="Proveniência">
        <Pill tone={doc.status === "indexed" ? "good" : "warn"}>{doc.status === "indexed" ? "Indexado" : "Extração precisa de revisão"}</Pill>
        <p>Coleção: {doc.collection} · Versão interna: {doc.version_id}</p><p>Coletado: {new Date(doc.collected_at).toLocaleString("pt-BR")}</p>
        <p>Formato: {doc.mime} · {doc.bytes} bytes</p>
        <p className="break-all">SHA-256: {doc.sha256}</p><p>Extrator: {doc.extractor}</p>
        <p className="break-all">Origem: {doc.url}</p>
        <Link className={SECONDARY} href={`/api/documentos/${id}/original?versao=${doc.version_id}`}>Baixar original</Link>
        {(doc.warnings as string[]).map((warning, i) => <p key={i} className="text-amber-900">{warning}</p>)}
      </div>}
      {tab === "historico" && <div className="max-h-[40dvh] overflow-y-auto" tabIndex={0} role="region" aria-label="Versões">{versions.map(v => <Link key={v.id} href={href("fonte", 1, String(v.id))} className="flex min-h-[var(--control)] items-center break-words border-b border-slate-200 text-sm text-brand underline">{new Date(v.collected_at).toLocaleString("pt-BR")} · {v.status} · {String(v.sha256).slice(0, 12)}</Link>)}</div>}
      {tab === "schema" && <>
        <form className="flex gap-2"><input type="hidden" name="aba" value="schema" /><input type="hidden" name="versao" value={doc.version_id} /><label className="flex-1 text-sm">Nome ou namespace exato<input name="campo" defaultValue={first("campo")} className={INPUT} maxLength={200} /></label><button className={`${SECONDARY} self-end`}>Filtrar</button></form>
        <div className="mt-2 max-h-[25dvh] overflow-y-auto break-words text-sm" tabIndex={0} role="region" aria-label="Campos XML">{elements.length ? elements.map((e, i) => <div key={i} className="border-b border-slate-200 py-2"><p className="font-semibold">{e.name} · {e.kind}</p><p>{e.type_name} · {e.min_occurs ?? "1"}…{e.max_occurs ?? "1"}</p><p>{e.documentation}</p><p className="break-all">{e.namespace}</p></div>) : <p>Nenhum campo XML encontrado. A lista mostra até 30 campos por filtro.</p>}</div>
      </>}
    </section>
  </>;
}

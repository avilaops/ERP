import Link from "next/link";
import { INPUT, PageHeader, PRIMARY, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { documentFilter, documentHref, listDocumentCollections, DOCUMENT_KINDS } from "@/lib/db/documents";
import { tenantDb } from "@/lib/db/pool";

export const metadata = { title:"Filtrar documentos · ERP" };
export const dynamic = "force-dynamic";

export default async function FiltersPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const session = await requirePermission("documentos");
  const p=await searchParams;
  const f=documentFilter(p);
  const collections=await listDocumentCollections(session,tenantDb(session.tenant.slug));
  return <>
    <PageHeader title="Filtrar documentos" hint="Combine os critérios e aplique tudo de uma vez." actions={<Link className={SECONDARY} href={documentHref(f)}>Voltar</Link>} />
    <form action="/documentos" className="mt-3 max-w-3xl space-y-4">
      <input type="hidden" name="q" value={f.q} />
      <fieldset className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold uppercase tracking-wide">Coleção e formato</legend>
        <label className="block text-sm">Coleção<select name="colecao" defaultValue={f.collection} className={INPUT}><option value="">Todas</option>{collections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block text-sm">Formato<select name="tipo" defaultValue={f.kind} className={INPUT}><option value="">Todos</option>{DOCUMENT_KINDS.map(k=><option key={k} value={k}>{k.split("/")[1]}</option>)}</select></label>
      </fieldset>
      <fieldset className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold uppercase tracking-wide">Categoria e extração</legend>
        <label className="block text-sm">Categoria<select name="categoria" defaultValue={f.category} className={INPUT}><option value="">Todas</option>{["manuais","esquemas-xml","informes-tecnicos","diversos","material-tecnico"].map(k=><option key={k} value={k}>{k}</option>)}</select></label>
        <label className="block text-sm">Extração<select name="estado" defaultValue={f.status} className={INPUT}><option value="">Todas</option><option value="indexed">Indexado</option><option value="partial">Precisa de revisão</option><option value="failed">Falhou</option></select></label>
      </fieldset>
      <fieldset className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold uppercase tracking-wide">Período e versão</legend>
        <label className="text-sm">Coletado desde<input type="date" name="de" defaultValue={f.from} className={INPUT} /></label>
        <label className="text-sm">Até<input type="date" name="ate" defaultValue={f.until} className={INPUT} /></label>
        <label className="block text-sm">Número da versão<input name="versao" inputMode="numeric" pattern="[0-9]*" defaultValue={f.version} className={INPUT} /></label>
      </fieldset>
      <div className="flex flex-wrap gap-2"><button className={PRIMARY}>Aplicar filtros</button><Link href="/documentos" className={SECONDARY}>Limpar</Link></div>
    </form>
  </>;
}

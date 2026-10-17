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
  const step=["2","3"].includes(String(p.etapa)) ? Number(p.etapa) : 1;
  const collections=await listDocumentCollections(session,tenantDb(session.tenant.slug));
  return <>
    <PageHeader title="Filtrar documentos" hint={`Etapa ${step} de 3 · ${step===1?"Coleção e formato":step===2?"Categoria e extração":"Período de coleta e versão"}`} actions={<Link className={SECONDARY} href={documentHref(f)}>Voltar</Link>} />
    <form action="/documentos" className="mt-3 space-y-3">
      <input type="hidden" name="q" value={f.q} />
      {step!==1 && [["colecao",f.collection],["tipo",f.kind]].map(([key,value])=><input key={key} type="hidden" name={key} value={value} />)}
      {step!==2 && [["categoria",f.category],["estado",f.status]].map(([key,value])=><input key={key} type="hidden" name={key} value={value} />)}
      {step!==3 && [["de",f.from],["ate",f.until],["versao",f.version]].map(([key,value])=><input key={key} type="hidden" name={key} value={value} />)}
      {step===1 ? <>
        <label className="block text-sm">Coleção<select name="colecao" defaultValue={f.collection} className={INPUT}><option value="">Todas</option>{collections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block text-sm">Formato<select name="tipo" defaultValue={f.kind} className={INPUT}><option value="">Todos</option>{DOCUMENT_KINDS.map(k=><option key={k} value={k}>{k.split("/")[1]}</option>)}</select></label>
      </> : step===2 ? <>
        <label className="block text-sm">Categoria<select name="categoria" defaultValue={f.category} className={INPUT}><option value="">Todas</option>{["manuais","esquemas-xml","informes-tecnicos","diversos","material-tecnico"].map(k=><option key={k} value={k}>{k}</option>)}</select></label>
        <label className="block text-sm">Extração<select name="estado" defaultValue={f.status} className={INPUT}><option value="">Todas</option><option value="indexed">Indexado</option><option value="partial">Precisa de revisão</option><option value="failed">Falhou</option></select></label>
      </> : <>
        <div className="grid grid-cols-2 gap-2"><label className="text-sm">Coletado desde<input type="date" name="de" defaultValue={f.from} className={INPUT} /></label><label className="text-sm">Até<input type="date" name="ate" defaultValue={f.until} className={INPUT} /></label></div>
        <label className="block text-sm">Número da versão<input name="versao" inputMode="numeric" pattern="[0-9]*" defaultValue={f.version} className={INPUT} /></label>
      </>}
      <div className="flex flex-wrap gap-2"><button className={PRIMARY}>Aplicar filtros</button>{step<3 && <button formAction="/documentos/filtros" name="etapa" value={step+1} className={SECONDARY}>Próxima etapa</button>}<Link href="/documentos" className={SECONDARY}>Limpar</Link></div>
    </form>
  </>;
}

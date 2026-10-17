import Link from "next/link";
import { redirect } from "next/navigation";
import { CARD, PageHeader, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { documentJobs } from "@/lib/db/documents";
import { tenantDb } from "@/lib/db/pool";
import { retryAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coletas de documentos · ERP" };

const STATES: Record<string, string> = { pending: "Aguardando", running: "Em processamento", indexed: "Indexado", partial: "Revisar extração", failed: "Falhou", blocked: "Acesso bloqueado" };

export default async function DocumentJobsPage() {
  const session = await requirePermission("documentos");
  if (session.role !== "DIRETORIA") redirect("/sem-acesso");
  const jobs = await documentJobs(tenantDb(session.tenant.slug));
  return <>
    <PageHeader title="Coletas de documentos" hint="Confira as pendências antes de repetir uma coleta." actions={<Link className={SECONDARY} href="/documentos">Biblioteca</Link>} />
    <div className="mt-3 flex flex-wrap gap-2 text-sm">{jobs.summary.map(s => <span key={s.state}>{STATES[s.state]}: {s.total}</span>)}</div>
    <section className={`${CARD} mt-3 max-h-[35dvh] overflow-y-auto`} tabIndex={0} role="region" aria-label="Últimas cinco coletas">
      {jobs.rows.length === 0 ? <p className="p-3 text-sm">Nenhuma fonte configurada. Cadastre as raízes com o comando documents:seed do runbook.</p> : jobs.rows.map(j => <article key={j.id} className="space-y-2 border-b border-slate-200 p-3 text-sm">
        <p>{STATES[j.state]} · {j.attempts} tentativa(s)</p><details><summary className="flex min-h-[var(--control)] cursor-pointer items-center text-brand">Ver endereço e resultado</summary><p className="break-all">{j.url}</p><p className="mt-2 break-words">{j.last_error ?? "Sem falha registrada."}</p></details>
        {["failed", "blocked", "partial"].includes(j.state) && <form action={retryAction}><input type="hidden" name="id" value={j.id} /><button className={SECONDARY}>Recolocar na fila</button></form>}
      </article>)}
    </section>
    <p className="mt-2 text-sm text-slate-600">Recolocar na fila não executa o worker. Consulte o runbook para iniciar o processamento.</p>
  </>;
}

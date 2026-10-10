import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY, SECTION_TITLE } from "@/components/ui";
import { aiConfigured } from "@/lib/ai/client";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { latestAssists, loadAiSettings } from "@/lib/db/assist";
import { getOpportunity, opportunityParty } from "@/lib/db/funnel";
import { listInbox } from "@/lib/db/inbox";
import { tenantDb } from "@/lib/db/pool";
import { showDateTime } from "@/lib/format";
import { ActionForm } from "../../../pedidos/ActionForm";
import { assistAction } from "../../actions";

export const metadata = { title: "Assistente · ERP" };
export const dynamic = "force-dynamic";

export default async function AssistentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission("funil", `/funil/${id}/assistente`);
  const conn = tenantDb(session.tenant.slug);
  if (!/^[1-9]\d{0,8}$/.test(id)) notFound();
  const item = await getOpportunity(Number(id), { ownerEmail: seesAllOrders(session) ? null : session.email }, conn);
  // An opportunity of another seller answers as one that does not exist.
  if (!item) notFound();
  const configured = aiConfigured();
  const on = configured && (await loadAiSettings(conn)).enabled;
  const { summary } = await latestAssists(item.id, conn);
  const answered = (await listInbox(item.id, conn)).length > 0;
  const hidden = <input type="hidden" name="id" value={item.id} />;
  const tone = summary?.content.score == null ? "neutral" : summary.content.score >= 60 ? "good" : summary.content.score >= 30 ? "warn" : "bad";

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm">
        <Link href={`/funil/${item.id}`} className={QUIET_LINK}>
          ← {item.title}
        </Link>
      </p>
      <PageHeader title="Assistente" hint={`Lê o que está registrado nesta venda com ${opportunityParty(item)} e sugere. Não envia nem muda nada sozinho.`} />
      {!on && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {configured ? "O assistente está desligado. Quem liga é a diretoria, em Parâmetros → Assistente." : "O serviço do assistente ainda não foi ligado neste servidor pela Ávila Ops."}
        </p>
      )}

      {summary && (
        <section className={`${CARD} mt-3 p-3`} aria-label="Resumo">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={SECTION_TITLE}>Em que pé está</h2>
            {summary.content.score !== null && <Pill tone={tone}>chance {summary.content.score} de 100</Pill>}
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-800">{summary.content.summary}</p>
          {summary.content.reason && <p className="mt-2 text-sm text-slate-600">{summary.content.reason}</p>}
          {summary.content.nextAction && (
            <ActionForm action={assistAction} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {hidden}
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Próximo passo sugerido</p>
              <p className="mt-1 text-sm font-medium">{summary.content.nextAction}</p>
              <button type="submit" name="what" value="tarefa" className={`${SECONDARY} mt-2`}>
                Criar tarefa
              </button>
            </ActionForm>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Escrito pelo assistente em {showDateTime(summary.createdAt)}, a pedido de {summary.createdBy}. Confira antes de agir: ele só conhece o que está registrado aqui.
          </p>
        </section>
      )}

      {on && (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <ActionForm action={assistAction}>
            {hidden}
            <button type="submit" name="what" value="resumir" className={PRIMARY}>
              {summary ? "Resumir de novo" : "Resumir a venda"}
            </button>
          </ActionForm>
          {answered && (
            <ActionForm action={assistAction}>
              {hidden}
              <button type="submit" name="what" value="rascunhar" className={SECONDARY}>
                Rascunhar resposta ao cliente
              </button>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}

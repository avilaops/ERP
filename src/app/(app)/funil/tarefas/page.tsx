import Link from "next/link";
import { cookies } from "next/headers";
import { FitRows } from "@/components/FitRows";
import { CARD, Pager, PageHeader, pageOf, Pill, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { runAutomations } from "@/lib/db/automations";
import { ACTIVITY_LABELS, listPendingActivities } from "@/lib/db/funnel";
import { tenantDb } from "@/lib/db/pool";
import { isoDate } from "@/lib/format";
import { dueLabel } from "@/lib/funnel-view";
import { rowsPerPage, ROWS_COOKIE } from "@/lib/rows";
import { ActionForm } from "../../pedidos/ActionForm";
import { changeActivityAction } from "../actions";

export const metadata = { title: "Tarefas do funil · ERP" };
export const dynamic = "force-dynamic";

const HERE = menuItem("funil").href;

export default async function TarefasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("funil", "/funil/tarefas");
  const conn = tenantDb(session.tenant.slug);
  const everyone = seesAllOrders(session);
  const today = isoDate(new Date());
  // The reminders the rules of the company ask for are created here, when the list is opened.
  await runAutomations(today, conn);
  const pending = await listPendingActivities({ ownerEmail: everyone ? null : session.email }, conn);
  const late = pending.filter((activity) => activity.dueOn !== null && activity.dueOn < today).length;
  const asked = (await searchParams).p;
  const size = rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value);
  const slice = pageOf(pending, Array.isArray(asked) ? asked[0] : asked, size);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={HERE} className={QUIET_LINK}>
          ← Funil
        </Link>
      </p>
      <PageHeader title="Tarefas" hint={pending.length === 0 ? "Nada pendente." : `${pending.length} por fazer${late > 0 ? ` · ${late} atrasada${late === 1 ? "" : "s"}` : ""}${everyone ? " · equipe toda" : ""}`} />
      {pending.length === 0 ? (
        <p className={`${CARD} mt-3 p-4 text-sm text-slate-600`}>
          Nenhuma tarefa em aberto. O próximo passo de cada venda é registrado na oportunidade, e o sistema lembra sozinho de orçamento parado, contrato sem
          assinatura e parcela para vencer. Veja o{" "}
          <Link href={HERE} className={QUIET_LINK}>
            Funil
          </Link>
          .
        </p>
      ) : (
        <section className={`${CARD} mt-3`} aria-label="Tarefas por fazer">
          <ul id="tarefas">
            {slice.rows.map((activity) => {
              const due = dueLabel(activity.dueOn, today);
              return (
                <li key={activity.id} data-row className="flex items-center gap-3 border-b border-slate-200 px-3 py-2">
                  <Link href={activity.opportunityId !== null ? `${HERE}/${activity.opportunityId}` : `${menuItem("pedidos").href}/${activity.orderNumber}`} className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{activity.title}</span>
                    <span className="block text-sm text-slate-600">
                      {activity.subject}
                      {activity.party ? ` · ${activity.party}` : ""}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {activity.automatic ? "Lembrete automático" : ACTIVITY_LABELS[activity.kind]}
                      {due ? <Pill tone={due.tone}>{due.text}</Pill> : "sem data"}
                      {everyone && activity.ownerName}
                    </span>
                  </Link>
                  <ActionForm action={changeActivityAction}>
                    {activity.opportunityId !== null && <input type="hidden" name="id" value={activity.opportunityId} />}
                    <input type="hidden" name="activityId" value={activity.id} />
                    <button type="submit" name="what" value="concluir" aria-label={`Concluir: ${activity.title}`} className={SECONDARY}>
                      Concluir
                    </button>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
          <Pager {...slice} noun={["tarefa", "tarefas"]} hrefFor={(page) => (page > 1 ? `${HERE}/tarefas?p=${page}` : `${HERE}/tarefas`)} />
          <FitRows listId="tarefas" shown={size} />
        </section>
      )}
    </div>
  );
}

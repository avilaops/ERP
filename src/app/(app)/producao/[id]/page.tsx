import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, INPUT, LABEL, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY, SECTION_TITLE } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { getProductionOrder, listProductionMoves, listProductionStages } from "@/lib/db/production";
import { listMachines, listWork, showMinutes } from "@/lib/db/work";
import { showDateTime } from "@/lib/format";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { changeProductionAction, moveProductionAction, workAction } from "../actions";

export const metadata = { title: "Ordem de produção · ERP" };
export const dynamic = "force-dynamic";

export default async function OrdemDeProducaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission("producao", `/producao/${id}`);
  const conn = tenantDb(session.tenant.slug);
  const order = /^[1-9]\d{0,8}$/.test(id) ? await getProductionOrder(Number(id), conn) : null;
  if (!order) notFound();
  const stages = await listProductionStages(conn);
  const moves = await listProductionMoves(order.id, conn);
  // The next stage of the floor is the usual move: it comes chosen.
  const at = stages.findIndex((stage) => stage.id === order.stageId);
  const next = stages[at + 1] ?? stages[at];
  const hidden = <input type="hidden" name="id" value={order.id} />;
  const work = await listWork(order.id, new Date(), conn);
  const machines = (await listMachines(conn)).filter((machine) => machine.active);
  const mine = work.find((period) => period.endedAt === null && period.workerEmail === session.email) ?? null;
  const worked = work.reduce((sum, period) => sum + period.minutes, 0);

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm">
        <Link href={`${menuItem("producao").href}?etapa=${order.stageId}`} className={QUIET_LINK}>
          ← {order.stageName}
        </Link>
      </p>
      <PageHeader
        title={`${order.quantity} × ${order.productName}`}
        hint={
          <span className="flex flex-wrap items-center gap-2">
            {order.number} · {order.customer}
            <Pill tone={order.stageKind === "pronta" ? "good" : "neutral"}>{order.stageName}</Pill>
            {allows(session, "pedidos") && (
              <Link href={`${menuItem("pedidos").href}/${order.orderNumber}`} className={QUIET_LINK}>
                ver o pedido
              </Link>
            )}
          </span>
        }
      />

      {/* Where the order stands is the decision of this screen: one tap moves it. */}
      <ActionForm action={moveProductionAction} className="mt-3 flex flex-wrap items-end gap-2">
        {hidden}
        <div className="min-w-40 flex-1">
          <label htmlFor="stageId" className={LABEL}>
            Mover para a etapa
          </label>
          <select id="stageId" name="stageId" defaultValue={next.id} key={order.stageId} className={INPUT}>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={PRIMARY}>
          Mover
        </button>
      </ActionForm>

      <ActionForm action={changeProductionAction} className={`${CARD} mt-3 flex flex-col gap-3 p-3`}>
        {hidden}
        <div>
          <label htmlFor="dueOn" className={LABEL}>
            Para quando
          </label>
          <input id="dueOn" name="dueOn" type="date" defaultValue={order.dueOn ?? ""} className={INPUT} />
        </div>
        <div>
          <label htmlFor="notes" className={LABEL}>
            Observações para a fábrica
          </label>
          <textarea id="notes" name="notes" rows={3} defaultValue={order.notes ?? ""} className={`${INPUT} py-2`} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="what" value="salvar" className={SECONDARY}>
            Salvar
          </button>
          <ConfirmButton label="Tirar da produção" confirmLabel="Confirmar: tirar da produção" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
        </div>
      </ActionForm>

      <section className={`${CARD} mt-3 p-3`} aria-label="Horas">
        <div className="flex flex-wrap items-end gap-2">
          <p className="min-w-0 flex-1">
            <span className={SECTION_TITLE}>Horas</span>
            <span className="block text-sm text-slate-700">{work.length === 0 ? "Nenhuma hora apontada." : `${showMinutes(worked)} em ${work.length} ${work.length === 1 ? "período" : "períodos"}.`}</span>
          </p>
          <ActionForm action={workAction} className="flex flex-wrap items-end gap-2">
            {hidden}
            {mine ? (
              <button type="submit" name="what" value="parar" className={PRIMARY}>
                Parar o meu tempo
              </button>
            ) : order.stageKind === "pronta" ? null : (
              <>
                {machines.length > 0 && (
                  <select name="machineId" defaultValue="" aria-label="Máquina" className={`${INPUT} w-auto`}>
                    <option value="">Sem máquina</option>
                    {machines.map((machine) => (
                      <option key={machine.id} value={machine.id}>
                        {machine.name}
                      </option>
                    ))}
                  </select>
                )}
                <button type="submit" name="what" value="comecar" className={SECONDARY}>
                  Começar
                </button>
              </>
            )}
          </ActionForm>
        </div>
        {work.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Ver os períodos</summary>
            <ul className="mt-1 text-sm">
              {work.slice(0, 12).map((period) => (
                <li key={period.id} className="flex flex-wrap items-center gap-2 py-0.5">
                  <span className="min-w-0 flex-1 text-slate-700">
                    <span className="font-medium">{showMinutes(period.minutes)}</span> · {period.stageName}
                    {period.machine ? ` · ${period.machine}` : ""} · {period.workerName} · {showDateTime(period.startedAt)}
                    {period.endedAt === null ? " · em andamento" : ""}
                  </span>
                  {period.endedAt !== null && (
                    <ActionForm action={workAction}>
                      {hidden}
                      <input type="hidden" name="workId" value={period.id} />
                      <button type="submit" name="what" value="remover" aria-label="Remover este período" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50">
                        Remover
                      </button>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <details className={`${CARD} mt-3`}>
        <summary className="flex min-h-[var(--control)] cursor-pointer items-center px-3">
          <span className={SECTION_TITLE}>Por onde passou ({moves.length})</span>
        </summary>
        <ol className="border-t border-slate-200 p-3 text-sm">
          {moves.map((move, index) => (
            <li key={index} className="py-1">
              <span className="font-medium">{move.stageName}</span> <span className="text-slate-600">· {showDateTime(move.movedAt)} · {move.movedBy}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

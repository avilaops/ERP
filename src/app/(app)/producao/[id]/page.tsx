import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, INPUT, LABEL, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY, SECTION_TITLE } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { getProductionOrder, listProductionMoves, listProductionStages } from "@/lib/db/production";
import { showDateTime } from "@/lib/format";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { changeProductionAction, moveProductionAction } from "../actions";

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

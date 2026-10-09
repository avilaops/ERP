import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, INPUT, LABEL, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY, SECTION_TITLE } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { listCustomers } from "@/lib/db/customers";
import { ACTIVITY_LABELS, getOpportunity, listActivities, listStages, opportunityParty, syncOpportunitiesWithOrders } from "@/lib/db/funnel";
import { listOrders } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { isoDate, showDateTime, showMoney } from "@/lib/format";
import { dueLabel } from "@/lib/funnel-view";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { addActivityAction, changeActivityAction, deleteOpportunityAction, linkOrderAction, moveOpportunityAction, saveOpportunityAction } from "../actions";
import { OpportunityFields } from "../OpportunityFields";

export const metadata = { title: "Oportunidade · ERP" };
export const dynamic = "force-dynamic";

const HERE = menuItem("funil").href;
const TABS = [
  ["atividades", "Atividades"],
  ["dados", "Dados"],
  ["pedido", "Pedido"],
] as const;
const STAGE_TONES = { aberta: "neutral", ganha: "good", perdida: "bad" } as const;
const ORDER_STATUS: Record<string, string> = { em_negociacao: "em negociação", aguardando_aprovacao: "aguardando aprovação", fechado: "fechado", perdido: "perdido", cancelado: "cancelado" };

export default async function OportunidadePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const session = await requirePermission("funil", `/funil/${id}`);
  const conn = tenantDb(session.tenant.slug);
  const scope = { ownerEmail: seesAllOrders(session) ? null : session.email };
  if (!/^[1-9]\d{0,8}$/.test(id)) notFound();
  await syncOpportunitiesWithOrders(conn);
  const item = await getOpportunity(Number(id), scope, conn);
  // An opportunity of another seller answers as one that does not exist.
  if (!item) notFound();

  const asked = (await searchParams).aba;
  const tab = TABS.find(([key]) => key === (Array.isArray(asked) ? asked[0] : asked))?.[0] ?? "atividades";
  const stages = await listStages(conn);
  const today = isoDate(new Date());
  const hidden = <input type="hidden" name="id" value={item.id} />;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={HERE} className={QUIET_LINK}>
          ← Funil
        </Link>
      </p>
      <PageHeader
        title={item.title}
        hint={
          <span className="flex flex-wrap items-center gap-2">
            {opportunityParty(item)}
            {item.estimatedValue !== null && <strong className="whitespace-nowrap text-slate-900">{showMoney(item.estimatedValue)}</strong>}
            <Pill tone={STAGE_TONES[item.stageKind]}>{item.stageName}</Pill>
            {scope.ownerEmail === null && <span className="text-xs">de {item.ownerName}</span>}
          </span>
        }
      />
      {item.stageKind === "perdida" && item.lostReason && <p className="mt-1 text-sm text-slate-600">Motivo da perda: {item.lostReason}</p>}

      {/* Where the sale stands is the decision of this screen: one tap moves it. */}
      <ActionForm action={moveOpportunityAction} className="mt-3 flex flex-wrap items-end gap-2">
        {hidden}
        <div className="min-w-40 flex-1">
          <label htmlFor="stageId" className={LABEL}>
            Mover para a etapa
          </label>
          <select id="stageId" name="stageId" defaultValue={item.stageId} key={item.stageId} className={INPUT}>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor="lostReason" className={LABEL}>
            Motivo, se perdeu
          </label>
          <input id="lostReason" name="lostReason" type="text" defaultValue={item.lostReason ?? ""} autoComplete="off" className={INPUT} />
        </div>
        <button type="submit" className={PRIMARY}>
          Mover
        </button>
      </ActionForm>

      <nav aria-label="Partes da oportunidade" className="mt-4 flex gap-2 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={key === "atividades" ? `${HERE}/${item.id}` : `${HERE}/${item.id}?aba=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "atividades" && <Activities />}
      {tab === "dados" && <Data />}
      {tab === "pedido" && <Order />}
    </div>
  );

  async function Activities() {
    const activities = await listActivities(item!.id, conn);
    return (
      <section className="mt-3" aria-label="Atividades">
        <ActionForm action={addActivityAction} className={`${CARD} grid grid-cols-2 gap-2 p-3 sm:grid-cols-[9rem_minmax(0,1fr)_10rem_auto] sm:items-end`}>
          {hidden}
          <div>
            <label htmlFor="kind" className={LABEL}>
              Tipo
            </label>
            <select id="kind" name="kind" defaultValue="tarefa" className={INPUT}>
              {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="order-first col-span-2 sm:order-none sm:col-span-1">
            <label htmlFor="title" className={LABEL}>
              O que fazer, ou o que aconteceu
            </label>
            <input id="title" name="title" type="text" placeholder="Ex.: ligar para confirmar a planta" autoComplete="off" className={INPUT} />
          </div>
          <div>
            <label htmlFor="dueOn" className={LABEL}>
              Para quando
            </label>
            <input id="dueOn" name="dueOn" type="date" className={INPUT} />
          </div>
          <button type="submit" className={`${PRIMARY} col-span-2 sm:col-span-1`}>
            Adicionar
          </button>
        </ActionForm>
        {activities.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">Nada anotado ainda. Registre o próximo passo acima: é ele que aparece no funil e em Tarefas.</p>
        ) : (
          <ul className={`${CARD} mt-3 divide-y divide-slate-200`}>
            {activities.map((activity) => {
              const due = activity.doneAt ? null : dueLabel(activity.dueOn, today);
              return (
                <li key={activity.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <p className="min-w-0 flex-1">
                    <span className={`block leading-snug ${activity.doneAt ? "text-slate-500 line-through" : "font-medium"}`}>{activity.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {ACTIVITY_LABELS[activity.kind]}
                      {due && <Pill tone={due.tone}>{due.text}</Pill>}
                      {activity.doneAt ? <span>feita em {showDateTime(activity.doneAt)}</span> : activity.kind === "nota" ? <span>{showDateTime(activity.createdAt)}</span> : null}
                    </span>
                  </p>
                  <ActionForm action={changeActivityAction} className="flex gap-2">
                    {hidden}
                    <input type="hidden" name="activityId" value={activity.id} />
                    {activity.kind !== "nota" && (
                      <button type="submit" name="what" value={activity.doneAt ? "reabrir" : "concluir"} className={SECONDARY}>
                        {activity.doneAt ? "Reabrir" : "Concluir"}
                      </button>
                    )}
                    <button type="submit" name="what" value="remover" aria-label={`Remover: ${activity.title}`} className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50">
                      Remover
                    </button>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  async function Data() {
    const customers = (await listCustomers(conn)).map((customer) => ({ id: customer.id, name: customer.name }));
    return (
      <section className="mt-3" aria-label="Dados da oportunidade">
        <ActionForm action={saveOpportunityAction} className={`${CARD} p-3 md:p-4`}>
          {hidden}
          <OpportunityFields saved={item} customers={customers} />
          <button type="submit" className={`${PRIMARY} mt-4 w-full sm:w-auto`}>
            Salvar
          </button>
        </ActionForm>
        <p className="mt-2 text-xs text-slate-600">
          Criada em {showDateTime(item!.createdAt)} · atualizada em {showDateTime(item!.updatedAt)}
        </p>
        <ActionForm action={deleteOpportunityAction} className="mt-3">
          {hidden}
          <ConfirmButton label="Excluir oportunidade" confirmLabel="Confirmar: excluir com as atividades" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />
        </ActionForm>
      </section>
    );
  }

  async function Order() {
    // The orders a link may point to: the ones within reach of who is looking.
    const sells = allows(session, "pedidos");
    const orders = sells ? (await listOrders({ sellerEmail: seesAllOrders(session) ? null : session.email }, conn)).slice(0, 60) : [];
    return (
      <section className={`${CARD} mt-3 p-3 md:p-4`} aria-label="Pedido da oportunidade">
        {item!.orderNumber ? (
          <>
            <p>
              Esta oportunidade virou o pedido{" "}
              <Link href={`${menuItem("pedidos").href}/${item!.orderNumber}`} className={QUIET_LINK}>
                #{item!.orderNumber}
              </Link>{" "}
              ({ORDER_STATUS[item!.orderStatus ?? ""] ?? item!.orderStatus}).
            </p>
            <p className="mt-1 text-sm text-slate-600">Quando o pedido é fechado, a oportunidade passa a ganha; quando é perdido ou cancelado, a perdida.</p>
            <ActionForm action={linkOrderAction} className="mt-3">
              {hidden}
              <input type="hidden" name="orderNumber" value="" />
              <ConfirmButton label="Desfazer o vínculo" confirmLabel="Confirmar: desvincular o pedido" className={SECONDARY} />
            </ActionForm>
          </>
        ) : (
          <>
            <p className={SECTION_TITLE}>Virou orçamento?</p>
            <p className="mt-1 text-sm text-slate-600">Abra o pedido e depois vincule-o aqui: a oportunidade passa a seguir o pedido sozinha.</p>
            {sells && (
              <Link href="/pedidos/novo" className={`${PRIMARY} mt-3`}>
                + Novo pedido
              </Link>
            )}
            {orders.length > 0 && (
              <ActionForm action={linkOrderAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
                {hidden}
                <div className="min-w-0 flex-1">
                  <label htmlFor="orderNumber" className={LABEL}>
                    Vincular um pedido que já existe
                  </label>
                  <select id="orderNumber" name="orderNumber" defaultValue="" className={INPUT}>
                    <option value="" disabled>
                      Escolha o pedido
                    </option>
                    {orders.map((order) => (
                      <option key={order.number} value={order.number}>
                        #{order.number} · {order.customerName ?? "sem cliente"} · {ORDER_STATUS[order.status] ?? order.status}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className={SECONDARY}>
                  Vincular
                </button>
              </ActionForm>
            )}
          </>
        )}
      </section>
    );
  }
}

import { cookies } from "next/headers";
import Link from "next/link";
import { CARD, Pager, PageHeader, pageOf, Pill, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listOrdersToProduce, listProductionOrders, listProductionStages } from "@/lib/db/production";
import { isoDate, showDate } from "@/lib/format";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";
import { ActionForm } from "../pedidos/ActionForm";
import { sendToProductionAction } from "./actions";

const ITEM = menuItem("producao");

export const metadata = { title: `${ITEM.label} · ERP` };
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const day = (iso: string) => iso.split("-").reverse().join("/");

export default async function ProducaoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("producao");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  const stages = await listProductionStages(conn);
  const waiting = await listOrdersToProduce(conn);
  // One part at a time: the orders waiting to be sent, or the production orders of one stage.
  const asked = first(query.etapa);
  const stage = stages.find((row) => String(row.id) === asked) ?? null;
  const showWaiting = stage === null && (asked === "pedidos" || (asked === undefined && waiting.length > 0));
  const current = showWaiting ? null : (stage ?? stages.find((row) => row.kind === "andamento" && row.orders > 0) ?? stages[0]);
  const size = rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value);
  const today = isoDate(new Date());
  const inProgress = stages.filter((row) => row.kind === "andamento").reduce((sum, row) => sum + row.orders, 0);
  const chip = (active: boolean) => `inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium ${active ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`;

  return (
    <>
      <PageHeader
        title={ITEM.label}
        hint={`${inProgress} em produção · ${waiting.length} ${waiting.length === 1 ? "pedido esperando" : "pedidos esperando"}`}
        actions={
          <>
            <Link href={`${ITEM.href}/materiais`} className={SECONDARY}>
              Materiais
            </Link>
            <Link href={`${ITEM.href}/horas`} className={SECONDARY}>
              Horas
            </Link>
            {allows(session, "parametros") && (
              <Link href="/parametros/producao" className={SECONDARY}>
                Etapas
              </Link>
            )}
          </>
        }
      />
      <nav aria-label="Etapas da produção" className="mt-3 flex flex-wrap gap-2">
        <Link href={`${ITEM.href}?etapa=pedidos`} aria-current={showWaiting ? "page" : undefined} className={chip(showWaiting)}>
          A enviar · {waiting.length}
        </Link>
        {stages.map((row) => (
          <Link key={row.id} href={`${ITEM.href}?etapa=${row.id}`} aria-current={current?.id === row.id ? "page" : undefined} className={chip(current?.id === row.id)}>
            {row.name} · {row.orders}
          </Link>
        ))}
      </nav>

      {showWaiting ? <Waiting /> : <Stage />}
    </>
  );

  function Waiting() {
    const slice = pageOf(waiting, first(query.pagina), size);
    if (slice.total === 0) return <p className={`${CARD} mt-3 p-4 text-sm text-slate-700`}>Nenhum pedido fechado esperando. Quando um pedido é fechado, ele aparece aqui para ser mandado à produção.</p>;
    return (
      <>
        <ul className="mt-3 flex flex-col gap-2">
          {slice.rows.map((order) => (
            <li key={order.number} className={`${CARD} flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2`}>
              <p className="min-w-0 flex-1">
                <span className="block truncate font-semibold leading-snug">
                  #{order.number} · {order.customer}
                </span>
                <span className="block text-sm text-slate-600">
                  {order.pieces} {order.pieces === 1 ? "peça" : "peças"} em {order.items} {order.items === 1 ? "equipamento" : "equipamentos"} · fechado em {showDate(order.closedAt)}
                </span>
              </p>
              <ActionForm action={sendToProductionAction}>
                <input type="hidden" name="number" value={order.number} />
                <button type="submit" className={SECONDARY}>
                  Mandar para a produção
                </button>
              </ActionForm>
            </li>
          ))}
        </ul>
        <Pager {...slice} noun={["pedido", "pedidos"]} hrefFor={(page) => `${ITEM.href}?etapa=pedidos${page > 1 ? `&pagina=${page}` : ""}`} />
      </>
    );
  }

  async function Stage() {
    if (!current) return null;
    const slice = pageOf(await listProductionOrders(current.id, conn), first(query.pagina), size);
    if (slice.total === 0) return <p className={`${CARD} mt-3 p-4 text-sm text-slate-700`}>Nenhuma ordem em {current.name}.</p>;
    return (
      <>
        <ul className="mt-3 flex flex-col gap-2">
          {slice.rows.map((order) => {
            const late = order.finishedAt === null && order.dueOn !== null && order.dueOn < today;
            return (
              <li key={order.id}>
                <Link href={`${ITEM.href}/${order.id}`} className="flex min-h-[var(--control)] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-brand">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold leading-snug">
                      {order.quantity} × {order.productCode ? `${order.productCode} · ` : ""}
                      {order.productName}
                    </span>
                    <span className="block truncate text-sm text-slate-600">
                      {order.number} · {order.customer}
                    </span>
                  </span>
                  {order.finishedAt ? <Pill tone="good">pronta em {showDate(order.finishedAt)}</Pill> : order.dueOn ? <Pill tone={late ? "bad" : "neutral"}>{late ? "atrasada · " : "para "}{day(order.dueOn)}</Pill> : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <Pager {...slice} noun={["ordem", "ordens"]} hrefFor={(page) => `${ITEM.href}?etapa=${current.id}${page > 1 ? `&pagina=${page}` : ""}`} />
      </>
    );
  }
}

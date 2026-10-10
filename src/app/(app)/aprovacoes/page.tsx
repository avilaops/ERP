import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { approvesAtLoss, menuItem } from "@/lib/auth/permissions";
import { listPastDecisions, listPendingApprovals } from "@/lib/db/approvals";
import { tenantDb } from "@/lib/db/pool";
import { isoDate, showDateTime } from "@/lib/format";
import { BAND_TEXT, REASON_TEXT } from "@/lib/order-form";
import { ordersCount, ordersView } from "@/lib/orders-view";
import { ActionForm } from "../pedidos/ActionForm";
import { decideApprovalAction } from "./actions";

export const metadata = { title: `${menuItem("aprovacoes").label} · ERP` };
export const dynamic = "force-dynamic";

const ORDERS = menuItem("pedidos").href;
const CARD = "rounded-lg border border-slate-200 bg-white";
const BAND_COLORS = {
  "na-meta": "bg-emerald-100 text-emerald-900",
  "abaixo-da-meta": "bg-amber-100 text-amber-900",
  prejuizo: "bg-red-100 text-red-900",
} as const;

export default async function AprovacoesPage() {
  const session = await requirePermission("aprovacoes");
  const conn = tenantDb(session.tenant.slug);

  const pending = await listPendingApprovals(conn);
  const decisions = await listPastDecisions(20, conn);
  const atLoss = approvesAtLoss(session);
  // The same text of the orders list: total from the engine, no cost.
  const { rows } = ordersView(
    pending.map((item) => item.order),
    { tab: "todos", search: "", me: session.email, month: isoDate(new Date()).slice(0, 7) },
  );

  return (
    <>
      <h1 className="text-2xl font-semibold">{menuItem("aprovacoes").label}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {pending.length === 0 ? "Nenhum pedido aguardando aprovação." : `${ordersCount(pending.length)} aguardando decisão.`}
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {pending.map((item, index) => {
          const row = rows[index];
          const blocked = item.directorOnly && !atLoss;
          return (
            <section key={row.number} className={`${CARD} p-5`} aria-label={`Pedido ${row.number}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link href={`${ORDERS}/${row.number}`} className="text-lg font-semibold text-brand underline-offset-2 hover:underline">
                    {row.customer}
                  </Link>
                  <p className="text-xs text-slate-500">{[row.detail, row.document].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Vendedor: {row.seller} · enviado por {item.requestedBy === session.email ? "você" : item.requestedBy} em{" "}
                    {showDateTime(item.requestedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{row.total}</p>
                  <p className="text-sm text-slate-600">desconto de {row.discount}</p>
                  {item.band && (
                    <span className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-medium ${BAND_COLORS[item.band]}`}>
                      {BAND_TEXT[item.band].label}
                    </span>
                  )}
                </div>
              </div>
              <ul className="mt-3 list-disc pl-5 text-sm text-slate-700">
                {item.reasons.map((reason) => (
                  <li key={reason}>{REASON_TEXT[reason]}</li>
                ))}
              </ul>
              {blocked && (
                <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
                  Este pedido passa da sua alçada: só a diretoria pode aprovar. Você pode recusar, com o motivo.
                </p>
              )}
              <ActionForm action={decideApprovalAction} className="mt-4 flex flex-wrap items-end gap-3">
                <input type="hidden" name="number" value={row.number} />
                <div className="min-w-0 flex-1">
                  <label htmlFor={`comment-${row.number}`} className="block text-sm font-medium">
                    Comentário <span className="font-normal text-slate-500">(obrigatório para recusar)</span>
                  </label>
                  <input
                    id={`comment-${row.number}`}
                    name="comment"
                    type="text"
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                {!blocked && (
                  <button type="submit" name="decision" value="aprovar" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
                    Aprovar e fechar
                  </button>
                )}
                <button
                  type="submit"
                  name="decision"
                  value="recusar"
                  className="rounded border border-red-300 bg-white px-4 py-2 font-medium text-red-700 hover:bg-red-50"
                >
                  Recusar
                </button>
              </ActionForm>
            </section>
          );
        })}
      </div>

      {decisions.length > 0 && (
        <section className={`${CARD} mt-8`} aria-labelledby="decididos">
          <h2 id="decididos" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
            Últimas decisões
          </h2>
          <div className="relative overflow-x-auto">
            <table className="stack-sm w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {["Pedido", "Decisão", "Por", "Quando", "Comentário"].map((column) => (
                    <th key={column} scope="col" className="px-4 py-2 text-left font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {decisions.map((decision) => (
                  <tr key={`${decision.number}-${decision.decidedAt.getTime()}`} className="border-t border-slate-200 align-top">
                    <td className="px-4 py-3">
                      <Link href={`${ORDERS}/${decision.number}`} className="font-medium text-brand underline-offset-2 hover:underline">
                        {decision.customerName ?? "sem cliente"}
                      </Link>
                      <span className="block text-xs text-slate-500">#{decision.number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                          decision.approved ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"
                        }`}
                      >
                        {decision.approved ? "Aprovado" : "Recusado"}
                      </span>
                    </td>
                    <td data-label="Por" className="px-4 py-3">{decision.decidedBy === session.email ? "Você" : decision.decidedBy}</td>
                    <td data-label="Em" className="whitespace-nowrap px-4 py-3 text-slate-600">{showDateTime(decision.decidedAt)}</td>
                    <td data-label="Comentário" className="px-4 py-3">{decision.comment ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

import { futureCommission } from "@/lib/db/receivables";
import { roundCents } from "@/lib/pricing/money";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { managesCommissions, menuItem } from "@/lib/auth/permissions";
import { chooseMonth, commissionsView, monthLabel } from "@/lib/commissions-view";
import { listCarriedBalances, listCommissionMonths, listCommissions } from "@/lib/db/commissions";
import { loadCommissionDay } from "@/lib/db/company";
import { tenantDb } from "@/lib/db/pool";
import { isoDate, showDate, showIsoDate, showMoney, showPercent } from "@/lib/format";
import { ActionForm } from "../pedidos/ActionForm";
import { payCommissionsAction } from "./actions";

export const metadata = { title: `${menuItem("comissoes").label} · ERP` };
export const dynamic = "force-dynamic";

const HERE = menuItem("comissoes").href;
const ORDERS = menuItem("pedidos").href;
const CARD = "rounded-lg border border-slate-200 bg-white";
const STATUS = {
  paga: ["Paga", "bg-emerald-100 text-emerald-900"],
  "em-aberto": ["A pagar", "bg-amber-100 text-amber-900"],
  "sem-saldo": ["Sem saldo a pagar", "bg-slate-200 text-slate-800"],
} as const;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ComissoesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("comissoes");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;

  // A seller receives only their own lines from the database; who manages, everyone's.
  const manages = managesCommissions(session.role);
  const scope = manages ? null : session.email;
  const current = isoDate(new Date()).slice(0, 7);
  const months = await listCommissionMonths(scope, conn);
  const month = chooseMonth(first(query.mes), months, current);
  const groups = commissionsView(await listCommissions(month, scope, conn), await listCarriedBalances(month, scope, conn));
  const paymentDay = await loadCommissionDay(conn);
  // The four numbers of the month, for who is looking: a seller's are only their own.
  const entries = groups.flatMap((group) => group.entries);
  const totals = {
    received: roundCents(entries.filter((entry) => !entry.refund).reduce((sum, entry) => sum + entry.base, 0)),
    month: roundCents(groups.reduce((sum, group) => sum + group.total, 0)),
    payable: roundCents(groups.reduce((sum, group) => sum + group.payable, 0)),
    future: await futureCommission(scope, conn),
  };
  const sellers = groups.length;
  const shown = months.includes(current) ? months : [current, ...months];

  return (
    <>
      <h1 className="text-2xl font-semibold">{manages ? menuItem("comissoes").label : "Minhas comissões"}</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        A comissão nasce quando o valor é recebido, sobre a parte sem IPI. O que entra num mês é pago no dia {paymentDay} do mês
        seguinte. Estorno devolve a comissão e desconta do próximo pagamento.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {(
          [
            ["Recebido de clientes", showMoney(totals.received), `${monthLabel(month)} · sem IPI`],
            ["Comissão do mês", showMoney(totals.month), manages ? `${sellers} ${sellers === 1 ? "vendedor" : "vendedores"}` : "sua comissão"],
            ["Falta pagar", showMoney(totals.payable), "com o que ficou de meses anteriores"],
            ["Comissão futura", showMoney(totals.future), "do que ainda não foi recebido"],
          ] as const
        ).map(([label, value, note]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white p-4">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
            <dd className="mt-1 text-2xl font-bold">{value}</dd>
            <dd className="text-xs text-slate-600">{note}</dd>
          </div>
        ))}
      </dl>

      <nav aria-label="Mês" className="mt-6 flex flex-wrap gap-2 text-sm">
        {shown.map((item) => (
          <Link
            key={item}
            href={item === current ? HERE : `${HERE}?mes=${item}`}
            aria-current={item === month ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 font-medium ${item === month ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
          >
            {monthLabel(item)}
          </Link>
        ))}
      </nav>

      {groups.length === 0 && (
        <p className={`${CARD} mt-6 p-6 text-sm text-slate-600`}>
          Nenhuma comissão em {monthLabel(month)}. Ela aparece aqui quando o financeiro dá baixa num recebimento.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {groups.map((group) => {
          const [label, color] = STATUS[group.status];
          return (
            <section key={group.sellerEmail} className={CARD} aria-label={`Comissões de ${group.sellerName}`}>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold">{group.sellerEmail === session.email ? "Você" : group.sellerName}</h2>
                  <p className="text-xs text-slate-500">{group.sellerEmail}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{showMoney(group.total)}</p>
                  <span className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-medium ${color}`}>{label}</span>
                </div>
              </div>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {["Pedido", "Quando", "Pagar em"].map((column) => (
                        <th key={column} scope="col" className="px-4 py-2 text-left font-semibold">
                          {column}
                        </th>
                      ))}
                      {["Base sem IPI", "%", "Comissão"].map((column) => (
                        <th key={column} scope="col" className="px-4 py-2 text-right font-semibold">
                          {column}
                        </th>
                      ))}
                      <th scope="col" className="px-4 py-2 text-left font-semibold">
                        Situação
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map((entry, index) => (
                      <tr key={index} className="border-t border-slate-200">
                        <td className="px-4 py-3">
                          <Link href={`${ORDERS}/${entry.orderNumber}`} className="font-medium text-brand underline-offset-2 hover:underline">
                            {entry.customerName ?? "sem cliente"}
                          </Link>
                          <span className="block text-xs text-slate-500">
                            #{entry.orderNumber}
                            {entry.refund ? " · estorno" : ""}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">{showIsoDate(entry.happenedOn)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{showIsoDate(entry.paymentDue)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">{showMoney(entry.base)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">{showPercent(entry.rate)}</td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${entry.amount < 0 ? "text-red-700" : ""}`}>
                          {showMoney(entry.amount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{entry.paidAt ? `paga em ${showDate(entry.paidAt)}` : "em aberto"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {group.status !== "paga" && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm">
                  <p className="text-slate-700">
                    Em aberto no mês: <strong>{showMoney(group.open)}</strong>
                    {group.carried !== 0 && (
                      <>
                        {" "}
                        · de meses anteriores: <strong className={group.carried < 0 ? "text-red-700" : ""}>{showMoney(group.carried)}</strong>
                      </>
                    )}{" "}
                    · a pagar: <strong>{showMoney(group.payable)}</strong>
                  </p>
                  {manages && group.status === "em-aberto" && (
                    <ActionForm action={payCommissionsAction}>
                      <input type="hidden" name="seller" value={group.sellerEmail} />
                      <input type="hidden" name="month" value={month} />
                      <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
                        Marcar {showMoney(group.payable)} como paga
                      </button>
                    </ActionForm>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

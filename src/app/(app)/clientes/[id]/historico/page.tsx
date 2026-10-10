import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, Pager, PageHeader, pageOf, Pill, QUIET_LINK } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { customerTimeline, TIMELINE_KINDS } from "@/lib/db/customer-timeline";
import type { TimelineKind } from "@/lib/db/customer-timeline";
import { getCustomer } from "@/lib/db/customers";
import { tenantDb } from "@/lib/db/pool";
import { showDateTime, showMoney } from "@/lib/format";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";

export const metadata = { title: "Histórico do cliente · ERP" };
export const dynamic = "force-dynamic";

const TONE: Record<TimelineKind, "good" | "warn" | "bad" | "neutral"> = { pedido: "good", contrato: "neutral", nota: "neutral", recebimento: "good", oportunidade: "warn", atividade: "neutral", email: "neutral", reuniao: "warn" };

export default async function HistoricoDoClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const session = await requirePermission("clientes", `/clientes/${id}/historico`);
  const conn = tenantDb(session.tenant.slug);
  const customer = /^[1-9]\d{0,8}$/.test(id) ? await getCustomer(Number(id), conn) : null;
  if (!customer) notFound();
  const everything = seesAllOrders(session);
  const entries = await customerTimeline(customer.id, { sellerEmail: everything ? null : session.email, receipts: allows(session, "recebimentos") }, conn);
  const asked = (await searchParams).pagina;
  const slice = pageOf(entries, Array.isArray(asked) ? asked[0] : asked, rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value));
  const here = `${menuItem("clientes").href}/${customer.id}`;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={here} className={QUIET_LINK}>
          ← {customer.tradeName ?? customer.name}
        </Link>
      </p>
      <PageHeader title="Histórico" hint={everything ? "Pedidos, contratos, notas e o que foi feito no funil com este cliente." : "Os seus pedidos e as suas oportunidades com este cliente."} />
      {slice.total === 0 ? (
        <p className={`${CARD} mt-3 p-4 text-sm text-slate-700`}>Nada registrado ainda com este cliente.</p>
      ) : (
        <>
          <ol className="mt-3 flex flex-col gap-2">
            {slice.rows.map((entry, index) => {
              const href = entry.orderNumber && allows(session, "pedidos") ? `${menuItem("pedidos").href}/${entry.orderNumber}` : entry.opportunityId && allows(session, "funil") ? `${menuItem("funil").href}/${entry.opportunityId}` : null;
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-snug">{entry.title}</span>
                    <span className="block truncate text-sm text-slate-600">
                      {showDateTime(entry.at)}
                      {entry.amount !== null ? ` · ${showMoney(entry.amount)}` : ""}
                      {entry.detail ? ` · ${entry.detail}` : ""}
                    </span>
                  </span>
                  <Pill tone={TONE[entry.kind]}>{TIMELINE_KINDS[entry.kind]}</Pill>
                </>
              );
              const frame = "flex min-h-[var(--control)] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2";
              return (
                <li key={`${slice.from}-${index}`}>
                  {href ? (
                    <Link href={href} className={`${frame} hover:border-brand`}>
                      {body}
                    </Link>
                  ) : (
                    <div className={frame}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
          <Pager {...slice} noun={["registro", "registros"]} hrefFor={(page) => `${here}/historico${page > 1 ? `?pagina=${page}` : ""}`} />
        </>
      )}
    </div>
  );
}

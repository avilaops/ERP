import { cookies } from "next/headers";
import Link from "next/link";
import { CARD, Pager, PageHeader, pageOf, Pill, QUIET_LINK } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listConversations, loadWhatsappInfo } from "@/lib/db/whatsapp";
import { showDateTime } from "@/lib/format";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";

export const metadata = { title: "Conversas · ERP" };
export const dynamic = "force-dynamic";

const HERE = "/funil/conversas";

export default async function ConversasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("funil", HERE);
  const conn = tenantDb(session.tenant.slug);
  const everyone = seesAllOrders(session);
  const account = await loadWhatsappInfo(conn);
  const asked = (await searchParams).pagina;
  const slice = pageOf(await listConversations({ ownerEmail: everyone ? null : session.email }, conn), Array.isArray(asked) ? asked[0] : asked, rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value));

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("funil").href} className={QUIET_LINK}>
          ← {menuItem("funil").label}
        </Link>
      </p>
      <PageHeader title="Conversas" hint={everyone ? "WhatsApp da empresa: as conversas de toda a equipe e os números que ainda não são de nenhuma oportunidade." : "As conversas de WhatsApp das suas oportunidades."} />
      {!account && <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">A conta de WhatsApp da empresa ainda não foi cadastrada (Parâmetros → WhatsApp).</p>}
      {slice.total === 0 ? (
        <p className={`${CARD} mt-3 p-4 text-sm text-slate-700`}>Nenhuma conversa ainda.</p>
      ) : (
        <>
          <ul className="mt-3 flex flex-col gap-2">
            {slice.rows.map((conversation) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold leading-snug">{conversation.opportunityTitle ?? conversation.name ?? `+${conversation.contact}`}</span>
                    <span className="block truncate text-sm text-slate-600">{conversation.last}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {showDateTime(conversation.lastAt)} · {conversation.name ?? `+${conversation.contact}`}
                      {everyone && conversation.ownerName ? ` · de ${conversation.ownerName}` : ""}
                    </span>
                  </span>
                  {conversation.opportunityId === null ? <Pill tone="neutral">sem oportunidade</Pill> : conversation.waiting ? <Pill tone="warn">responder</Pill> : null}
                </>
              );
              const frame = "flex min-h-[var(--control)] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2";
              return (
                <li key={conversation.contact}>
                  {conversation.opportunityId !== null ? (
                    <Link href={`/funil/${conversation.opportunityId}/whatsapp`} className={`${frame} hover:border-brand`}>
                      {body}
                    </Link>
                  ) : (
                    // A number of nobody yet: creating the opportunity with this phone ties the conversation to it.
                    <Link href={`/funil/nova?telefone=${conversation.contact.replace(/^55/, "")}`} className={`${frame} hover:border-brand`}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          <Pager {...slice} noun={["conversa", "conversas"]} hrefFor={(page) => `${HERE}${page > 1 ? `?pagina=${page}` : ""}`} />
        </>
      )}
    </div>
  );
}

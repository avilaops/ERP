import Link from "next/link";
import { cookies } from "next/headers";
import { FitRows } from "@/components/FitRows";
import { CARD, INPUT, Pager, PageHeader, pageOf, Pill, PRIMARY, QUIET_LINK, SECONDARY, SECTION_TITLE } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { runAutomations } from "@/lib/db/automations";
import { listOpportunities, listPendingActivities, listStages, opportunityParty, syncOpportunitiesWithOrders } from "@/lib/db/funnel";
import type { Opportunity } from "@/lib/db/funnel";
import { tenantDb } from "@/lib/db/pool";
import { loadWhatsappInfo } from "@/lib/db/whatsapp";
import { isoDate, showMoney } from "@/lib/format";
import { byStage, dueLabel, matchesOpportunity } from "@/lib/funnel-view";
import { rowsPerPage, ROWS_COOKIE } from "@/lib/rows";

const ITEM = menuItem("funil");

export const metadata = { title: `${ITEM.label} · ERP` };
export const dynamic = "force-dynamic";

/** How many cards a column of the board shows before "ver todas": what fits a screen without the page growing. */
const BOARD_CARDS = 4;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function FunilPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  // A seller follows their own sales; who sees the team's orders sees the team's funnel. The scope comes from the session.
  const everyone = seesAllOrders(session);
  const scope = { ownerEmail: everyone ? null : session.email };

  await syncOpportunitiesWithOrders(conn);
  const conversations = (await loadWhatsappInfo(conn)) !== null;
  const today = isoDate(new Date());
  // The reminders the rules of the company ask for are created when the funnel is opened.
  await runAutomations(today, conn);
  const stages = await listStages(conn);
  const search = (first(query.q) ?? "").trim();
  const opportunities = (await listOpportunities(scope, conn)).filter((item) => matchesOpportunity(item, search));
  const columns = byStage(stages, opportunities);
  const pending = (await listPendingActivities(scope, conn)).length;

  // One stage at a time is the view of a phone, and of a wide screen when a stage is asked for.
  const asked = Number(first(query.etapa));
  const listing = columns.find((column) => column.stage.id === asked) ?? null;
  const shown = listing ?? columns[0];
  const size = rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value);
  const slice = pageOf(shown?.items ?? [], first(query.p), size);
  const hrefOf = (params: Record<string, string | undefined>) => {
    const built = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return built.size === 0 ? ITEM.href : `${ITEM.href}?${built}`;
  };
  const open = columns.filter((column) => column.stage.kind === "aberta");
  const openTotal = open.reduce((sum, column) => sum + column.total, 0);
  const openCount = open.reduce((sum, column) => sum + column.items.length, 0);

  const card = (item: Opportunity) => {
    const due = dueLabel(item.nextDue, today);
    return (
      <Link href={`${ITEM.href}/${item.id}`} className="block rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-brand">
        <span className="block font-medium leading-snug">{item.title}</span>
        <span className="block text-sm text-slate-600">{opportunityParty(item)}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {item.estimatedValue !== null && <span className="whitespace-nowrap font-semibold">{showMoney(item.estimatedValue)}</span>}
          {due && <Pill tone={due.tone}>{due.text}</Pill>}
          {everyone && <span className="text-xs text-slate-500">{item.ownerName}</span>}
        </span>
      </Link>
    );
  };

  return (
    <>
      <PageHeader
        title={ITEM.label}
        hint={
          <>
            {openCount} em andamento · {showMoney(openTotal)}
            {conversations && (
              <>
                {" · "}
                <Link href={`${ITEM.href}/conversas`} className={`${QUIET_LINK} md:hidden`}>
                  Conversas
                </Link>
              </>
            )}
            {everyone && (
              <>
                <span className="max-md:hidden"> · equipe toda</span>
                {" · "}
                <Link href={`${ITEM.href}/campanhas`} className={`${QUIET_LINK} md:hidden`}>
                  Campanhas
                </Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <Link href={`${ITEM.href}/painel`} className={SECONDARY}>
              Painel
            </Link>
            {everyone && (
              <Link href={`${ITEM.href}/campanhas`} className={`${SECONDARY} max-md:hidden`}>
                Campanhas
              </Link>
            )}
            {conversations && (
              <Link href={`${ITEM.href}/conversas`} className={`${SECONDARY} max-md:hidden`}>
                Conversas
              </Link>
            )}
            <Link href={`${ITEM.href}/tarefas`} className={SECONDARY}>
              Tarefas{pending > 0 ? ` (${pending})` : ""}
            </Link>
            <Link href={`${ITEM.href}/nova`} aria-label="Nova oportunidade" className={PRIMARY}>
              + <span className="max-[400px]:hidden">Oportunidade</span>
              <span className="min-[401px]:hidden">Nova</span>
            </Link>
          </>
        }
      />

      <form method="get" action={ITEM.href} role="search" className="mt-3 flex items-end gap-2">
        {listing && <input type="hidden" name="etapa" value={listing.stage.id} />}
        <label className="min-w-0 flex-1 text-sm font-medium text-slate-700 md:max-w-md">
          Buscar no funil
          <input type="search" name="q" defaultValue={search} placeholder="Venda, empresa, contato ou vendedor" className={INPUT} />
        </label>
        <button type="submit" className={SECONDARY}>
          Buscar
        </button>
      </form>

      {/* The stages, as the way from one to the other: on a phone they are the navigation; on a wide screen, the way back from a list to the board. */}
      <nav aria-label="Etapas do funil" className={`mt-3 flex flex-wrap gap-2 ${listing ? "" : "md:hidden"}`}>
        {listing && (
          <Link href={hrefOf({ q: search })} className="hidden min-h-9 items-center rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 md:inline-flex">
            ← Quadro
          </Link>
        )}
        {columns.map((column) => (
          <Link
            key={column.stage.id}
            href={hrefOf({ etapa: String(column.stage.id), q: search })}
            aria-current={column.stage.id === shown?.stage.id ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium ${
              column.stage.id === shown?.stage.id ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {column.stage.name} · {column.items.length}
          </Link>
        ))}
      </nav>

      {/* The board: every open stage side by side, a few cards each. Only on a wide screen, and only while no stage is asked for. */}
      {!listing && (
        <div className="mt-3 hidden gap-3 md:grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, open.length)}, minmax(0, 1fr))` }}>
          {open.map((column) => (
            <section key={column.stage.id} aria-labelledby={`etapa-${column.stage.id}`} className="min-w-0 rounded-lg bg-slate-100 p-2">
              <h2 id={`etapa-${column.stage.id}`} className={`${SECTION_TITLE} flex items-baseline justify-between gap-2 px-1 pb-2`}>
                <span>
                  {column.stage.name} · {column.items.length}
                </span>
                <span className="whitespace-nowrap normal-case tracking-normal">{showMoney(column.total)}</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {column.items.slice(0, BOARD_CARDS).map((item) => (
                  <li key={item.id}>{card(item)}</li>
                ))}
              </ul>
              {column.items.length === 0 && <p className="px-1 py-2 text-sm text-slate-500">Nenhuma oportunidade nesta etapa.</p>}
              {column.items.length > BOARD_CARDS && (
                <Link href={hrefOf({ etapa: String(column.stage.id), q: search })} className={`${QUIET_LINK} mt-2 block px-1 text-sm`}>
                  Ver todas as {column.items.length}
                </Link>
              )}
            </section>
          ))}
        </div>
      )}
      {!listing && (
        <p className="mt-3 hidden flex-wrap gap-x-4 gap-y-1 text-sm md:flex">
          {columns
            .filter((column) => column.stage.kind !== "aberta")
            .map((column) => (
              <Link key={column.stage.id} href={hrefOf({ etapa: String(column.stage.id), q: search })} className={QUIET_LINK}>
                {column.stage.name}: {column.items.length} · {showMoney(column.total)}
              </Link>
            ))}
        </p>
      )}

      {/* One stage as a list. */}
      {shown && (
        <section className={`${CARD} mt-3 ${listing ? "" : "md:hidden"}`} aria-label={`Oportunidades em ${shown.stage.name}`}>
          <p className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
            <span className={SECTION_TITLE}>{shown.stage.name}</span>
            <span className="whitespace-nowrap font-semibold">{showMoney(shown.total)}</span>
          </p>
          {shown.items.length === 0 ? (
            <p className="border-t border-slate-200 p-4 text-sm text-slate-600">
              {search ? `Nenhuma oportunidade com "${search}" nesta etapa.` : "Nenhuma oportunidade nesta etapa."}{" "}
              <Link href={`${ITEM.href}/nova`} className={QUIET_LINK}>
                Criar uma
              </Link>
            </p>
          ) : (
            <>
              <ul id="oportunidades" className="border-t border-slate-200">
                {slice.rows.map((item) => (
                  <li key={item.id} data-row className="border-b border-slate-200 p-1.5 last:border-b-0">
                    {card(item)}
                  </li>
                ))}
              </ul>
              <Pager {...slice} noun={["oportunidade", "oportunidades"]} hrefFor={(page) => hrefOf({ etapa: String(shown.stage.id), q: search, p: page > 1 ? String(page) : undefined })} />
              <FitRows listId="oportunidades" shown={size} />
            </>
          )}
        </section>
      )}
    </>
  );
}

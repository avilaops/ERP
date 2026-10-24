import Link from "next/link";
import { cookies } from "next/headers";
import { FitRows } from "@/components/FitRows";
import { CARD, EmptyState, PageHeader, Pager, pageOf, PRIMARY, SECONDARY, ViewTabs } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { MENU_ITEMS, menuItem } from "@/lib/auth/permissions";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { sellersView } from "@/lib/dashboard-view";
import { listDashboardOrders } from "@/lib/db/dashboard";
import { tenantDb } from "@/lib/db/pool";
import { listUsers } from "@/lib/db/users";
import { showMoney } from "@/lib/format";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";
import { ROLE_NOTES } from "./PersonFields";

export const metadata = { title: `${menuItem("equipe").label} · ERP` };
export const dynamic = "force-dynamic";

const TITLE = "text-sm font-semibold uppercase tracking-wide";
const HERE = menuItem("equipe").href;

export default async function EquipePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  const users = await listUsers(conn);
  const selling = sellersView(await listDashboardOrders({ sellerEmail: null }, conn));
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const view = first(query.ver) === "vendas" ? "vendas" : "pessoas";
  const size = rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value, 1);
  const peopleSlice = pageOf(users, first(query.pagina), size);
  const sellingSlice = pageOf(selling, first(query.pagina), size);

  const NEW = `${HERE}/nova`;
  if (users.length === 0 && selling.length === 0) {
    // Nobody yet: the screen says what it is for and offers the one thing to do.
    return (
      <>
        <PageHeader title={menuItem("equipe").label} hint={`Quem entra em ${session.tenant.name} e o que cada pessoa pode ver e fazer.`} />
        <div className={`${CARD} mt-4`}>
          <EmptyState title="Nenhuma pessoa cadastrada" description="Convide a primeira pessoa e escolha o perfil de acesso." action={<Link href={NEW} className={PRIMARY}>Convidar pessoa</Link>} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={menuItem("equipe").label}
        hint={`Quem entra em ${session.tenant.name}, o que cada tipo de acesso vê e quem está vendendo.`}
        actions={<><Link href={`${menuItem("equipe").href}/perfis`} className={SECONDARY}>Perfis da empresa</Link><Link href={NEW} className={PRIMARY}>Convidar pessoa</Link></>}
      />
      <ViewTabs label="Visão da equipe" items={[
        { href: HERE, label: `Pessoas (${users.length})`, current: view === "pessoas" },
        { href: `${HERE}?ver=vendas`, label: `Quem está vendendo (${selling.length})`, current: view === "vendas" },
      ]} />

      {view === "pessoas" && <section className={`${CARD} mt-3`} aria-labelledby="pessoas">
        <h2 id="pessoas" className={`${TITLE} border-b border-slate-200 px-5 py-3`}>
          Pessoas ({users.length})
        </h2>
        {users.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Ninguém cadastrado ainda. Toque em “Convidar pessoa”.</p>
        ) : (
          <ul id="pessoas-lista">
            {peopleSlice.rows.map((user) => (
              <li key={user.id} data-row className="border-t border-slate-200 first:border-t-0">
                <Link href={`${menuItem("equipe").href}/${user.id}`} className="flex items-center justify-between gap-3 px-5 py-3 active:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block break-words font-medium">
                      {user.name}
                      {user.email === session.email ? " (você)" : ""}
                    </span>
                    <span className="block break-words text-xs text-slate-500">{user.email}</span>
                    {user.active && user.invite && user.email !== session.email && (
                      <span className={`block break-words text-xs ${user.invite.status === "enviado" ? "text-emerald-800" : "text-amber-900"}`}>
                        {user.invite.status === "enviado" ? "Convite enviado por e-mail" : user.invite.status === "falhou" ? "O convite por e-mail não saiu" : "Convite por e-mail não enviado"}
                      </span>
                    )}
                  </span>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${user.active ? "bg-brand-soft text-brand" : "bg-slate-200 text-slate-600"}`}>
                    {user.active ? `${user.profileName ?? ROLE_LABELS[user.role]}${user.items ? ` · ${user.items.length} telas` : ""}` : "Sem acesso"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pager {...peopleSlice} noun={["pessoa", "pessoas"]} hrefFor={(page) => page > 1 ? `${HERE}?pagina=${page}` : HERE} />
        {users.length > 0 && <FitRows listId="pessoas-lista" shown={size} minimum={1} />}
      </section>}

      {view === "pessoas" && <details className={`${CARD} mt-3`}>
        <summary className={`${TITLE} cursor-pointer px-5 py-3`}>O que cada tipo de acesso vê</summary>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-slate-200 p-5 md:grid-cols-2">
          {ROLES.map((role) => (
            <div key={role}>
              <h3 className="font-semibold">{ROLE_LABELS[role]}</h3>
              <p className="mt-1 text-sm text-slate-700">{ROLE_NOTES[role]}</p>
              <p className="mt-1 text-xs text-slate-500">
                Abre: {MENU_ITEMS.filter((item) => item.roles.includes(role)).map((item) => item.label).join(", ")}.
              </p>
            </div>
          ))}
        </div>
      </details>}

      {view === "vendas" && <section className={`${CARD} mt-3`} aria-labelledby="vendendo">
        <h2 id="vendendo" className={`${TITLE} border-b border-slate-200 px-5 py-3`}>
          Quem está vendendo
        </h2>
        {selling.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nenhum pedido ainda.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table id="vendedores-lista" className="stack-sm w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-semibold">
                    Pessoa
                  </th>
                  {["Pedidos", "Em aberto", "Fechados", "Fechado c/ IPI"].map((column) => (
                    <th key={column} scope="col" className="whitespace-nowrap px-4 py-2 text-right font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sellingSlice.rows.map((row) => (
                  <tr key={row.sellerEmail} data-row className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      {row.sellerName}
                      <span className="block text-xs text-slate-500">{row.sellerEmail}</span>
                    </td>
                    <td data-label="Pedidos" className="px-4 py-3 text-right">{row.orders}</td>
                    <td data-label="Em aberto" className="px-4 py-3 text-right">{row.open}</td>
                    <td data-label="Fechados" className="px-4 py-3 text-right">{row.closed}</td>
                    <td data-label="Total fechado" className="whitespace-nowrap px-4 py-3 text-right font-semibold">{showMoney(row.closedTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...sellingSlice} noun={["vendedor", "vendedores"]} hrefFor={(page) => `${HERE}?ver=vendas${page > 1 ? `&pagina=${page}` : ""}`} />
        {selling.length > 0 && <FitRows listId="vendedores-lista" shown={size} minimum={1} />}
      </section>}

    </>
  );
}

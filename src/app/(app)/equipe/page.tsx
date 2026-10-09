import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { MENU_ITEMS, menuItem } from "@/lib/auth/permissions";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { sellersView } from "@/lib/dashboard-view";
import { listDashboardOrders } from "@/lib/db/dashboard";
import { tenantDb } from "@/lib/db/pool";
import { listUsers } from "@/lib/db/users";
import { showMoney } from "@/lib/format";
import { ROLE_NOTES } from "./PersonFields";

export const metadata = { title: `${menuItem("equipe").label} · ERP` };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const TITLE = "text-sm font-semibold uppercase tracking-wide";

export default async function EquipePage() {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  const users = await listUsers(conn);
  const selling = sellersView(await listDashboardOrders({ sellerEmail: null }, conn));

  const NEW = `${menuItem("equipe").href}/nova`;
  if (users.length === 0 && selling.length === 0) {
    // Nobody yet: the screen says what it is for and offers the one thing to do.
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col">
        <h1 className="text-2xl font-semibold">{menuItem("equipe").label}</h1>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-xl font-semibold">Ainda não há pessoas cadastradas</p>
          <p className="mt-2 text-slate-600">Aqui você convida quem trabalha em {session.tenant.name} e escolhe o que cada pessoa pode ver e fazer.</p>
        </div>
        <Link href={NEW} className="rounded-lg bg-brand px-4 py-3.5 text-center text-base font-semibold text-white hover:bg-brand-dark">
          Convidar pessoa
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{menuItem("equipe").label}</h1>
          <p className="mt-1 text-slate-600">Quem entra em {session.tenant.name}, o que cada tipo de acesso vê e quem está vendendo.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link href={`${menuItem("equipe").href}/perfis`} className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-center font-semibold hover:bg-slate-50">
            Perfis da empresa
          </Link>
          <Link href={NEW} className="rounded-lg bg-brand px-4 py-3 text-center font-semibold text-white hover:bg-brand-dark">
            Convidar pessoa
          </Link>
        </div>
      </div>

      <section className={`${CARD} mt-6`} aria-labelledby="pessoas">
        <h2 id="pessoas" className={`${TITLE} border-b border-slate-200 px-5 py-3`}>
          Pessoas ({users.length})
        </h2>
        {users.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Ninguém cadastrado ainda. Toque em “Convidar pessoa”.</p>
        ) : (
          <ul>
            {users.map((user) => (
              <li key={user.id} className="border-t border-slate-200 first:border-t-0">
                <Link href={`${menuItem("equipe").href}/${user.id}`} className="flex items-center justify-between gap-3 px-5 py-3 active:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {user.name}
                      {user.email === session.email ? " (você)" : ""}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{user.email}</span>
                    {user.active && user.invite && user.email !== session.email && (
                      <span className={`block truncate text-xs ${user.invite.status === "enviado" ? "text-emerald-800" : "text-amber-900"}`}>
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
      </section>

      <details className={`${CARD} mt-6`}>
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
      </details>

      <section className={`${CARD} mt-6`} aria-labelledby="vendendo">
        <h2 id="vendendo" className={`${TITLE} border-b border-slate-200 px-5 py-3`}>
          Quem está vendendo
        </h2>
        {selling.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nenhum pedido ainda.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
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
                {selling.map((row) => (
                  <tr key={row.sellerEmail} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      {row.sellerName}
                      <span className="block text-xs text-slate-500">{row.sellerEmail}</span>
                    </td>
                    <td className="px-4 py-3 text-right">{row.orders}</td>
                    <td className="px-4 py-3 text-right">{row.open}</td>
                    <td className="px-4 py-3 text-right">{row.closed}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{showMoney(row.closedTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </>
  );
}

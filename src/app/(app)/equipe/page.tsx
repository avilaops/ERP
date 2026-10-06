import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { MENU_ITEMS, menuItem } from "@/lib/auth/permissions";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { sellersView } from "@/lib/dashboard-view";
import { listDashboardOrders } from "@/lib/db/dashboard";
import { tenantDb } from "@/lib/db/pool";
import { listUsers } from "@/lib/db/users";
import { showMoney } from "@/lib/format";

export const metadata = { title: `${menuItem("equipe").label} · ERP` };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const TITLE = "text-sm font-semibold uppercase tracking-wide";

/** What each profile is for, in the words of the screen. What it opens comes from the permissions themselves. */
const ROLE_NOTES = {
  DIRETORIA: "Vê custo, lucro e meta. Define parâmetros, publica a tabela, cadastra a equipe e aprova qualquer pedido.",
  GERENTE_COMERCIAL: "Vê os pedidos de toda a equipe e aprova os que ainda dão lucro. Não vê custo nem a meta de lucro.",
  VENDEDOR: "Monta pedidos com a tabela publicada e vê só os próprios pedidos e as próprias comissões.",
  FINANCEIRO: "Dá baixa nos recebimentos, cuida das contas a pagar e dos fornecedores e marca as comissões como pagas.",
} as const;

export default async function EquipePage() {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  const users = await listUsers(conn);
  const selling = sellersView(await listDashboardOrders({ sellerEmail: null }, conn));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{menuItem("equipe").label}</h1>
          <p className="mt-1 text-slate-600">Quem entra em {session.tenant.name}, o que cada perfil vê e quem está vendendo.</p>
        </div>
        <Link href="/parametros/usuarios" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
          Cadastrar ou alterar pessoas
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        {ROLES.map((role) => {
          const people = users.filter((user) => user.role === role && user.active);
          return (
            <section key={role} className={`${CARD} p-5`} aria-label={ROLE_LABELS[role]}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{ROLE_LABELS[role]}</h2>
                <span className="text-xs text-slate-600">
                  {people.length} {people.length === 1 ? "pessoa" : "pessoas"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-700">{ROLE_NOTES[role]}</p>
              <p className="mt-3 text-xs text-slate-500">
                Abre: {MENU_ITEMS.filter((item) => item.roles.includes(role)).map((item) => item.label).join(", ")}.
              </p>
              {people.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 text-sm">
                  {people.map((user) => (
                    <li key={user.id} className="truncate">
                      {user.name} <span className="text-slate-500">· {user.email}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

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

      <p className="mt-4 text-sm text-slate-600">
        A pessoa entra pelo login da Ávila Ops com o e-mail cadastrado. Para tirar o acesso, desmarque “Pode entrar” no cadastro.
      </p>
    </>
  );
}

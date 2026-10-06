import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { tenantDb } from "@/lib/db/pool";
import { listUsers } from "@/lib/db/users";
import { showDateTime } from "@/lib/format";
import { ActionForm } from "../../pedidos/ActionForm";
import { createUserAction, updateUserAction } from "./actions";

export const metadata = { title: "Usuários · ERP" };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";
const PRIMARY = "rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark";

export default async function UsuariosPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const users = await listUsers(conn);

  return (
    <>
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className="text-brand underline">
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Usuários de {session.tenant.name}</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        Quem está aqui entra no sistema com o perfil escolhido. A pessoa entra pelo login da Ávila Ops, com este mesmo e-mail; a
        senha é dela e não fica neste sistema.
      </p>

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="novo">
        <h2 id="novo" className="text-sm font-semibold uppercase tracking-wide">
          Adicionar pessoa
        </h2>
        <ActionForm action={createUserAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="new-name" className="block text-sm font-medium">
              Nome
            </label>
            <input id="new-name" name="name" type="text" autoComplete="off" className={`${INPUT} mt-1 w-full`} />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="new-email" className="block text-sm font-medium">
              E-mail
            </label>
            <input id="new-email" name="email" type="email" autoComplete="off" className={`${INPUT} mt-1 w-full`} />
          </div>
          <div>
            <label htmlFor="new-role" className="block text-sm font-medium">
              Perfil
            </label>
            <select id="new-role" name="role" defaultValue="VENDEDOR" className={`${INPUT} mt-1`}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          <input type="hidden" name="active" value="sim" />
          <button type="submit" className={PRIMARY}>
            Adicionar
          </button>
        </ActionForm>
      </section>

      <section className={`${CARD} mt-6`} aria-labelledby="lista">
        <h2 id="lista" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Pessoas cadastradas ({users.length})
        </h2>
        {users.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Ninguém cadastrado ainda. Adicione a equipe acima.</p>
        ) : (
          <ul>
            {users.map((user) => (
              <li key={user.id} className="border-t border-slate-200 px-5 py-4 first:border-t-0">
                <ActionForm action={updateUserAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={user.id} />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`name-${user.id}`} className="block text-xs font-medium text-slate-600">
                      Nome
                    </label>
                    <input
                      key={user.name}
                      id={`name-${user.id}`}
                      name="name"
                      type="text"
                      defaultValue={user.name}
                      className={`${INPUT} mt-1 w-full`}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {user.email}
                      {user.email === session.email ? " · você" : ""} · alterado em {showDateTime(user.updatedAt)}
                    </p>
                  </div>
                  <div>
                    <label htmlFor={`role-${user.id}`} className="block text-xs font-medium text-slate-600">
                      Perfil
                    </label>
                    <select key={user.role} id={`role-${user.id}`} name="role" defaultValue={user.role} className={`${INPUT} mt-1`}>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input key={String(user.active)} type="checkbox" name="active" value="sim" defaultChecked={user.active} /> Pode entrar
                  </label>
                  <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                    Salvar
                  </button>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

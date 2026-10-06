import Link from "next/link";
import type { Session } from "@/lib/auth";
import { localProvider } from "@/lib/auth/local-provider";
import { canAccess, menuFor } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { SSO_APP_ID, SSO_LOGOUT_URL } from "@/lib/auth/sso";
import { loadLogoVersion } from "@/lib/db/company";
import { tenantDb } from "@/lib/db/pool";

/** Server component: the menu is computed from the server-side session only. */
export async function Sidebar({ session }: { session: Session }) {
  const items = menuFor(session.role);
  const logoVersion = await loadLogoVersion(tenantDb(session.tenant.slug));
  const localLogin = localProvider(process.env).available;

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 border-r border-slate-200 bg-white p-4">
      {/* The company of the session: its logo, when the directors sent one, or its name. */}
      {logoVersion ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by the app itself, per company
        <img
          src={`/empresa/logo?v=${logoVersion.getTime()}`}
          alt={session.tenant.name}
          className="max-h-12 max-w-full self-start object-contain"
        />
      ) : (
        <p className="font-display text-2xl font-bold uppercase leading-none">{session.tenant.name}</p>
      )}

      <section className="rounded border border-slate-200 bg-slate-50 p-3" aria-label="Seu acesso">
        <p className="text-xs uppercase tracking-wide text-slate-500">Seu acesso</p>
        <p className="truncate font-display text-lg font-semibold uppercase leading-tight">{session.name}</p>
        <p className="text-sm text-slate-600">
          {ROLE_LABELS[session.role]} · {session.tenant.name}
        </p>
      </section>

      {canAccess(session.role, "pedidos") && (
        <Link
          href="/pedidos/novo"
          className="rounded bg-brand px-3 py-2 text-center font-medium text-white hover:bg-brand-dark"
        >
          + Novo pedido
        </Link>
      )}

      <nav aria-label="Menu principal" className="flex flex-col">
        {items.map((item) => (
          <Link key={item.key} href={item.href} className="rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900">
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 text-sm">
        {session.companies > 1 && (
          <Link href="/empresa" className="text-slate-600 underline">
            Trocar de empresa
          </Link>
        )}
        {localLogin && (
          <Link href="/dev/login" className="text-slate-600 underline">
            Trocar perfil (login local)
          </Link>
        )}
        {/* POST on purpose: the central auth refuses logout by GET. */}
        <form action={`${SSO_LOGOUT_URL}?app=${SSO_APP_ID}`} method="post">
          <button type="submit" className="text-slate-600 underline">
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}

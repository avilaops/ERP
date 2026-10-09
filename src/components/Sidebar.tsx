import Link from "next/link";
import { MobileMenu } from "@/components/MobileMenu";
import type { MenuTab } from "@/components/MobileMenu";
import { ThemeChoice } from "@/components/ThemeChoice";
import type { Session } from "@/lib/auth";
import { localProvider } from "@/lib/auth/local-provider";
import { allows, menuOf } from "@/lib/auth/permissions";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { SSO_APP_ID, SSO_LOGOUT_URL } from "@/lib/auth/sso";
import { loadLogoVersion } from "@/lib/db/company";
import { tenantDb } from "@/lib/db/pool";

/**
 * The destinations of the bar at the bottom of a phone, by how often a company
 * uses them, with the short name that fits under an icon. The first four the
 * person has are shown; everything else is under "Mais".
 */
const TAB_ORDER: [key: string, label: string, icon: string][] = [
  ["pedidos", "Pedidos", "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"],
  ["funil", "Funil", "M3 5h18l-7 8v6l-4 2v-8z"],
  ["clientes", "Clientes", "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1.5a4 4 0 0 0-3-3.9M15.5 3.6a3.5 3.5 0 0 1 0 6.8"],
  ["tabela-precos", "Preços", "M3 12V4h8l10 10-8 8zM7.5 7.5h.01"],
  ["simulador", "Simular", "M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"],
  ["dashboard", "Início", "M4 20V10M10 20V4M16 20v-7M22 20H2"],
  ["recebimentos", "Receber", "M12 3v12M7 10l5 5 5-5M4 21h16"],
  ["contas-pagar", "Pagar", "M12 21V9M7 14l5-5 5 5M4 3h16"],
  ["aprovacoes", "Aprovar", "M5 12.5l4.5 4.5L19 7.5"],
  ["comissoes", "Comissões", "M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.300-4.5 3 2 3 4.500 3 4.500 1.300 4.500 3-2 3-4.500 3-4.500-1.300-4.500-3"],
];
const MORE_ICON = "M5 12h.01M12 12h.01M19 12h.01";

const Icon = ({ path }: { path: string }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);

/** Server component: the menu is computed from the server-side session only. */
export async function Sidebar({ session }: { session: Session }) {
  const items = menuOf(session);
  const logoVersion = await loadLogoVersion(tenantDb(session.tenant.slug));
  const localLogin = localProvider(process.env).available;

  // The company of the session: its logo, when the directors sent one, or its name.
  const brand = logoVersion ? (
    // eslint-disable-next-line @next/next/no-img-element -- served by the app itself, per company
    <img src={`/empresa/logo?v=${logoVersion.getTime()}`} alt={session.tenant.name} className="max-h-8 max-w-full object-contain md:max-h-11" />
  ) : (
    <p className="truncate font-display text-lg font-bold uppercase leading-none md:whitespace-normal md:text-xl">{session.tenant.name}</p>
  );
  const tabs: MenuTab[] = TAB_ORDER.flatMap(([key, label, icon]) => {
    const item = items.find((entry) => entry.key === key);
    return item ? [{ href: item.href, label, icon: <Icon path={icon} /> }] : [];
  }).slice(0, 4);

  return (
    <MobileMenu brand={brand} tabs={tabs} more={<Icon path={MORE_ICON} />}>
      <section className="rounded border border-slate-200 bg-slate-50 p-3" aria-label="Seu acesso">
        <p className="text-xs uppercase tracking-wide text-slate-500">Seu acesso</p>
        <p className="truncate font-display text-lg font-semibold uppercase leading-tight">{session.name}</p>
        <p className="text-sm text-slate-600">
          {session.profile ?? ROLE_LABELS[session.role]} · {session.tenant.name}
        </p>
      </section>

      {allows(session, "pedidos") && (
        <Link
          href="/pedidos/novo"
          className="rounded bg-brand px-3 py-2 text-center font-medium text-white hover:bg-brand-dark"
        >
          + Novo pedido
        </Link>
      )}

      <nav aria-label="Menu principal" className="flex flex-col">
        {items.map((item) => (
          <Link key={item.key} href={item.href} className="rounded-lg px-3 py-2.5 font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 md:py-2">
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 text-sm">
        <ThemeChoice />
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
    </MobileMenu>
  );
}

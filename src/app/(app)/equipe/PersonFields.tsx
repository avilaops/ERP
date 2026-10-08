import { MENU_ITEMS, POWERS } from "@/lib/auth/permissions";
import type { AccessProfile } from "@/lib/db/access-profiles";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";
import type { AppUser } from "@/lib/db/users";
import { AccessPicker } from "./AccessPicker";

/** What each type of access is for, in the words of the screen. What it opens comes from the permissions themselves. */
export const ROLE_NOTES: Record<Role, string> = {
  DIRETORIA: "Vê custo, lucro e meta. Define parâmetros, publica a tabela, cadastra a equipe e aprova qualquer pedido.",
  GERENTE_COMERCIAL: "Vê os pedidos de toda a equipe e aprova dentro da alçada. Não vê custo nem a meta de lucro.",
  VENDEDOR: "Monta pedidos com a tabela publicada e vê só os próprios pedidos e as próprias comissões.",
  FINANCEIRO: "Dá baixa nos recebimentos, cuida das contas a pagar e dos fornecedores e marca as comissões como pagas.",
};

const INPUT = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-base outline-none focus:ring-2 focus:ring-brand";

/**
 * One person on one screen: name, e-mail, the type of access and every screen
 * of the system with its box. Compact on purpose: it is to fit a phone without
 * scrolling through explanations.
 */
export function PersonFields({ saved, profiles }: { saved: AppUser | null; profiles: AccessProfile[] }) {
  // A profile of the company is one more choice of access, with its own screens.
  const profileKey = (id: number) => `perfil:${id}`;
  return (
    <>
      <div>
        <label htmlFor="name" className="block font-medium">
          Nome
        </label>
        <input id="name" name="name" type="text" defaultValue={saved?.name ?? ""} autoComplete="off" className={INPUT} />
      </div>
      <div>
        <label htmlFor="email" className="block font-medium">
          E-mail <span className="text-xs font-normal text-slate-500">(é com ele que a pessoa entra)</span>
        </label>
        {saved ? (
          <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-slate-700">{saved.email}</p>
        ) : (
          <input id="email" name="email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" className={INPUT} />
        )}
      </div>
      <AccessPicker
        options={[
          ...ROLES.map((role) => ({ role: role as string, label: ROLE_LABELS[role], note: ROLE_NOTES[role] })),
          ...profiles.map((profile) => ({
            role: profileKey(profile.id),
            label: profile.name,
            note: `Perfil da empresa, a partir de ${ROLE_LABELS[profile.baseRole]}.${profile.denied.length > 0 ? ` Sem: ${POWERS.filter((power) => profile.denied.includes(power.key)).map((power) => power.label.toLowerCase()).join("; ")}.` : ""}`,
            fixed: true,
          })),
        ]}
        screens={MENU_ITEMS.map((item) => ({
          key: item.key,
          label: item.label,
          roles: [...item.roles, ...profiles.filter((profile) => profile.items.includes(item.key)).map((profile) => profileKey(profile.id))],
        }))}
        role={saved?.profileId != null ? profileKey(saved.profileId) : (saved?.role ?? "VENDEDOR")}
        items={saved?.profileId != null ? null : (saved?.items ?? null)}
      />
    </>
  );
}

/** The buttons kept in reach at the bottom of the screen while the fields scroll. */
export const BOTTOM_BAR =
  "sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:bg-transparent md:px-0";
export const PRIMARY_BUTTON = "rounded-lg bg-brand px-4 py-3.5 text-base font-semibold text-white hover:bg-brand-dark";

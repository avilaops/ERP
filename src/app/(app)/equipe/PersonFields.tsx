import { MENU_ITEMS } from "@/lib/auth/permissions";
import { ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";
import type { AppUser } from "@/lib/db/users";

/** What each type of access is for, in the words of the screen. What it opens comes from the permissions themselves. */
export const ROLE_NOTES: Record<Role, string> = {
  DIRETORIA: "Vê custo, lucro e meta. Define parâmetros, publica a tabela, cadastra a equipe e aprova qualquer pedido.",
  GERENTE_COMERCIAL: "Vê os pedidos de toda a equipe e aprova dentro da alçada. Não vê custo nem a meta de lucro.",
  VENDEDOR: "Monta pedidos com a tabela publicada e vê só os próprios pedidos e as próprias comissões.",
  FINANCEIRO: "Dá baixa nos recebimentos, cuida das contas a pagar e dos fornecedores e marca as comissões como pagas.",
};

const INPUT = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand";

/**
 * The fields of one person, new or saved, for the one-screen form: name, e-mail
 * and the type of access as large options, each one saying what it opens. A
 * server component: nothing is decided in the browser.
 */
export function PersonFields({ saved }: { saved: AppUser | null }) {
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
          E-mail
        </label>
        {saved ? (
          <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700">{saved.email}</p>
        ) : (
          <input id="email" name="email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" className={INPUT} />
        )}
        <p className="mt-1 text-xs text-slate-500">É com este e-mail que a pessoa entra, pelo login da Ávila Ops. A senha é dela e não fica aqui.</p>
      </div>

      <fieldset>
        <legend className="font-medium">Tipo de acesso</legend>
        <div className="mt-2 flex flex-col gap-2">
          {ROLES.map((role) => (
            <label
              key={role}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-300 bg-white p-4 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
            >
              <input type="radio" name="role" value={role} defaultChecked={(saved?.role ?? "VENDEDOR") === role} className="mt-1 h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block font-semibold">{ROLE_LABELS[role]}</span>
                <span className="mt-0.5 block text-sm text-slate-700">{ROLE_NOTES[role]}</span>
                <span className="mt-1 block text-xs text-slate-500">
                  Abre: {MENU_ITEMS.filter((item) => item.roles.includes(role)).map((item) => item.label).join(", ")}.
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

/** The buttons kept in reach at the bottom of the screen while the fields scroll. */
export const BOTTOM_BAR =
  "sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-slate-200 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:static md:mx-0 md:border-0 md:bg-transparent md:px-0";
export const PRIMARY_BUTTON = "rounded-lg bg-brand px-4 py-3.5 text-base font-semibold text-white hover:bg-brand-dark";

import Link from "next/link";
import { CARD, DANGER, INPUT, PRIMARY, SECONDARY, PageHeader, SectionDisclosure } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { COST_SCREENS, menuFor, menuItem, powersOf } from "@/lib/auth/permissions";
import { isRole, ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";
import { listProfiles } from "@/lib/db/access-profiles";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { createProfileAction, deleteProfileAction, updateProfileAction } from "./actions";

export const metadata = { title: "Perfis da empresa · ERP" };
export const dynamic = "force-dynamic";

const HERE = `${menuItem("equipe").href}/perfis`;
const TITLE = "text-sm font-semibold uppercase tracking-wide";
const BOX = "flex min-h-[var(--control)] items-center gap-2 text-sm";

/** The boxes of one profile: every screen and every power of its type of origin, ticked when the profile has them. */
function Choices({ role, items, denied, prefix }: { role: Role; items: readonly string[] | null; denied: readonly string[]; prefix: string }) {
  const powers = powersOf(role);
  return (
    <>
      <fieldset className="sm:col-span-2">
        <legend className="text-xs font-medium text-slate-600">Telas que o perfil abre (as de {ROLE_LABELS[role]})</legend>
        <SectionDisclosure title={`Revisar telas permitidas (${items === null ? menuFor(role).length : items.length})`} className="mt-2">
        <div className="mt-1 grid grid-cols-2 gap-x-4 rounded border border-slate-200 px-3 py-1.5 md:grid-cols-3">
          {menuFor(role).map((item) => (
            <label key={item.key} className={BOX}>
              <input type="checkbox" name="items" value={item.key} defaultChecked={items === null || items.includes(item.key)} className="h-4 w-4 shrink-0" />
              <span>
                {item.label}
                {COST_SCREENS.includes(item.key) && <span className="text-xs text-slate-500"> (mostra custo)</span>}
              </span>
            </label>
          ))}
        </div>
        </SectionDisclosure>
      </fieldset>
      {powers.length > 0 && (
        <fieldset className="sm:col-span-2">
          <legend className="text-xs font-medium text-slate-600">O que o perfil pode, além de abrir telas</legend>
          <SectionDisclosure title={`Revisar poderes (${powers.filter((power) => !denied.includes(power.key)).length} permitidos)`} className="mt-2">
          <div className="mt-1 grid gap-x-4 rounded border border-slate-200 px-3 py-1.5 md:grid-cols-2">
            {powers.map((power) => (
              <label key={power.key} className={BOX}>
                <input type="hidden" name="allPowers" value={power.key} />
                <input type="checkbox" name="powers" value={power.key} defaultChecked={!denied.includes(power.key)} id={`${prefix}-${power.key}`} className="h-4 w-4 shrink-0" />
                <span>{power.label}</span>
              </label>
            ))}
          </div>
          </SectionDisclosure>
        </fieldset>
      )}
    </>
  );
}

export default async function PerfisPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("equipe");
  const conn = tenantDb(session.tenant.slug);
  const profiles = await listProfiles(conn);
  const asked = (await searchParams).tipo;
  const typed = Array.isArray(asked) ? asked[0] : asked;
  const base: Role = isRole(typed) ? typed : "VENDEDOR";

  return (
    <>
      <p className="text-sm">
        <Link href={menuItem("equipe").href} className="text-brand underline">
          ← {menuItem("equipe").label}
        </Link>
      </p>
      <PageHeader title="Perfis da empresa" hint="Defina as telas e os poderes de cada perfil. As mudanças valem para todas as pessoas que o usam." />

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="novo">
        <h2 id="novo" className={TITLE}>
          Criar perfil
        </h2>
        <p className="mt-2 text-sm text-slate-600">Escolha a origem e revise as permissões antes de criar.</p>
        <nav aria-label="Tipo de origem" className="mt-1 flex flex-wrap gap-2">
          {ROLES.map((role) => (
            <Link
              key={role}
              href={`${HERE}?tipo=${role}`}
              aria-current={role === base ? "page" : undefined}
              className={`inline-flex min-h-[var(--control)] items-center rounded-full border px-3 text-sm font-medium ${role === base ? "border-brand bg-brand text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}
            >
              {ROLE_LABELS[role]}
            </Link>
          ))}
        </nav>
        <ActionForm key={base} action={createProfileAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="baseRole" value={base} />
          <div>
            <label htmlFor="novo-nome" className="block text-xs font-medium text-slate-600">
              Nome do perfil
            </label>
            <input id="novo-nome" name="name" type="text" maxLength={40} autoComplete="off" placeholder="Ex.: Fiscal" className={INPUT} />
          </div>
          <Choices role={base} items={null} denied={[]} prefix="novo" />
          <div className="sm:col-span-2">
            <button type="submit" className={PRIMARY}>
              Criar perfil
            </button>
          </div>
        </ActionForm>
      </section>

      <section className={`${CARD} mt-6`} aria-labelledby="lista">
        <h2 id="lista" className={`${TITLE} border-b border-slate-200 px-5 py-3`}>
          Perfis criados ({profiles.length})
        </h2>
        {profiles.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">Nenhum perfil próprio ainda. As pessoas usam os quatro tipos do sistema.</p>
        ) : (
          <ul>
            {profiles.map((profile) => (
              <li key={profile.id} className="border-t border-slate-200 p-5 first:border-t-0">
                <p className="text-sm text-slate-600">
                  A partir de <strong>{ROLE_LABELS[profile.baseRole]}</strong> · {profile.people} {profile.people === 1 ? "pessoa" : "pessoas"} com este perfil
                </p>
                <ActionForm action={updateProfileAction} className="mt-3 grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="id" value={profile.id} />
                  <div>
                    <label htmlFor={`nome-${profile.id}`} className="block text-xs font-medium text-slate-600">
                      Nome do perfil
                    </label>
                    <input key={profile.name} id={`nome-${profile.id}`} name="name" type="text" maxLength={40} defaultValue={profile.name} autoComplete="off" className={INPUT} />
                  </div>
                  <Choices key={`${profile.items.join()}-${profile.denied.join()}`} role={profile.baseRole} items={profile.items} denied={profile.denied} prefix={`p${profile.id}`} />
                  <div className="sm:col-span-2">
                    <button type="submit" className={SECONDARY}>
                      Salvar
                    </button>
                  </div>
                </ActionForm>
                {profile.people === 0 ? (
                  <ActionForm action={deleteProfileAction} className="mt-2">
                    <input type="hidden" name="id" value={profile.id} />
                    <ConfirmButton label="Remover perfil" confirmLabel="Confirmar: remover" className={DANGER} />
                  </ActionForm>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">Para remover, mude antes o acesso das pessoas que têm este perfil.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

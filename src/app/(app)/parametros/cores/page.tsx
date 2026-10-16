import Link from "next/link";
import { cookies } from "next/headers";
import { FitRows } from "@/components/FitRows";
import { EquipmentColorSwatch } from "@/components/EquipmentColorPicker";
import { CARD, INPUT, PRIMARY, SECONDARY, DANGER_OUTLINE, PageHeader, Pager, pageOf, SectionDisclosure, ViewTabs } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listEquipmentColors } from "@/lib/db/equipment-colors";
import { tenantDb } from "@/lib/db/pool";
import { COLOR_PARTS, isColorPart } from "@/lib/plates";
import { rowsPerPage } from "@/lib/rows";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { createColorAction, deleteColorAction, updateColorAction } from "./actions";

export const metadata = { title: "Cores dos equipamentos · ERP" };
export const dynamic = "force-dynamic";
const COOKIE = "erp_linhas_cores";
const HERE = "/parametros/cores";
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function CoresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const colors = await listEquipmentColors(tenantDb(session.tenant.slug));
  const query = await searchParams;
  const asked = first(query.ver);
  const part = isColorPart(asked) ? asked : "estrutura";
  const size = rowsPerPage((await cookies()).get(COOKIE)?.value, 1);
  const slice = pageOf(colors.filter((color) => color.part === part), first(query.p), size);
  const href = (page: number, edit?: number) => `${HERE}?${new URLSearchParams({ ver: part, ...(page > 1 ? { p: String(page) } : {}), ...(edit ? { editar: String(edit) } : {}) })}`;
  const selected = slice.rows.find((color) => String(color.id) === first(query.editar));

  return (
    <>
      <Link href={menuItem("parametros").href} className="inline-flex min-h-[var(--control)] items-center text-sm text-brand underline">← Configurações</Link>
      <PageHeader title="Cores dos equipamentos" hint="Defina as opções de estrutura e braço oferecidas no pedido." />
      <ViewTabs label="Parte do equipamento" items={COLOR_PARTS.map(([key, label]) => ({ href: `${HERE}?ver=${key}`, label: `${label} (${colors.filter((color) => color.part === key).length})`, current: part === key }))} />
      <SectionDisclosure title="Adicionar cor" className="mt-3">
        <ActionForm action={createColorAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="part" value={part} />
          <div className="min-w-0 flex-1 basis-48">
            <label htmlFor="new-name" className="block text-sm font-medium">Nome da cor</label>
            <input id="new-name" name="name" type="text" maxLength={60} autoComplete="off" className={INPUT} />
          </div>
          <button type="submit" className={PRIMARY}>Adicionar</button>
        </ActionForm>
      </SectionDisclosure>
      <section className={`${CARD} mt-3`} aria-label="Cores disponíveis">
        {slice.total === 0 && <p className="p-4 text-sm text-slate-600">Nenhuma cor nesta parte. Use Adicionar cor para oferecer uma opção no pedido.</p>}
        <ul id="cores">
          {slice.rows.map((color) => (
            <li key={color.id} data-row className="border-t border-slate-200 px-4 py-2 first:border-t-0">
              <div className="flex items-center justify-between gap-3">
                <EquipmentColorSwatch color={color.name} />
                <span className="min-w-0 break-words font-medium">{color.name}<span className="block text-xs font-normal text-slate-600">Ordem {color.position}</span></span>
                <Link href={href(slice.page, color.id)} aria-label={`Editar ${color.name}`} aria-current={selected?.id === color.id ? "true" : undefined} className={SECONDARY}>Editar</Link>
              </div>
              {selected?.id === color.id && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <ActionForm action={updateColorAction} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={color.id} />
                    <div className="w-20">
                      <label htmlFor={`position-${color.id}`} className="block text-sm font-medium">Ordem</label>
                      <input key={color.position} id={`position-${color.id}`} name="position" type="text" inputMode="numeric" defaultValue={color.position} className={INPUT} />
                    </div>
                    <div className="min-w-0 flex-1 basis-40">
                      <label htmlFor={`name-${color.id}`} className="block text-sm font-medium">Nome da cor</label>
                      <input key={color.name} id={`name-${color.id}`} name="name" type="text" maxLength={60} defaultValue={color.name} className={INPUT} />
                    </div>
                    <button type="submit" className={PRIMARY}>Salvar cor</button>
                    <Link href={href(slice.page)} className={SECONDARY}>Concluir edição</Link>
                  </ActionForm>
                  <ActionForm action={deleteColorAction} className="mt-3">
                    <input type="hidden" name="id" value={color.id} />
                    <ConfirmButton label="Remover cor" confirmLabel="Confirmar: remover" className={DANGER_OUTLINE} />
                  </ActionForm>
                </div>
              )}
            </li>
          ))}
        </ul>
        <Pager {...slice} noun={["cor", "cores"]} hrefFor={(page) => href(page)} />
      </section>
      {!selected && <FitRows listId="cores" shown={size} minimum={1} cookieName={COOKIE} />}
      <p className="mt-3 text-sm text-slate-600">Renomear ou remover uma opção mantém a cor dos pedidos que já a escolheram.</p>
    </>
  );
}

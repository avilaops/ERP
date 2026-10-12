import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listEquipmentColors } from "@/lib/db/equipment-colors";
import { tenantDb } from "@/lib/db/pool";
import { COLOR_PARTS } from "@/lib/plates";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { createColorAction, deleteColorAction, updateColorAction } from "./actions";

export const metadata = { title: "Cores dos equipamentos · ERP" };
export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200 bg-white";
const INPUT = "rounded border border-slate-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-brand";

export default async function CoresPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const colors = await listEquipmentColors(conn);

  return (
    <>
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className="text-brand underline">
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Cores dos equipamentos</h1>
      <p className="mt-1 max-w-3xl text-slate-600">
        São as cores que o pedido oferece em cada equipamento: a da estrutura e a do braço articulado. Cor removida sai das listas; os
        pedidos que já a escolheram continuam com ela.
      </p>

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="nova">
        <h2 id="nova" className="text-sm font-semibold uppercase tracking-wide">
          Adicionar cor
        </h2>
        <ActionForm action={createColorAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="new-part" className="block text-sm font-medium">
              Parte
            </label>
            <select id="new-part" name="part" className={`${INPUT} mt-1`}>
              {COLOR_PARTS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 basis-full sm:basis-48 sm:flex-1">
            <label htmlFor="new-name" className="block text-sm font-medium">
              Nome da cor
            </label>
            <input id="new-name" name="name" type="text" maxLength={60} autoComplete="off" className={`${INPUT} mt-1 w-full`} />
          </div>
          <button type="submit" className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
            Adicionar
          </button>
        </ActionForm>
      </section>

      {COLOR_PARTS.map(([part, label]) => {
        const ofPart = colors.filter((color) => color.part === part);
        return (
          <section key={part} className={`${CARD} mt-6`} aria-labelledby={`lista-${part}`}>
            <h2 id={`lista-${part}`} className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
              {label} ({ofPart.length})
            </h2>
            {ofPart.length === 0 && <p className="px-5 py-4 text-sm text-slate-600">Nenhuma cor: o pedido não oferece esta escolha.</p>}
            <ul>
              {ofPart.map((color) => (
                <li key={color.id} className="border-t border-slate-200 px-5 py-3 first:border-t-0">
                  <ActionForm action={updateColorAction} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={color.id} />
                    <div>
                      <label htmlFor={`position-${color.id}`} className="block text-xs font-medium text-slate-600">
                        Ordem
                      </label>
                      <input key={color.position} id={`position-${color.id}`} name="position" type="text" inputMode="numeric" size={1} defaultValue={color.position} className={`${INPUT} mt-1 w-16 text-right`} />
                    </div>
                    <div className="min-w-0 basis-full sm:basis-48 sm:flex-1">
                      <label htmlFor={`name-${color.id}`} className="block text-xs font-medium text-slate-600">
                        Nome da cor
                      </label>
                      <input key={color.name} id={`name-${color.id}`} name="name" type="text" maxLength={60} defaultValue={color.name} className={`${INPUT} mt-1 w-full`} />
                    </div>
                    <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
                      Salvar
                    </button>
                  </ActionForm>
                  <ActionForm action={deleteColorAction} className="mt-1">
                    <input type="hidden" name="id" value={color.id} />
                    <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="rounded px-2 py-1 text-sm text-red-700 hover:bg-red-50" />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

import Link from "next/link";
import { CARD, DANGER, PageHeader, PRIMARY, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listLines } from "@/lib/db/product-lines";
import { lineHref } from "@/lib/lines-view";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { createLineAction, deleteLineAction, renameLineAction } from "./actions";

export const metadata = { title: "Linhas de produto · ERP" };
export const dynamic = "force-dynamic";

const INPUT = "min-h-[var(--control)] rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:ring-2 focus:ring-brand";

export default async function LinhasPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const lines = await listLines(conn);

  return (
    <>
      <PageHeader title="Linhas de produto" hint="Cada linha (importada, nacional…) tem os seus parâmetros, as suas alíquotas por estado, os seus equipamentos e a sua tabela de preços. Um pedido é de uma linha só. A linha nova nasce com uma cópia dos parâmetros de outra: depois é só mudar o que difere." actions={<Link href={menuItem("parametros").href} className={SECONDARY}>Configurações</Link>} />

      <section className={`${CARD} mt-6 p-5`} aria-labelledby="nova">
        <h2 id="nova" className="text-sm font-semibold uppercase tracking-wide">
          Adicionar linha
        </h2>
        <ActionForm action={createLineAction} className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-0 basis-full sm:basis-48 sm:flex-1">
            <label htmlFor="new-name" className="block text-sm font-medium">
              Nome
            </label>
            <input id="new-name" name="name" type="text" maxLength={60} autoComplete="off" placeholder="Ex.: Nacional" className={`${INPUT} mt-1 w-full`} />
          </div>
          <div>
            <label htmlFor="copy-from" className="block text-sm font-medium">
              Copiar parâmetros de
            </label>
            <select id="copy-from" name="copyFrom" className={`${INPUT} mt-1`}>
              {lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={PRIMARY}>
            Adicionar
          </button>
        </ActionForm>
      </section>

      <section className={`${CARD} mt-6`} aria-labelledby="lista">
        <h2 id="lista" className="border-b border-slate-200 px-5 py-3 text-sm font-semibold uppercase tracking-wide">
          Linhas cadastradas ({lines.length})
        </h2>
        <ul>
          {lines.map((line) => {
            const free = line.products === 0 && line.versions === 0 && lines.length > 1;
            return (
              <li key={line.id} className="border-t border-slate-200 px-5 py-3 first:border-t-0">
                <ActionForm action={renameLineAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={line.id} />
                  <div className="min-w-0 basis-full sm:basis-48 sm:flex-1">
                    <label htmlFor={`name-${line.id}`} className="block text-xs font-medium text-slate-600">
                      Nome
                    </label>
                    <input key={line.name} id={`name-${line.id}`} name="name" type="text" maxLength={60} defaultValue={line.name} className={`${INPUT} mt-1 w-full`} />
                  </div>
                  <div className="min-w-0 basis-full sm:basis-auto">
                    <label htmlFor={`origin-${line.id}`} className="block text-xs font-medium text-slate-600">
                      De onde vem
                    </label>
                    <select key={String(line.imported)} id={`origin-${line.id}`} name="origin" defaultValue={line.imported ? "importada" : "nacional"} className={`${INPUT} mt-1 w-full`}>
                      <option value="importada">Importada (assessoria, pagamento no exterior)</option>
                      <option value="nacional">Nacional (fornecedor do país)</option>
                    </select>
                  </div>
                  <button type="submit" className={SECONDARY}>
                    Salvar
                  </button>
                </ActionForm>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                  <span>
                    {line.products} {line.products === 1 ? "equipamento" : "equipamentos"} · {line.versions}{" "}
                    {line.versions === 1 ? "tabela publicada" : "tabelas publicadas"}
                  </span>
                  <Link href={lineHref(menuItem("parametros").href, line.id)} className="text-brand underline">
                    Parâmetros
                  </Link>
                  <Link href={lineHref(menuItem("produtos").href, line.id)} className="text-brand underline">
                    {menuItem("produtos").label}
                  </Link>
                </p>
                {free ? (
                  <ActionForm action={deleteLineAction} className="mt-1">
                    <input type="hidden" name="id" value={line.id} />
                    <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className={DANGER} />
                  </ActionForm>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    {lines.length === 1 ? "A empresa precisa de pelo menos uma linha." : "Só sai linha sem equipamento e sem tabela publicada."}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

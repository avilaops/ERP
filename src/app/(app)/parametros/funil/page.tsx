import Link from "next/link";
import { CARD, INPUT, LABEL, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listStages } from "@/lib/db/funnel";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { changeStageAction, createStageAction } from "./actions";

export const metadata = { title: "Etapas do funil · ERP" };
export const dynamic = "force-dynamic";

export default async function EtapasDoFunilPage() {
  const session = await requirePermission("parametros");
  const stages = await listStages(tenantDb(session.tenant.slug));
  const open = stages.filter((stage) => stage.kind === "aberta");

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader title="Etapas do funil" hint="Os passos de uma venda, na ordem em que aparecem no Funil. Ganho e perdido fecham a oportunidade e ficam sempre no fim." />

      <ul className={`${CARD} mt-3 divide-y divide-slate-200`}>
        {stages.map((stage) => {
          const index = open.findIndex((item) => item.id === stage.id);
          return (
            <li key={stage.id} className="p-3">
              <ActionForm action={changeStageAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={stage.id} />
                <div className="min-w-40 flex-1">
                  <label htmlFor={`etapa-${stage.id}`} className={LABEL}>
                    {stage.kind === "aberta" ? `Etapa ${index + 1}` : stage.kind === "ganha" ? "Venda ganha" : "Venda perdida"}
                  </label>
                  <input id={`etapa-${stage.id}`} name="name" type="text" defaultValue={stage.name} key={stage.name} autoComplete="off" className={INPUT} />
                </div>
                <button type="submit" name="what" value="salvar" className={SECONDARY}>
                  Salvar
                </button>
                {stage.kind === "aberta" ? (
                  <>
                    <button type="submit" name="what" value="subir" disabled={index === 0} aria-label={`Subir ${stage.name}`} className={`${SECONDARY} disabled:opacity-40`}>
                      ↑
                    </button>
                    <button type="submit" name="what" value="descer" disabled={index === open.length - 1} aria-label={`Descer ${stage.name}`} className={`${SECONDARY} disabled:opacity-40`}>
                      ↓
                    </button>
                    {open.length > 1 && <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />}
                  </>
                ) : (
                  <Pill tone={stage.kind === "ganha" ? "good" : "bad"}>{stage.kind === "ganha" ? "fecha como ganha" : "fecha como perdida"}</Pill>
                )}
              </ActionForm>
            </li>
          );
        })}
      </ul>

      <ActionForm action={createStageAction} className={`${CARD} mt-3 flex flex-wrap items-end gap-2 p-3`}>
        <div className="min-w-40 flex-1">
          <label htmlFor="nova-etapa" className={LABEL}>
            Nova etapa (entra depois da última em aberto)
          </label>
          <input id="nova-etapa" name="name" type="text" placeholder="Ex.: Visita técnica" autoComplete="off" className={INPUT} />
        </div>
        <button type="submit" className={PRIMARY}>
          Adicionar etapa
        </button>
      </ActionForm>
    </div>
  );
}

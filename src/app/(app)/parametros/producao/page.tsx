import Link from "next/link";
import { CARD, INPUT, LABEL, PageHeader, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { listProductionStages } from "@/lib/db/production";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { changeProductionStageAction, createProductionStageAction } from "./actions";

export const metadata = { title: "Etapas da produção · ERP" };
export const dynamic = "force-dynamic";

export default async function EtapasDaProducaoPage() {
  const session = await requirePermission("parametros");
  const stages = await listProductionStages(tenantDb(session.tenant.slug));

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader title="Etapas da produção" hint="Por onde cada ordem passa na fábrica, na ordem. A última, de pronto, sempre existe." />
      <ul className="mt-3 flex flex-col gap-2">
        {stages.map((stage) => (
          <li key={stage.id} className={CARD}>
            <ActionForm action={changeProductionStageAction} className="flex flex-wrap items-end gap-2 p-3">
              <input type="hidden" name="id" value={stage.id} />
              <div className="min-w-40 flex-1">
                <label htmlFor={`nome-${stage.id}`} className={LABEL}>
                  {stage.kind === "pronta" ? "Etapa de pronto" : `Etapa ${stage.position}`} · {stage.orders} {stage.orders === 1 ? "ordem" : "ordens"}
                </label>
                <input id={`nome-${stage.id}`} name="name" type="text" defaultValue={stage.name} key={stage.name} autoComplete="off" className={INPUT} />
              </div>
              <button type="submit" name="what" value="salvar" className={SECONDARY}>
                Salvar
              </button>
              {stage.kind === "andamento" && (
                <>
                  <button type="submit" name="what" value="antes" aria-label={`Subir ${stage.name}`} className={SECONDARY}>
                    ↑
                  </button>
                  <button type="submit" name="what" value="depois" aria-label={`Descer ${stage.name}`} className={SECONDARY}>
                    ↓
                  </button>
                  <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
                </>
              )}
            </ActionForm>
          </li>
        ))}
      </ul>
      <ActionForm action={createProductionStageAction} className={`${CARD} mt-3 flex flex-wrap items-end gap-2 p-3`}>
        <div className="min-w-40 flex-1">
          <label htmlFor="nova-etapa" className={LABEL}>
            Nova etapa
          </label>
          <input id="nova-etapa" name="name" type="text" placeholder="Ex.: Estofaria" autoComplete="off" className={INPUT} />
        </div>
        <button type="submit" className={PRIMARY}>
          Adicionar etapa
        </button>
      </ActionForm>
    </div>
  );
}

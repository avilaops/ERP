import Link from "next/link";
import {
  CARD,
  INPUT,
  LABEL,
  PageHeader,
  PRIMARY,
  QUIET_LINK,
  SECONDARY,
} from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { productionEnabled } from "@/lib/db/modules";
import { listProductionStages } from "@/lib/db/production";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import {
  changeProductionStageAction,
  createProductionStageAction,
  switchProductionAction,
} from "./actions";

export const metadata = { title: "Produção · ERP" };
export const dynamic = "force-dynamic";

export default async function EtapasDaProducaoPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const [enabled, stages] = await Promise.all([
    productionEnabled(conn),
    listProductionStages(conn),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader
        title="Produção"
        hint="Para quem fabrica: o pedido fechado vira ordem e anda por etapas. Quem revende equipamento pronto deixa desligado."
      />
      <ActionForm
        action={switchProductionAction}
        className={`${CARD} mt-3 flex flex-wrap items-center justify-between gap-3 p-3`}
      >
        <p className="text-sm">
          <span className="font-semibold">
            {enabled ? "Módulo ligado" : "Módulo desligado"}
          </span>
          <span className="block text-slate-600 dark:text-slate-400">
            {enabled
              ? "Produção aparece no menu de quem tem a tela."
              : "Produção não aparece no menu de ninguém. O que já foi gravado continua guardado."}
          </span>
        </p>
        <button
          type="submit"
          name="enabled"
          value={enabled ? "0" : "1"}
          className={enabled ? SECONDARY : PRIMARY}
        >
          {enabled ? "Desligar" : "Ligar"}
        </button>
      </ActionForm>
      {enabled && (
        <>
          <h2 className="mt-5 text-sm font-semibold">
            Etapas, na ordem da fábrica
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {stages.map((stage) => (
              <li key={stage.id} className={CARD}>
                <ActionForm
                  action={changeProductionStageAction}
                  className="flex flex-wrap items-end gap-2 p-3"
                >
                  <input type="hidden" name="id" value={stage.id} />
                  <div className="min-w-40 flex-1">
                    <label htmlFor={`nome-${stage.id}`} className={LABEL}>
                      {stage.kind === "pronta"
                        ? "Etapa de pronto"
                        : `Etapa ${stage.position}`}{" "}
                      · {stage.orders} {stage.orders === 1 ? "ordem" : "ordens"}
                    </label>
                    <input
                      id={`nome-${stage.id}`}
                      name="name"
                      type="text"
                      defaultValue={stage.name}
                      key={stage.name}
                      autoComplete="off"
                      className={INPUT}
                    />
                  </div>
                  <button
                    type="submit"
                    name="what"
                    value="salvar"
                    className={SECONDARY}
                  >
                    Salvar
                  </button>
                  {stage.kind === "andamento" && (
                    <>
                      <button
                        type="submit"
                        name="what"
                        value="antes"
                        aria-label={`Subir ${stage.name}`}
                        className={SECONDARY}
                      >
                        ↑
                      </button>
                      <button
                        type="submit"
                        name="what"
                        value="depois"
                        aria-label={`Descer ${stage.name}`}
                        className={SECONDARY}
                      >
                        ↓
                      </button>
                      <ConfirmButton
                        label="Remover"
                        confirmLabel="Confirmar: remover"
                        className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50"
                      />
                    </>
                  )}
                </ActionForm>
              </li>
            ))}
          </ul>
          <ActionForm
            action={createProductionStageAction}
            className={`${CARD} mt-3 flex flex-wrap items-end gap-2 p-3`}
          >
            <div className="min-w-40 flex-1">
              <label htmlFor="nova-etapa" className={LABEL}>
                Nova etapa
              </label>
              <input
                id="nova-etapa"
                name="name"
                type="text"
                placeholder="Ex.: Estofaria"
                autoComplete="off"
                className={INPUT}
              />
            </div>
            <button type="submit" className={PRIMARY}>
              Adicionar etapa
            </button>
          </ActionForm>
        </>
      )}
    </div>
  );
}

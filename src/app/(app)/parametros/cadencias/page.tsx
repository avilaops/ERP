import Link from "next/link";
import { CARD, INPUT, LABEL, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listCadences } from "@/lib/db/cadences";
import { listTemplates } from "@/lib/db/messages";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { changeCadenceAction, changeCadenceStepAction, createCadenceAction } from "./actions";

export const metadata = { title: "Cadências · ERP" };
export const dynamic = "force-dynamic";

export default async function CadenciasPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const cadences = await listCadences(conn);
  const templates = await listTemplates(conn);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader title="Cadências" hint="Uma sequência de e-mails e tarefas que o sistema segue sozinho em cada oportunidade, até a venda fechar ou alguém parar." />
      {templates.length === 0 && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Para um passo de e-mail é preciso um modelo. Crie em{" "}
          <Link href="/parametros/mensagens" className="underline">
            Modelos de mensagem
          </Link>
          .
        </p>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {cadences.map((cadence) => (
          <li key={cadence.id} className={CARD}>
            <details className="group">
              <summary className="flex min-h-[var(--control)] cursor-pointer items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{cadence.name}</span>
                  <span className="block text-sm text-slate-600">
                    {cadence.steps.length} {cadence.steps.length === 1 ? "passo" : "passos"} · {cadence.running} em andamento
                  </span>
                </span>
                <Pill tone={cadence.active ? "good" : "neutral"}>{cadence.active ? "Ligada" : "Desligada"}</Pill>
                <span className="text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true">
                  ›
                </span>
              </summary>
              <div className="border-t border-slate-200 p-3">
                <ol className="flex flex-col gap-1 text-sm">
                  {cadence.steps.map((step) => (
                    <li key={step.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <strong>{step.position}.</strong> {step.waitDays === 0 ? "Na hora" : `Depois de ${step.waitDays} dia${step.waitDays === 1 ? "" : "s"}`}:{" "}
                        {step.kind === "email" ? `e-mail "${step.templateName}"` : `tarefa "${step.taskTitle}"`}
                      </span>
                      <ActionForm action={changeCadenceStepAction}>
                        <input type="hidden" name="stepId" value={step.id} />
                        <button type="submit" aria-label={`Remover o passo ${step.position}`} className="inline-flex min-h-9 items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50">
                          Remover
                        </button>
                      </ActionForm>
                    </li>
                  ))}
                  {cadence.steps.length === 0 && <li className="text-slate-600">Nenhum passo ainda.</li>}
                </ol>
                <ActionForm action={changeCadenceStepAction} className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 sm:grid-cols-[7rem_6rem_minmax(0,1fr)_auto] sm:items-end">
                  <input type="hidden" name="cadenceId" value={cadence.id} />
                  <div>
                    <label htmlFor={`tipo-${cadence.id}`} className={LABEL}>
                      Novo passo
                    </label>
                    <select id={`tipo-${cadence.id}`} name="kind" defaultValue="email" className={INPUT}>
                      <option value="email">E-mail</option>
                      <option value="tarefa">Tarefa</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`espera-${cadence.id}`} className={LABEL}>
                      Espera (dias)
                    </label>
                    <input id={`espera-${cadence.id}`} name="waitDays" type="text" inputMode="numeric" defaultValue="2" autoComplete="off" className={`${INPUT} text-right`} />
                  </div>
                  <div className="col-span-2 grid gap-2 sm:col-span-1 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`modelo-${cadence.id}`} className={LABEL}>
                        Modelo (para e-mail)
                      </label>
                      <select id={`modelo-${cadence.id}`} name="templateId" defaultValue="" className={INPUT}>
                        <option value="">Escolha</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`tarefa-${cadence.id}`} className={LABEL}>
                        Texto (para tarefa)
                      </label>
                      <input id={`tarefa-${cadence.id}`} name="taskTitle" type="text" placeholder="Ex.: ligar para o contato" autoComplete="off" className={INPUT} />
                    </div>
                  </div>
                  <button type="submit" className={`${SECONDARY} col-span-2 sm:col-span-1`}>
                    Adicionar passo
                  </button>
                </ActionForm>
                <ActionForm action={changeCadenceAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
                  <input type="hidden" name="id" value={cadence.id} />
                  <div className="min-w-40 flex-1">
                    <label htmlFor={`nome-${cadence.id}`} className={LABEL}>
                      Nome
                    </label>
                    <input id={`nome-${cadence.id}`} name="name" type="text" defaultValue={cadence.name} key={cadence.name} autoComplete="off" className={INPUT} />
                  </div>
                  <div>
                    <label htmlFor={`ativa-${cadence.id}`} className={LABEL}>
                      Situação
                    </label>
                    <select id={`ativa-${cadence.id}`} name="active" defaultValue={cadence.active ? "sim" : "nao"} key={String(cadence.active)} className={INPUT}>
                      <option value="sim">Ligada</option>
                      <option value="nao">Desligada</option>
                    </select>
                  </div>
                  <button type="submit" name="what" value="salvar" className={SECONDARY}>
                    Salvar
                  </button>
                  <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
                </ActionForm>
              </div>
            </details>
          </li>
        ))}
      </ul>

      <ActionForm action={createCadenceAction} className={`${CARD} mt-3 flex flex-wrap items-end gap-2 p-3`}>
        <div className="min-w-40 flex-1">
          <label htmlFor="nova-cadencia" className={LABEL}>
            Nova cadência
          </label>
          <input id="nova-cadencia" name="name" type="text" placeholder="Ex.: Retomada de orçamento" autoComplete="off" className={INPUT} />
        </div>
        <button type="submit" className={PRIMARY}>
          Criar cadência
        </button>
      </ActionForm>
    </div>
  );
}

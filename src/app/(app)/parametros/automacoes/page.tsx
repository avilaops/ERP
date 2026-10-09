import Link from "next/link";
import { CARD, INPUT, LABEL, PageHeader, Pill, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { AUTOMATION_TEXT, listAutomationRules } from "@/lib/db/automations";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { saveAutomationRuleAction } from "./actions";

export const metadata = { title: "Lembretes automáticos · ERP" };
export const dynamic = "force-dynamic";

export default async function AutomacoesPage() {
  const session = await requirePermission("parametros");
  const rules = await listAutomationRules(tenantDb(session.tenant.slug));

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader title="Lembretes automáticos" hint="O sistema cria a tarefa para o vendedor quando algo fica parado. As tarefas aparecem em Funil › Tarefas; nada é enviado ao cliente." />

      <ul className="mt-3 flex flex-col gap-3">
        {rules.map((rule) => {
          const text = AUTOMATION_TEXT[rule.kind];
          return (
            <li key={rule.id} className={CARD}>
              {/* One rule at a time: closed, it says what it is and how it stands; open, it is changed. */}
              <details className="group">
                <summary className="flex min-h-[var(--control)] cursor-pointer items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{text.name}</span>
                    <span className="block text-sm text-slate-600">
                      {rule.days} {text.unit}
                    </span>
                  </span>
                  <Pill tone={rule.active ? "good" : "neutral"}>{rule.active ? "Ligada" : "Desligada"}</Pill>
                  <span className="text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true">
                    ›
                  </span>
                </summary>
              <ActionForm action={saveAutomationRuleAction} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-2 border-t border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_auto]">
                <input type="hidden" name="id" value={rule.id} />
                <p className="col-span-2 text-sm text-slate-600 sm:col-span-4">{text.when}.</p>
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor={`texto-${rule.id}`} className={LABEL}>
                    Texto da tarefa
                  </label>
                  <input id={`texto-${rule.id}`} name="title" type="text" defaultValue={rule.title} key={rule.title} autoComplete="off" className={INPUT} />
                </div>
                <div>
                  <label htmlFor={`dias-${rule.id}`} className={LABEL}>
                    {text.unit.replace(/^dias /, "Dias ")}
                  </label>
                  <input id={`dias-${rule.id}`} name="days" type="text" inputMode="numeric" defaultValue={rule.days} key={rule.days} autoComplete="off" className={`${INPUT} text-right`} />
                </div>
                <div>
                  <label htmlFor={`ativa-${rule.id}`} className={LABEL}>
                    Situação
                  </label>
                  <select id={`ativa-${rule.id}`} name="active" defaultValue={rule.active ? "sim" : "nao"} key={String(rule.active)} className={INPUT}>
                    <option value="sim">Ligada</option>
                    <option value="nao">Desligada</option>
                  </select>
                </div>
                <button type="submit" className={`${SECONDARY} col-span-2 sm:col-span-1`}>
                  Salvar
                </button>
              </ActionForm>
              </details>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-600">
        No texto, {"{pedido}"} e {"{cliente}"} são trocados pelo número do pedido e pelo nome do cliente. Uma tarefa concluída não volta pelo mesmo motivo; se o
        orçamento for alterado e parar de novo, o lembrete volta.
      </p>
    </div>
  );
}

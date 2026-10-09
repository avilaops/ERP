import Link from "next/link";
import { CARD, INPUT, LABEL, PageHeader, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listTemplates, MESSAGE_WORDS } from "@/lib/db/messages";
import type { MessageTemplate } from "@/lib/db/messages";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { changeTemplateAction } from "./actions";

export const metadata = { title: "Modelos de mensagem · ERP" };
export const dynamic = "force-dynamic";

function Fields({ saved }: { saved: MessageTemplate | null }) {
  const suffix = saved?.id ?? "novo";
  return (
    <>
      {saved && <input type="hidden" name="id" value={saved.id} />}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`nome-${suffix}`} className={LABEL}>
            Nome do modelo
          </label>
          <input id={`nome-${suffix}`} name="name" type="text" defaultValue={saved?.name ?? ""} placeholder="Ex.: Primeiro contato" autoComplete="off" className={INPUT} />
        </div>
        <div>
          <label htmlFor={`assunto-${suffix}`} className={LABEL}>
            Assunto do e-mail
          </label>
          <input id={`assunto-${suffix}`} name="subject" type="text" defaultValue={saved?.subject ?? ""} autoComplete="off" className={INPUT} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`texto-${suffix}`} className={LABEL}>
            Texto
          </label>
          <textarea id={`texto-${suffix}`} name="body" rows={6} defaultValue={saved?.body ?? ""} className={`${INPUT} py-2`} />
        </div>
      </div>
    </>
  );
}

export default async function MensagensPage() {
  const session = await requirePermission("parametros");
  const templates = await listTemplates(tenantDb(session.tenant.slug));

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader title="Modelos de mensagem" hint="Textos prontos para os e-mails que saem da oportunidade e das cadências." />
      <p className="mt-2 text-xs text-slate-600">
        No assunto e no texto: {MESSAGE_WORDS.map(([word, meaning]) => `{${word}} = ${meaning.toLowerCase()}`).join("; ")}.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {templates.map((template) => (
          <li key={template.id} className={CARD}>
            <details className="group">
              <summary className="flex min-h-[var(--control)] cursor-pointer items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{template.name}</span>
                  <span className="block text-sm text-slate-600">{template.subject}</span>
                </span>
                <span className="text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true">
                  ›
                </span>
              </summary>
              <ActionForm action={changeTemplateAction} className="border-t border-slate-200 p-3">
                <Fields saved={template} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="submit" name="what" value="salvar" className={SECONDARY}>
                    Salvar
                  </button>
                  <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
                </div>
              </ActionForm>
            </details>
          </li>
        ))}
      </ul>

      <details className={`${CARD} mt-3`} open={templates.length === 0}>
        <summary className="flex min-h-[var(--control)] cursor-pointer items-center px-3 font-semibold text-brand">+ Novo modelo</summary>
        <ActionForm action={changeTemplateAction} className="border-t border-slate-200 p-3">
          <Fields saved={null} />
          <button type="submit" name="what" value="salvar" className={`${PRIMARY} mt-3`}>
            Criar modelo
          </button>
        </ActionForm>
      </details>
    </div>
  );
}

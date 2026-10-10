import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { CARD, INPUT, LABEL, PageHeader, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { publicAppUrl } from "@/lib/contract/public";
import { tenantDb } from "@/lib/db/pool";
import { listWhatsappTemplates, loadWhatsappInfo } from "@/lib/db/whatsapp";
import type { WhatsappTemplate } from "@/lib/db/whatsapp";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { removeWhatsappAction, saveWhatsappAction, whatsappTemplateAction } from "./actions";

export const metadata = { title: "WhatsApp · ERP" };
export const dynamic = "force-dynamic";

const TABS = [["conta", "Conta"], ["modelos", "Modelos aprovados"]] as const;

function TemplateFields({ saved }: { saved: WhatsappTemplate | null }) {
  const suffix = saved?.id ?? "novo";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {saved && <input type="hidden" name="id" value={saved.id} />}
      <div className="sm:col-span-2">
        <label htmlFor={`nome-${suffix}`} className={LABEL}>
          Nome do modelo, como está na Meta
        </label>
        <input id={`nome-${suffix}`} name="name" type="text" defaultValue={saved?.name ?? ""} placeholder="retomada_de_orcamento" autoComplete="off" className={INPUT} />
      </div>
      <div>
        <label htmlFor={`idioma-${suffix}`} className={LABEL}>
          Idioma
        </label>
        <input id={`idioma-${suffix}`} name="language" type="text" defaultValue={saved?.language ?? "pt_BR"} autoComplete="off" className={INPUT} />
      </div>
      <div className="sm:col-span-3">
        <label htmlFor={`texto-${suffix}`} className={LABEL}>
          O que o modelo diz (para a equipe saber; quem vale é o aprovado na Meta)
        </label>
        <textarea id={`texto-${suffix}`} name="preview" rows={2} defaultValue={saved?.preview ?? ""} className={`${INPUT} py-2`} />
      </div>
      <div className="sm:col-span-3">
        <label htmlFor={`campos-${suffix}`} className={LABEL}>
          Campos do modelo, na ordem de {"{{1}}"}, {"{{2}}"}… (contato, empresa, vendedor, minha_empresa); vazio se não tiver
        </label>
        <input id={`campos-${suffix}`} name="params" type="text" defaultValue={saved?.params.join(", ") ?? ""} placeholder="contato, minha_empresa" autoComplete="off" className={INPUT} />
      </div>
    </div>
  );
}

export default async function WhatsappParametrosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const asked = (await searchParams).ver;
  const tab = TABS.find(([key]) => key === (Array.isArray(asked) ? asked[0] : asked))?.[0] ?? "conta";
  const account = await loadWhatsappInfo(conn);
  const templates = tab === "modelos" ? await listWhatsappTemplates(conn) : [];
  const hook = `${publicAppUrl()}/whatsapp/${session.tenant.slug}`;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader title="WhatsApp" hint="A conta oficial da sua empresa na Meta (WhatsApp Business). Com ela, as conversas com os clientes ficam no funil." />
      <nav aria-label="Partes do WhatsApp" className="mt-2 flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/parametros/whatsapp?ver=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "conta" && (
        <>
          {account && (
            <section className={`${CARD} mt-3 p-3 text-sm`} aria-label="Aviso da Meta">
              <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-900">
                Conta cadastrada: número {account.displayPhone ?? account.phoneNumberId}. Para trocar, preencha de novo abaixo.
              </p>
              <p className="mt-3 text-slate-700">No painel da Meta, em WhatsApp → Configuração → Webhook, cole os dois e assine o campo &quot;messages&quot;:</p>
              <p className={`${LABEL} mt-2`}>Endereço de retorno</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all">{hook}</code>
                <CopyButton text={hook} label="Copiar" className={SECONDARY} />
              </div>
              <p className={`${LABEL} mt-2`}>Palavra de conferência</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all">{account.verifyToken}</code>
                <CopyButton text={account.verifyToken} label="Copiar" className={SECONDARY} />
              </div>
            </section>
          )}
          <ActionForm action={saveWhatsappAction} className={`${CARD} mt-3 grid gap-3 p-3 sm:grid-cols-2`}>
            <div>
              <label htmlFor="phoneNumberId" className={LABEL}>
                Identificador do número de telefone
              </label>
              <input id="phoneNumberId" name="phoneNumberId" type="text" inputMode="numeric" defaultValue={account?.phoneNumberId ?? ""} key={account?.phoneNumberId ?? ""} autoComplete="off" className={INPUT} />
            </div>
            <div>
              <label htmlFor="displayPhone" className={LABEL}>
                Número como o cliente vê (opcional)
              </label>
              <input id="displayPhone" name="displayPhone" type="tel" defaultValue={account?.displayPhone ?? ""} key={account?.displayPhone ?? ""} autoComplete="off" className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="accessKey" className={LABEL}>
                Chave de acesso permanente
              </label>
              <input id="accessKey" name="accessKey" type="password" autoComplete="new-password" className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="appSecret" className={LABEL}>
                Segredo do aplicativo
              </label>
              <input id="appSecret" name="appSecret" type="password" autoComplete="new-password" className={INPUT} />
            </div>
            <p className="text-sm text-slate-600 sm:col-span-2">Os dois são guardados cifrados e não voltam para a tela. Cada conversa iniciada pela empresa é cobrada pela Meta na conta dela.</p>
            <button type="submit" className={`${PRIMARY} sm:justify-self-start`}>
              Salvar conta
            </button>
          </ActionForm>
          {account && (
            <ActionForm action={removeWhatsappAction} className="mt-3">
              <ConfirmButton label="Remover conta" confirmLabel="Confirmar: remover a conta" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
            </ActionForm>
          )}
        </>
      )}

      {tab === "modelos" && (
        <>
          <p className="mt-3 text-sm text-slate-700">
            Depois de 24 horas sem o cliente escrever, o WhatsApp só deixa enviar um modelo aprovado pela Meta. Cadastre aqui os que a sua conta já tem aprovados, com o texto e os campos na mesma ordem da Meta.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {templates.map((template) => (
              <li key={template.id} className={CARD}>
                <details className="group">
                  <summary className="flex min-h-[var(--control)] cursor-pointer items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug">{template.name}</span>
                      <span className="block truncate text-sm text-slate-600">{template.preview}</span>
                    </span>
                    <span className="text-slate-500 transition-transform group-open:rotate-90" aria-hidden="true">
                      ›
                    </span>
                  </summary>
                  <ActionForm action={whatsappTemplateAction} className="border-t border-slate-200 p-3">
                    <TemplateFields saved={template} />
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
          <ActionForm action={whatsappTemplateAction} className={`${CARD} mt-3 p-3`}>
            <TemplateFields saved={null} />
            <button type="submit" name="what" value="salvar" className={`${PRIMARY} mt-3`}>
              Adicionar modelo
            </button>
          </ActionForm>
        </>
      )}
    </div>
  );
}

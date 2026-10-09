import Link from "next/link";
import { CARD, INPUT, LABEL, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { publicAppUrl } from "@/lib/contract/public";
import { listApiKeys, listDeliveries, listWebhooks, MAX_ATTEMPTS, WEBHOOK_EVENTS } from "@/lib/db/integrations";
import { tenantDb } from "@/lib/db/pool";
import { listUsers } from "@/lib/db/users";
import { showDateTime } from "@/lib/format";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { changeWebhookAction, createApiKeyAction, createWebhookAction, retryDeliveryAction, revokeApiKeyAction } from "./actions";

export const metadata = { title: "Integrações · ERP" };
export const dynamic = "force-dynamic";

const HERE = "/parametros/integracoes";
const TABS = [
  ["chaves", "Chaves da API"],
  ["avisos", "Avisos"],
  ["entregas", "Entregas"],
  ["como", "Como usar"],
] as const;
const DELIVERY_TONES = { entregue: "good", pendente: "neutral", falhou: "bad" } as const;

export default async function IntegracoesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const asked = (await searchParams).aba;
  const tab = TABS.find(([key]) => key === (Array.isArray(asked) ? asked[0] : asked))?.[0] ?? "chaves";
  const base = `${publicAppUrl()}/api/v1`;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader title="Integrações" hint="Outros sistemas da empresa (n8n, site, CRM) leem e gravam no ERP por chave, e são avisados quando algo acontece." />
      <nav aria-label="Partes das integrações" className="mt-2 flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={key === "chaves" ? HERE : `${HERE}?aba=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "chaves" && <Keys />}
      {tab === "avisos" && <Hooks />}
      {tab === "entregas" && <Deliveries />}
      {tab === "como" && <HowTo />}
    </div>
  );

  async function Keys() {
    const keys = await listApiKeys(conn);
    const users = (await listUsers(conn)).filter((user) => user.active);
    return (
      <section className="mt-3" aria-label="Chaves da API">
        <ActionForm action={createApiKeyAction} className={`${CARD} grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_auto] sm:items-end`}>
          <div>
            <label htmlFor="name" className={LABEL}>
              Para que serve
            </label>
            <input id="name" name="name" type="text" placeholder="Ex.: n8n, formulário do site" autoComplete="off" className={INPUT} />
          </div>
          <div>
            <label htmlFor="canWrite" className={LABEL}>
              Pode
            </label>
            <select id="canWrite" name="canWrite" defaultValue="nao" className={INPUT}>
              <option value="nao">Só ler</option>
              <option value="sim">Ler e gravar</option>
            </select>
          </div>
          <div>
            <label htmlFor="ownerEmail" className={LABEL}>
              O que ela criar fica no nome de
            </label>
            <select id="ownerEmail" name="ownerEmail" defaultValue={users.some((user) => user.email === session.email) ? session.email : ""} className={INPUT}>
              <option value="" disabled>
                Escolha a pessoa
              </option>
              {users.map((user) => (
                <option key={user.id} value={user.email}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={PRIMARY}>
            Criar chave
          </button>
        </ActionForm>
        {keys.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">Nenhuma chave criada. Sem chave, nenhum sistema de fora lê ou grava no ERP.</p>
        ) : (
          <ul className={`${CARD} mt-3 divide-y divide-slate-200`}>
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <p className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {key.name}
                    <Pill tone={key.revokedAt ? "neutral" : key.canWrite ? "warn" : "good"}>{key.revokedAt ? "revogada" : key.canWrite ? "lê e grava" : "só lê"}</Pill>
                  </span>
                  <span className="block text-xs text-slate-600">
                    <code>{key.prefix}…</code> · em nome de {key.ownerName} · {key.lastUsedAt ? `usada em ${showDateTime(key.lastUsedAt)}` : "nunca usada"}
                  </span>
                </p>
                {!key.revokedAt && (
                  <ActionForm action={revokeApiKeyAction}>
                    <input type="hidden" name="id" value={key.id} />
                    <ConfirmButton label="Revogar" confirmLabel="Confirmar: revogar" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  async function Hooks() {
    const hooks = await listWebhooks(conn);
    return (
      <section className="mt-3" aria-label="Avisos">
        <ActionForm action={createWebhookAction} className={`${CARD} grid gap-2 p-3 sm:grid-cols-2`}>
          <div>
            <label htmlFor="hookName" className={LABEL}>
              Nome do destino
            </label>
            <input id="hookName" name="name" type="text" placeholder="Ex.: n8n" autoComplete="off" className={INPUT} />
          </div>
          <div>
            <label htmlFor="url" className={LABEL}>
              Endereço que recebe (https)
            </label>
            <input id="url" name="url" type="url" inputMode="url" placeholder="https://n8n.suaempresa.com.br/webhook/erp" autoComplete="off" className={INPUT} />
          </div>
          <fieldset className="sm:col-span-2">
            <legend className={LABEL}>Avisar quando</legend>
            <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {Object.entries(WEBHOOK_EVENTS).map(([event, label]) => (
                <label key={event} className="flex min-h-9 items-center gap-2 text-sm">
                  <input type="checkbox" name="events" value={event} className="h-5 w-5" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className={`${PRIMARY} sm:col-span-2 sm:justify-self-start`}>
            Adicionar destino
          </button>
        </ActionForm>
        {hooks.length > 0 && (
          <ul className={`${CARD} mt-3 divide-y divide-slate-200`}>
            {hooks.map((hook) => (
              <li key={hook.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <p className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {hook.name}
                    <Pill tone={hook.active ? "good" : "neutral"}>{hook.active ? "ativo" : "pausado"}</Pill>
                    {hook.failed > 0 && <Pill tone="bad">{hook.failed} com falha</Pill>}
                  </span>
                  <span className="block break-all text-xs text-slate-600">{hook.url}</span>
                  <span className="block text-xs text-slate-600">
                    {hook.events.map((event) => WEBHOOK_EVENTS[event as keyof typeof WEBHOOK_EVENTS] ?? event).join(" · ")} · {hook.delivered} entregues
                  </span>
                </p>
                <ActionForm action={changeWebhookAction} className="flex gap-2">
                  <input type="hidden" name="id" value={hook.id} />
                  <button type="submit" name="what" value={hook.active ? "pausar" : "retomar"} className={SECONDARY}>
                    {hook.active ? "Pausar" : "Retomar"}
                  </button>
                  <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  async function Deliveries() {
    const deliveries = await listDeliveries(conn, 12);
    const names = new Map((await listWebhooks(conn)).map((hook) => [hook.id, hook.name]));
    return (
      <section className={`${CARD} mt-3`} aria-label="Últimas entregas">
        {deliveries.length === 0 ? (
          <p className="p-4 text-sm text-slate-600">Nenhum aviso enviado ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <p className="min-w-0 flex-1 text-sm">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {WEBHOOK_EVENTS[delivery.event as keyof typeof WEBHOOK_EVENTS] ?? delivery.event}
                    <Pill tone={DELIVERY_TONES[delivery.status]}>{delivery.status}</Pill>
                  </span>
                  <span className="block text-xs text-slate-600">
                    {names.get(delivery.webhookId) ?? "destino removido"} · {showDateTime(delivery.createdAt)} · {delivery.attempts} de {MAX_ATTEMPTS} tentativas
                    {delivery.lastResult ? ` · ${delivery.lastResult}` : ""}
                  </span>
                </p>
                {delivery.status === "falhou" && (
                  <ActionForm action={retryDeliveryAction}>
                    <input type="hidden" name="id" value={delivery.id} />
                    <button type="submit" className={SECONDARY}>
                      Tentar de novo
                    </button>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  function HowTo() {
    return (
      <section className={`${CARD} mt-3 p-3 text-sm`} aria-label="Como usar">
        <p>
          Toda chamada leva o cabeçalho <code>Authorization: Bearer &lt;chave&gt;</code>. As respostas são JSON, e nenhuma traz custo, margem ou lucro.
        </p>
        <dl className="mt-3 grid gap-y-2">
          {[
            ["GET", "/oportunidades", "As oportunidades do funil. ?situacao=aberta, ganha ou perdida."],
            ["POST", "/oportunidades", "Cria uma oportunidade na primeira etapa. Envie titulo e empresa; aceita contato, telefone, email, origem, valor_estimado, observacoes e cliente_documento."],
            ["GET", "/clientes", "Os clientes do cadastro. ?q= busca por nome ou documento."],
            ["GET", "/pedidos", "Os pedidos, sem valores. ?situacao=fechado filtra."],
          ].map(([method, path, what]) => (
            <div key={method + path}>
              <dt className="break-all font-mono text-xs text-slate-900">
                {method} {base}
                {path}
              </dt>
              <dd className="text-slate-600">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-slate-600">
          Cada aviso é um POST com o cabeçalho <code>X-ERP-Assinatura: t=…,v1=…</code>: o HMAC-SHA256 de <code>t.corpo</code> com o segredo do destino. Confira a assinatura e
          recuse avisos com <code>t</code> antigo. Uma resposta 2xx confirma a entrega; sem ela, o ERP tenta até {MAX_ATTEMPTS} vezes.
        </p>
      </section>
    );
  }
}

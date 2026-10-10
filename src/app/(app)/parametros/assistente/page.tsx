import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { CARD, INPUT, LABEL, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY, SECTION_TITLE } from "@/components/ui";
import { aiConfigured } from "@/lib/ai/client";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { aiUsage, loadAiSettings } from "@/lib/db/assist";
import { listConnections, mcpEnabled } from "@/lib/db/mcp";
import { tenantDb } from "@/lib/db/pool";
import { showDateTime } from "@/lib/format";
import { resourceUrl } from "@/lib/mcp/http";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { ActionForm } from "../../pedidos/ActionForm";
import { revokeMcpAction, saveAssistantAction, setMcpAction } from "./actions";

export const metadata = { title: "Assistente · ERP" };
export const dynamic = "force-dynamic";

const TABS = [["conexao", "Conexão (MCP)"], ["interno", "Assistente do funil"]] as const;

export default async function AssistenteParametrosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const asked = (await searchParams).ver;
  const tab = TABS.find(([key]) => key === (Array.isArray(asked) ? asked[0] : asked))?.[0] ?? "conexao";
  const mcp = await mcpEnabled(conn);
  const connections = tab === "conexao" ? await listConnections(null, conn) : [];
  const address = resourceUrl();
  const settings = await loadAiSettings(conn);
  const usage = await aiUsage(new Date(), conn);
  const configured = aiConfigured();

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader title="Assistente" hint="Inteligência artificial que resume cada venda do funil, sugere o próximo passo e rascunha a resposta ao cliente." />
      <nav aria-label="Partes do assistente" className="mt-2 flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/parametros/assistente?ver=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "conexao" && (
        <>
          <section className={`${CARD} mt-3 p-3`} aria-label="Conexão">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={SECTION_TITLE}>Assistentes conectados ao ERP</h2>
              <Pill tone={mcp ? "good" : "neutral"}>{mcp ? "Ligada" : "Desligada"}</Pill>
            </div>
            <p className="mt-2 text-sm text-slate-700">
              Com a conexão ligada, cada pessoa da equipe pode ligar o próprio assistente (o Claude, por exemplo) ao ERP, entrando com o próprio login. O assistente enxerga e faz só o que as telas daquela pessoa permitem: vendedor vê as próprias vendas, financeiro vê o que há a receber e a pagar, e assim por diante.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>O que o assistente ler é enviado ao serviço de inteligência artificial do aplicativo que a pessoa conectou.</li>
              <li>Custo, margem, tabela de custos e alçada de desconto nunca são enviados.</li>
              <li>Pelo assistente dá para consultar, criar tarefa e anotar numa oportunidade. Fechar pedido, aprovar, receber e pagar continuam só na tela.</li>
            </ul>
            {mcp && (
              <>
                <p className="mt-3">
                  <Link href="/conectar" className={PRIMARY}>
                    Conectar um assistente
                  </Link>
                </p>
                <p className="mt-2 text-sm text-slate-600">Cada pessoa da equipe abre essa mesma tela (menu → Conectar assistente) e segue os passos do assistente que usa.</p>
                <p className={`${LABEL} mt-3`}>Endereço do ERP para o assistente</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 break-all text-sm">{address}</code>
                  <CopyButton text={address} label="Copiar" className={SECONDARY} />
                </div>
              </>
            )}
            <ActionForm action={setMcpAction} className="mt-3">
              {mcp ? (
                <ConfirmButton label="Desligar a conexão" confirmLabel="Confirmar: desligar e desconectar todos" className={SECONDARY} />
              ) : (
                <button type="submit" name="what" value="ligar" className={PRIMARY}>
                  Ligar a conexão
                </button>
              )}
            </ActionForm>
          </section>
          {connections.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2" aria-label="Aplicativos conectados">
              {connections.map((connection) => (
                <li key={connection.id} className={`${CARD} flex flex-wrap items-center gap-2 px-3 py-2`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {connection.clientName} · {connection.email}
                    </span>
                    <span className="block text-sm text-slate-600">
                      desde {showDateTime(connection.createdAt)} · {connection.calls} {connection.calls === 1 ? "consulta" : "consultas"}
                      {connection.lastUsedAt ? ` · último uso em ${showDateTime(connection.lastUsedAt)}` : ""}
                    </span>
                  </span>
                  <ActionForm action={revokeMcpAction}>
                    <input type="hidden" name="id" value={connection.id} />
                    <ConfirmButton label="Desconectar" confirmLabel="Confirmar: desconectar" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {tab === "interno" && !configured && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          O serviço do assistente ainda não foi ligado neste servidor pela Ávila Ops. Você pode deixar a escolha gravada; ele passa a funcionar quando o serviço for ligado.
        </p>
      )}
      {tab === "interno" && (
        <ActionForm action={saveAssistantAction} className={`${CARD} mt-3 p-3`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="enabled" className={LABEL}>
                Usar o assistente
              </label>
              <select id="enabled" name="enabled" defaultValue={settings.enabled ? "sim" : "nao"} key={String(settings.enabled)} className={INPUT}>
                <option value="nao">Desligado</option>
                <option value="sim">Ligado</option>
              </select>
            </div>
            <div>
              <label htmlFor="monthlyLimit" className={LABEL}>
                Pedidos ao assistente por mês
              </label>
              <input id="monthlyLimit" name="monthlyLimit" type="text" inputMode="numeric" defaultValue={settings.monthlyLimit} key={settings.monthlyLimit} autoComplete="off" className={`${INPUT} text-right`} />
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-700">
            Neste mês: {usage.requests} de {settings.monthlyLimit} pedidos. Cada pedido tem custo; ao chegar no limite, o assistente para até o mês virar.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Ao ligar, o texto de cada venda em que alguém pede ajuda (anotações, tarefas, e-mails trocados com o cliente, nome do contato) é enviado ao serviço de inteligência artificial para ser lido.</li>
            <li>Custo, margem, tabela de preços e alçada de desconto nunca são enviados.</li>
            <li>O assistente só lê e sugere: não envia e-mail, não muda etapa e não fecha pedido. Tudo o que ele escreve fica registrado.</li>
          </ul>
          <button type="submit" className={`${PRIMARY} mt-3`}>
            Salvar
          </button>
        </ActionForm>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CARD, DANGER, QUIET_LINK } from "@/components/ui";
import { PublicForm } from "@/app/contrato/[empresa]/[token]/PublicForm";
import { requireSession } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { listConnections, mcpEnabled } from "@/lib/db/mcp";
import { tenantDb } from "@/lib/db/pool";
import { showDateTime } from "@/lib/format";
import { connectClients } from "@/lib/mcp/clients";
import { resourceUrl } from "@/lib/mcp/http";
import { toolsOf } from "@/lib/mcp/tools";
import { disconnectMineAction } from "./actions";
import { ClientPicker } from "./ClientPicker";

/**
 * "Conectar um assistente": where each person of the team points their own
 * assistant at the ERP. Any signed-in user may open it; what the assistant
 * will reach is what that person's screens allow.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conectar um assistente · ERP", robots: { index: false, follow: false } };


export default async function ConectarPage() {
  const session = await requireSession("/conectar");
  const conn = tenantDb(session.tenant.slug);
  const on = await mcpEnabled(conn);
  const mine = on ? await listConnections(session.email, conn) : [];
  const tools = toolsOf(session);
  const serverUrl = resourceUrl();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-3 bg-slate-50 px-4 py-4">
      <p className="text-sm">
        <Link href="/" className={`${QUIET_LINK} inline-flex min-h-[var(--control)] items-center`}>
          ← Voltar ao ERP
        </Link>
      </p>
      <div>
        <p className="text-lg font-semibold text-slate-900">{session.tenant.name}</p>
        <h1 className="text-xl font-semibold">Conectar um assistente</h1>
        <p className="mt-1 text-slate-700">
          Seu assistente usará o acesso de <strong>{session.name}</strong> ({session.profile ?? ROLE_LABELS[session.role]}).
        </p>
      </div>

      {!on ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">A conexão com assistentes está desligada para esta empresa. Quem liga é a diretoria, em Parâmetros → Assistente.</p>
      ) : (
        <section className={`${CARD} p-4`} aria-label="Como conectar">
          <ClientPicker clients={connectClients(serverUrl)} serverUrl={serverUrl} />
        </section>
      )}

      <details className={`${CARD} p-4`}>
        <summary className="cursor-pointer font-medium">O que o assistente vai poder fazer ({tools.length})</summary>
        <ul className="mt-2 text-sm text-slate-800">
          {tools.map((tool) => (
            <li key={tool.name} className="py-0.5">
              {tool.writes ? "✎" : "•"} {tool.title}
              {tool.writes ? " (grava)" : ""}
            </li>
          ))}
          {tools.length === 0 && <li>Nenhuma ferramenta: o seu perfil não tem telas ligadas ao assistente.</li>}
        </ul>
        <p className="mt-2 text-sm text-slate-600">Custos exigem diretoria autorizada. Alterações têm prévia e confirmação. Registrar pagamento não transfere dinheiro. Cobranças são rascunhos.</p>
      {mine.length > 0 && (
        <section className={`${CARD} p-4`} aria-label="Meus assistentes conectados">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Conectados por você</h2>
          <ul className="mt-2 divide-y divide-slate-200">
            {mine.map((connection) => (
              <li key={connection.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{connection.clientName}</span>
                  <span className="block text-sm text-slate-600">
                    desde {showDateTime(connection.createdAt)} · {connection.calls} {connection.calls === 1 ? "consulta" : "consultas"}
                  </span>
                </span>
                <PublicForm action={disconnectMineAction}>
                  <input type="hidden" name="id" value={connection.id} />
                  <button type="submit" className={DANGER}>
                    Desconectar
                  </button>
                </PublicForm>
              </li>
            ))}
          </ul>
        </section>
      )}
      </details>
    </main>
  );
}

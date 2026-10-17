import type { Metadata } from "next";
import { PublicForm } from "@/app/contrato/[empresa]/[token]/PublicForm";
import { requireSession } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { mcpEnabled } from "@/lib/db/mcp";
import { tenantDb } from "@/lib/db/pool";
import { resourceUrl } from "@/lib/mcp/http";
import { resolveClient } from "@/lib/mcp/client";
import { toolsOf } from "@/lib/mcp/tools";
import { PRIMARY, SECONDARY } from "@/components/ui";
import { decideAuthorizationAction } from "./actions";

/**
 * The consent screen: an application asks to use the ERP in the name of who
 * is signed in. The person sees which application, as whom and what it will
 * be able to do, and decides. Nothing is given before the "Permitir".
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Permitir acesso ao ERP", robots: { index: false, follow: false }, referrer: "no-referrer" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const SHELL = "mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-slate-50 px-4 py-6";

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const params = Object.fromEntries(["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"].map((name) => [name, first(query[name])]));
  const session = await requireSession(`/oauth/authorize?${new URLSearchParams(params).toString()}`);
  const client = await resolveClient(params.client_id, process.env.SSO_JWT_SECRET);
  // What is wrong with the request itself is never sent back to the application: the address to go back to is part of what is not trusted yet.
  const valid = client !== null && client.redirectUris.includes(params.redirect_uri) && params.response_type === "code" && params.code_challenge_method === "S256" && /^[A-Za-z0-9_-]{43}$/.test(params.code_challenge) && (params.resource === "" || params.resource === resourceUrl());
  if (!valid) {
    return (
      <main className={SHELL}>
        <h1 className="text-xl font-semibold">Este pedido de acesso não é válido</h1>
        <p className="text-slate-700">O aplicativo enviou um pedido incompleto ou que não foi registrado neste ERP. Comece de novo por ele.</p>
      </main>
    );
  }
  const on = await mcpEnabled(tenantDb(session.tenant.slug));
  const tools = toolsOf(session);
  const where = new URL(params.redirect_uri).host;

  return (
    <main className={SHELL}>
      <p className="text-lg font-semibold text-slate-900">{session.tenant.name}</p>
      <h1 className="text-xl font-semibold">Permitir que {client.name} use o ERP por você?</h1>
      <p className="text-slate-700">
        Como <strong>{session.name}</strong> ({session.profile ?? ROLE_LABELS[session.role]}), você permite as ferramentas do seu perfil ao aplicativo em <strong className="break-words">{where}</strong>.
      </p>
      <details className="rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800">
        <summary className="min-h-[var(--control)] cursor-pointer py-3 font-medium">Ver ferramentas permitidas ({tools.length})</summary>
        <ul className="pb-3">
          {tools.map((tool) => (
            <li key={tool.name} className="py-0.5">
              {tool.writes ? "✎" : "•"} {tool.title}
              {tool.writes ? " (grava)" : ""}
            </li>
          ))}
          {tools.length === 0 && <li>Nenhuma ferramenta: o seu perfil não tem telas ligadas ao assistente.</li>}
        </ul>
      </details>
      <p className="text-sm text-slate-600">Os dados lidos vão para a IA do aplicativo. Custos exigem diretoria autorizada; baixas e tarefas em pedidos pedem confirmação no chat. Revogue em Conectar assistente.</p>
      {!on && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">A conexão com assistentes está desligada para esta empresa. Quem liga é a diretoria, em Parâmetros → Assistente.</p>}
      <PublicForm action={decideAuthorizationAction} className="flex flex-col gap-2">
        {Object.entries(params).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {on && (
          <button type="submit" name="what" value="permitir" className={`${PRIMARY} w-full`}>
            Permitir
          </button>
        )}
        <button type="submit" name="what" value="negar" className={`${SECONDARY} w-full`}>
          Não permitir
        </button>
      </PublicForm>
    </main>
  );
}

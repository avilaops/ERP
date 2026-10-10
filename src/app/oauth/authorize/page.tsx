import type { Metadata } from "next";
import { PublicForm } from "@/app/contrato/[empresa]/[token]/PublicForm";
import { requireSession } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { mcpEnabled } from "@/lib/db/mcp";
import { tenantDb } from "@/lib/db/pool";
import { resourceUrl } from "@/lib/mcp/http";
import { resolveClient } from "@/lib/mcp/client";
import { toolsOf } from "@/lib/mcp/tools";
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
        Você está como <strong>{session.name}</strong> ({session.profile ?? ROLE_LABELS[session.role]}). O aplicativo, que responde em <strong>{where}</strong>, vai enxergar e fazer só o que as suas telas permitem:
      </p>
      <ul className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800">
        {tools.map((tool) => (
          <li key={tool.name} className="py-0.5">
            {tool.writes ? "✎" : "•"} {tool.title}
            {tool.writes ? " (grava)" : ""}
          </li>
        ))}
        {tools.length === 0 && <li>Nenhuma ferramenta: o seu perfil não tem telas ligadas ao assistente.</li>}
      </ul>
      <p className="text-sm text-slate-600">Custo e margem nunca são enviados. O que o aplicativo ler vai para o serviço de inteligência artificial dele. Você pode desfazer a qualquer hora no menu → Conectar assistente.</p>
      {!on && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">A conexão com assistentes está desligada para esta empresa. Quem liga é a diretoria, em Parâmetros → Assistente.</p>}
      <PublicForm action={decideAuthorizationAction} className="flex flex-col gap-2">
        {Object.entries(params).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {on && (
          <button type="submit" name="what" value="permitir" className="w-full rounded bg-brand px-4 py-3 text-base font-semibold text-white hover:opacity-90">
            Permitir
          </button>
        )}
        <button type="submit" name="what" value="negar" className="w-full rounded border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">
          Não permitir
        </button>
      </PublicForm>
    </main>
  );
}

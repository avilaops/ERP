import { exchangeCode, mcpEnabled, refreshTokens } from "@/lib/db/mcp";
import { openMcpTenant } from "@/lib/mcp/access";
import { json, preflight } from "@/lib/mcp/http";
import { resolveClient } from "@/lib/mcp/client";
import { SCOPE } from "@/lib/mcp/oauth";

/**
 * Where an application exchanges the code a person gave it for the keys, and
 * a renewal key for a new pair. Every refusal answers the same
 * (`invalid_grant`): which part was wrong is never told.
 */
const refused = () => json({ error: "invalid_grant" }, 400);

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > 10_000) return refused();
  const form = new URLSearchParams(raw);
  const field = (name: string) => form.get(name) ?? "";
  const client = await resolveClient(field("client_id"), process.env.SSO_JWT_SECRET);
  if (!client) return json({ error: "invalid_client" }, 401);
  const grant = field("grant_type");
  const now = new Date();
  const kind = grant === "authorization_code" ? "code" : grant === "refresh_token" ? "refresh" : null;
  if (!kind) return json({ error: "unsupported_grant_type" }, 400);
  const secret = field(kind === "code" ? "code" : "refresh_token");
  const opened = await openMcpTenant(kind, secret);
  if (!opened || !(await mcpEnabled(opened.conn))) return refused();
  const tokens = kind === "code"
    ? await exchangeCode({ tenant: opened.slug, code: secret, verifier: field("code_verifier"), clientId: client.clientId, redirectUri: field("redirect_uri"), now }, opened.conn)
    : await refreshTokens({ tenant: opened.slug, refreshToken: secret, clientId: client.clientId, now }, opened.conn);
  if (!tokens) return refused();
  return json({ access_token: tokens.accessToken, token_type: "Bearer", expires_in: tokens.expiresIn, refresh_token: tokens.refreshToken, scope: SCOPE }, 200, { Pragma: "no-cache" });
}

export function OPTIONS(): Response {
  return preflight();
}

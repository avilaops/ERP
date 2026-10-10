import { publicAppUrl } from "@/lib/contract/public";
import { SCOPE } from "@/lib/mcp/oauth";

/** These addresses are called by programs, with no cookie: any origin may read the answer, and nothing is ever cached. */
export const OPEN = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...OPEN, ...extra } });
export const preflight = (): Response => new Response(null, { status: 204, headers: OPEN });

export const issuer = (env: Record<string, string | undefined> = process.env) => publicAppUrl(env);
export const resourceUrl = (env: Record<string, string | undefined> = process.env) => `${issuer(env)}/mcp`;
export const resourceMetadataUrl = (env: Record<string, string | undefined> = process.env) => `${issuer(env)}/.well-known/oauth-protected-resource`;

/** RFC 9728: where the keys for this resource come from. */
export const protectedResource = (env: Record<string, string | undefined> = process.env) => ({ resource: resourceUrl(env), authorization_servers: [issuer(env)], scopes_supported: [SCOPE], bearer_methods_supported: ["header"], resource_name: "ERP Ávila Ops" });

/** RFC 8414: how an application gets a key. Public applications only, always with PKCE. */
export const authorizationServer = (env: Record<string, string | undefined> = process.env) => ({
  issuer: issuer(env), authorization_endpoint: `${issuer(env)}/oauth/authorize`, token_endpoint: `${issuer(env)}/oauth/token`, registration_endpoint: `${issuer(env)}/oauth/register`,
  response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: [SCOPE], client_id_metadata_document_supported: true,
});

import { json, preflight } from "@/lib/mcp/http";
import { registerClient } from "@/lib/mcp/oauth";

/**
 * An application introduces itself (RFC 7591). Nothing is stored and nothing is
 * given: the answer is an identifier that carries, signed, the name it said
 * and the addresses it may be sent back to. Access only comes later, from a
 * person of the ERP, on the consent screen.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.SSO_JWT_SECRET;
  const raw = await request.text();
  if (!secret || raw.length > 10_000) return json({ error: "invalid_client_metadata" }, 400);
  let body: { client_name?: unknown; redirect_uris?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json({ error: "invalid_client_metadata" }, 400);
  }
  try {
    const client = registerClient({ name: body?.client_name, redirectUris: body?.redirect_uris }, secret);
    return json({ client_id: client.clientId, client_name: client.name, redirect_uris: client.redirectUris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }, 201);
  } catch {
    return json({ error: "invalid_redirect_uri", error_description: "redirect_uris: https, ou http em localhost." }, 400);
  }
}

export function OPTIONS(): Response {
  return preflight();
}

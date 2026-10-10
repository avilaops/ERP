import { noteCall } from "@/lib/db/mcp";
import { mcpAccess } from "@/lib/mcp/access";
import { json, OPEN, preflight, resourceMetadataUrl } from "@/lib/mcp/http";
import { handleMcp } from "@/lib/mcp/server";

/**
 * The ERP for assistants (Model Context Protocol, over HTTP). Every request
 * carries the key a person authorised; without a good one the answer says
 * where to get it. What the assistant then sees and does is what that
 * person's screens allow, read again on each request.
 */
const unauthorized = () => new Response(null, { status: 401, headers: { ...OPEN, "WWW-Authenticate": `Bearer realm="erp", resource_metadata="${resourceMetadataUrl()}"` } });

/** How many requests a connection may make a minute. Kept in memory: enough to stop a loop gone wrong. */
const PER_MINUTE = 120;
const windows = new Map<number, { start: number; count: number }>();
function allowed(grantId: number, now: number): boolean {
  const current = windows.get(grantId);
  if (!current || now - current.start >= 60_000) {
    windows.set(grantId, { start: now, count: 1 });
    if (windows.size > 5000) for (const [key, value] of windows) if (now - value.start >= 60_000) windows.delete(key);
    return true;
  }
  current.count += 1;
  return current.count <= PER_MINUTE;
}

export async function POST(request: Request): Promise<Response> {
  const access = await mcpAccess(request.headers.get("authorization"), new Date());
  if (!access) return unauthorized();
  if (!allowed(access.grantId, Date.now())) return json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Muitos pedidos em pouco tempo. Tente de novo em um minuto." } }, 429, { "Retry-After": "60" });
  const raw = await request.text();
  let message: unknown;
  try {
    message = raw.length > 200_000 ? null : JSON.parse(raw);
  } catch {
    message = null;
  }
  const reply = await handleMcp(message, access.session, access.conn, (tool, ok) => noteCall(access.grantId, access.session.email, tool, ok, access.conn));
  return reply.body === null ? new Response(null, { status: reply.status, headers: OPEN }) : json(reply.body, reply.status);
}

/** No stream is offered: an assistant that asks for one is told so. */
export function GET(): Response {
  return new Response(null, { status: 405, headers: { ...OPEN, Allow: "POST, OPTIONS" } });
}

export function DELETE(): Response {
  return new Response(null, { status: 405, headers: { ...OPEN, Allow: "POST, OPTIONS" } });
}

export function OPTIONS(): Response {
  return preflight();
}

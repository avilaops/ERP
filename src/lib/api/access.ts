import { tenantOfKey } from "@/lib/api/keys";
import { knownTenant } from "@/lib/auth/known";
import type { Tenant } from "@/lib/auth/tenants";
import { matchApiKey } from "@/lib/db/integrations";
import type { ApiKey } from "@/lib/db/integrations";
import { tenantDb } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";

export type ApiAccess = { tenant: Tenant; conn: Queryable; key: ApiKey };

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

/** An answer of the API, always JSON and never cached. */
export const apiJson = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });
export const apiError = (status: number, message: string): Response => apiJson({ erro: message }, status);

/** How many requests a key may make a minute. Kept in memory: enough to stop a loop gone wrong, not a promise of quota. */
const PER_MINUTE = 120;
const windows = new Map<string, { start: number; count: number }>();

function allowed(prefix: string, now: number): boolean {
  const current = windows.get(prefix);
  if (!current || now - current.start >= 60_000) {
    windows.set(prefix, { start: now, count: 1 });
    if (windows.size > 5000) for (const [key, value] of windows) if (now - value.start >= 60_000) windows.delete(key);
    return true;
  }
  current.count += 1;
  return current.count <= PER_MINUTE;
}

/**
 * Who is calling the API. The company comes in the key, and the key has to be
 * one of that company and still good; a wrong key, a revoked one and a
 * company that does not exist answer the same, so nobody learns which exists.
 * Everything a route does after this happens in the database of that company.
 */
export async function apiAccess(request: Request, env: Record<string, string | undefined> = process.env): Promise<ApiAccess | Response> {
  const header = request.headers.get("authorization") ?? "";
  const sent = /^Bearer\s+(\S+)$/i.exec(header)?.[1] ?? "";
  const slug = tenantOfKey(sent);
  const tenant = slug ? await knownTenant(slug, env) : null;
  if (!tenant) return apiError(401, "Chave inválida. Envie o cabeçalho Authorization: Bearer <chave>.");
  const conn = tenantDb(tenant.slug);
  const key = await matchApiKey(sent, conn);
  if (!key) return apiError(401, "Chave inválida. Envie o cabeçalho Authorization: Bearer <chave>.");
  if (!allowed(key.prefix, Date.now())) return apiError(429, "Chamadas demais em um minuto. Tente de novo em instantes.");
  return { tenant, conn, key };
}

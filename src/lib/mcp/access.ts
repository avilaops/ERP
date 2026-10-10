import { sessionOf } from "@/lib/auth";
import type { Session } from "@/lib/auth/access";
import { knownTenant } from "@/lib/auth/known";
import { grantOfAccess, mcpEnabled } from "@/lib/db/mcp";
import { tenantDb } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { tenantOfSecret } from "@/lib/mcp/oauth";
import type { SecretKind } from "@/lib/mcp/oauth";

/**
 * The door the assistants come in by. The company is in the key and opens
 * nothing by itself: it has to be a company of this ERP that turned the
 * connection on, the key has to be one a person of it authorised and that is
 * still good, and the person has to still be a user. The session that comes
 * out is the person's own, read from the directory on this very request.
 */
export async function mcpAccess(authorization: string | null, now: Date, env: Record<string, string | undefined> = process.env): Promise<{ session: Session; conn: Queryable; grantId: number } | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? "")?.[1] ?? "";
  const opened = await openMcpTenant("access", token, env);
  if (!opened || !(await mcpEnabled(opened.conn))) return null;
  const grant = await grantOfAccess(token, now, opened.conn);
  if (!grant) return null;
  const session = await sessionOf(grant.email, opened.slug, env);
  return session ? { session, conn: opened.conn, grantId: grant.id } : null;
}

/** The database of the company a code or a key names, when the company is one of this ERP. Knowing its name gives nothing: the secret still has to match. */
export async function openMcpTenant(kind: SecretKind, value: string, env: Record<string, string | undefined> = process.env): Promise<{ slug: string; conn: Queryable } | null> {
  const slug = tenantOfSecret(kind, value);
  if (!slug) return null;
  const tenant = await knownTenant(slug, env);
  if (!tenant) return null;
  return { slug: tenant.slug, conn: tenantDb(tenant.slug) };
}

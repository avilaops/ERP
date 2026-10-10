import { knownTenant } from "@/lib/auth/known";
import { publicAppUrl } from "@/lib/contract/public";
import { tenantDb } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";

/** The address the provider tells the end of a call to, for one company. `null` when the ERP has no public https address: then nobody is asked to call back. */
export function callStatusUrl(tenantSlug: string, env: Record<string, string | undefined> = process.env): string | null {
  const base = publicAppUrl(env);
  return base.startsWith("https://") ? `${base}/telefonia/${tenantSlug}` : null;
}

/**
 * The door the telephony provider knocks on. The company comes in the
 * address and opens nothing by itself: it has to be one of this ERP, and the
 * caller still has to check the signature of the notice before believing it.
 */
export async function openCallHook(company: string, env: Record<string, string | undefined> = process.env): Promise<{ slug: string; conn: Queryable } | null> {
  const tenant = await knownTenant(company, env);
  if (!tenant) return null;
  return { slug: tenant.slug, conn: tenantDb(tenant.slug) };
}

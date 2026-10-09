import { signupEnabled } from "@/lib/auth/signed-up";
import { parseTenants, TENANT_SLUG } from "@/lib/auth/tenants";
import type { Tenant } from "@/lib/auth/tenants";
import { controlDb, provisionedCompanies } from "@/lib/db/control";

/**
 * The company a name stands for, when it is one of this ERP: one of the
 * configuration or, with the sign-up on, one that signed up and has its
 * schema. For the two doors that have no session (the signing link and the
 * API); knowing the name of a company opens nothing by itself.
 */
export async function knownTenant(slug: string, env: Record<string, string | undefined> = process.env): Promise<Tenant | null> {
  if (!TENANT_SLUG.test(slug)) return null;
  const configured = parseTenants(env.ERP_TENANTS).find((known) => known.slug === slug);
  if (configured) return configured;
  if (!signupEnabled(env)) return null;
  return (await provisionedCompanies(controlDb())).find((known) => known.slug === slug) ?? null;
}

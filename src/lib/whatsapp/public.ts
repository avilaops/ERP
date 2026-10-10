import { knownTenant } from "@/lib/auth/known";
import type { Tenant } from "@/lib/auth/tenants";
import { tenantDb } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { whatsappAccount } from "@/lib/db/whatsapp";

/**
 * The door Meta knocks on: the address names the company, and that opens
 * nothing by itself. The company has to be one of this ERP and have an
 * account; what the caller gets is that account, to check that the notice was
 * signed with its secret before anything in it is believed.
 */
export async function openWhatsappHook(company: string, key: () => Buffer, env: Record<string, string | undefined> = process.env): Promise<{ tenant: Tenant; conn: Queryable; account: NonNullable<Awaited<ReturnType<typeof whatsappAccount>>> } | null> {
  const tenant = await knownTenant(company, env);
  if (!tenant) return null;
  const conn = tenantDb(tenant.slug);
  const account = await whatsappAccount(conn, key);
  return account ? { tenant, conn, account } : null;
}

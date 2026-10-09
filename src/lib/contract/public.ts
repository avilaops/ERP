import { signupEnabled } from "@/lib/auth/signed-up";
import { parseTenants, TENANT_SLUG } from "@/lib/auth/tenants";
import type { Tenant } from "@/lib/auth/tenants";
import { hashToken, TOKEN } from "@/lib/contract/token";
import { findContractByToken } from "@/lib/db/contracts";
import type { SigningContract } from "@/lib/db/contracts";
import { controlDb, provisionedCompanies } from "@/lib/db/control";
import { tenantDb } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";

/** What a signing link opens: one contract of one company, and the connection to that company. */
export type Signing = { tenant: Tenant; conn: Queryable; token: string; contract: SigningContract };

/**
 * The only place where a company is chosen without a session. Who signs a
 * contract is a customer, with no account in the ERP, so the company comes in
 * the address. It gives nothing by itself: the name has to be one of the
 * companies of this ERP, and inside it only the contract whose secret is in
 * the same address is read (32 random bytes; only its hash is stored). Nothing
 * else of the company is reachable from here: the caller gets the contract
 * and a connection it uses for that contract alone.
 */
export async function openSigning(company: string, token: string, env: Record<string, string | undefined> = process.env): Promise<Signing | null> {
  if (!TENANT_SLUG.test(company) || !TOKEN.test(token)) return null;
  let tenant = parseTenants(env.ERP_TENANTS).find((known) => known.slug === company) ?? null;
  if (!tenant && signupEnabled(env)) tenant = (await provisionedCompanies(controlDb())).find((known) => known.slug === company) ?? null;
  if (!tenant) return null;
  const conn = tenantDb(tenant.slug);
  const contract = await findContractByToken(hashToken(token), conn);
  return contract ? { tenant, conn, token, contract } : null;
}

/**
 * The network address the request came from, as the proxy in front of the ERP
 * saw it: the last entry of `X-Forwarded-For`, which is the one the proxy
 * wrote. What the browser itself sent in that header comes before and is not used.
 */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const last = (headers.get("x-forwarded-for") ?? "").split(",").pop()?.trim() ?? "";
  return /^[0-9a-fA-F:.]{3,45}$/.test(last) ? last : null;
}

/** The public address of the ERP, for the links that leave by e-mail. */
export const publicAppUrl = (env: Record<string, string | undefined> = process.env) => (env.APP_URL?.trim() || "http://localhost:3020").replace(/\/+$/, "");

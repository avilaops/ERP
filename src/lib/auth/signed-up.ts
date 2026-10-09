import type { AuthEnv } from "@/lib/auth/config";
import { createCombinedDirectory } from "@/lib/auth/directory";
import type { DirectoryUser } from "@/lib/auth/directory";
import { controlDb, openCompaniesOf, syncMember } from "@/lib/db/control";
import { tenantDb } from "@/lib/db/pool";
import { findActiveUser } from "@/lib/db/users";

/**
 * The companies that signed up on the site, for the login.
 *
 * Everything here is behind `ERP_CADASTRO_ABERTO=1`. Off (the default), nothing
 * in this file touches the database, and the ERP behaves exactly as before:
 * only the companies of `ERP_TENANTS` exist.
 *
 * A failure to read the register never locks out who comes from the
 * configuration: it is reported, and the person gets in to the companies of
 * `ERP_TENANTS` as always.
 */
export function signupEnabled(env: AuthEnv): boolean {
  return env.ERP_CADASTRO_ABERTO?.trim() === "1";
}

/**
 * The signed-up companies an e-mail gets into, with the profile it has in each
 * (read from the company's own users). `taken` are the companies the person
 * already has through the configuration: those are never listed twice.
 */
export async function signedUpMemberships(env: AuthEnv, email: string, taken: readonly string[]): Promise<DirectoryUser[]> {
  if (!signupEnabled(env)) return [];
  try {
    const tenants = (await openCompaniesOf(email, controlDb())).filter((tenant) => !taken.includes(tenant.slug));
    if (tenants.length === 0) return [];
    const directory = createCombinedDirectory(
      { findMemberships: async () => [] },
      tenants,
      (tenant, wanted) => findActiveUser(wanted, tenantDb(tenant.slug)),
      (tenant, error) => console.error(`[auth] cadastro de usuários de ${tenant.slug} não pôde ser lido:`, error instanceof Error ? error.message : error),
    );
    return await directory.findMemberships(email);
  } catch (error) {
    console.error("[auth] cadastro de empresas não pôde ser lido:", error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * After a company changes one of its users: keeps the login index in step, so
 * the person gets in (or stops getting in) at the next request. A company of
 * `ERP_TENANTS` is not in the register and nothing is written for it.
 */
export async function noteUserChange(env: AuthEnv, slug: string, email: string, active: boolean): Promise<void> {
  if (!signupEnabled(env)) return;
  try {
    await syncMember(slug, email, active, controlDb());
  } catch (error) {
    // The user is saved in the company; only the index is behind. Loud, because until it is fixed the login disagrees with the screen.
    console.error(`[auth] ÍNDICE DE LOGIN DESATUALIZADO: ${email} em ${slug} (ativo=${active}):`, error instanceof Error ? error.message : error);
  }
}

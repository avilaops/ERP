import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decideAccess, sessionFrom } from "@/lib/auth/access";
import type { Identity, Session } from "@/lib/auth/access";
import { assertAuthConfig, isProduction } from "@/lib/auth/config";
import type { AuthEnv } from "@/lib/auth/config";
import { createCombinedDirectory, createEnvDirectory } from "@/lib/auth/directory";
import type { UserDirectory } from "@/lib/auth/directory";
import { LOCAL_COOKIE, LOCAL_LOGIN_PATH, localProvider } from "@/lib/auth/local-provider";
import { menuItem } from "@/lib/auth/permissions";
import type { MenuItemKey } from "@/lib/auth/permissions";
import { loginUrl, SSO_COOKIE, verifySsoToken } from "@/lib/auth/sso";
import { chooseMembership, parseTenants } from "@/lib/auth/tenants";
import type { Tenant } from "@/lib/auth/tenants";
import { tenantDb } from "@/lib/db/pool";
import { findActiveUser } from "@/lib/db/users";

export type { Session } from "@/lib/auth/access";

export const NO_ACCESS_PATH = "/sem-acesso";
/** Remembers, on the shared address, which company a person who belongs to several chose. */
export const TENANT_COOKIE = "erp_tenant";
const DEV_APP_URL = "http://localhost:3020";

type Runtime = {
  ssoSecret: string | undefined;
  appUrl: string;
  tenants: Tenant[];
  directory: UserDirectory;
};

/**
 * `ERP_USERS` plus the users each company registered on its own screen
 * (Parâmetros → Usuários), read from the schema of that company.
 */
function directoryOf(raw: string | undefined, tenants: Tenant[]): UserDirectory {
  return createCombinedDirectory(
    createEnvDirectory(raw, tenants),
    tenants,
    (tenant, email) => findActiveUser(email, tenantDb(tenant.slug)),
    (tenant, error) => console.error(`[auth] cadastro de usuários de ${tenant.slug} não pôde ser lido:`, error instanceof Error ? error.message : error),
  );
}

/**
 * Built on every request, not at import time, so `next build` does not need the
 * production variables. In production an invalid configuration throws here as
 * well as at start-up (src/instrumentation.ts): no request is ever served
 * without a valid login setup.
 */
function runtime(env: AuthEnv): Runtime {
  if (isProduction(env)) {
    const config = assertAuthConfig(env);
    return {
      ssoSecret: config.ssoSecret,
      appUrl: config.appUrl,
      tenants: config.tenants,
      directory: directoryOf(env.ERP_USERS, config.tenants),
    };
  }
  const tenants = parseTenants(env.ERP_TENANTS);
  return {
    ssoSecret: env.SSO_JWT_SECRET,
    appUrl: env.APP_URL?.trim() || DEV_APP_URL,
    tenants,
    directory: directoryOf(env.ERP_USERS, tenants),
  };
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

/**
 * Who the visitor is and which company the request is for. The company comes
 * from what the directory says about the e-mail; never from a field, a parameter
 * of the address or anything else the browser could choose freely. The cookie
 * only picks among the companies the person already belongs to.
 */
async function resolveIdentity(env: AuthEnv, config: Runtime, store: CookieStore): Promise<Identity> {
  const local = localProvider(env);
  if (local.available) {
    const user = local.userFromCookie(store.get(LOCAL_COOKIE)?.value);
    if (user) return { authenticated: true, user, companies: local.tenants.length };
  }

  const ssoUser = verifySsoToken(store.get(SSO_COOKIE)?.value, config.ssoSecret);
  if (!ssoUser) return { authenticated: false, user: null };

  const memberships = await config.directory.findMemberships(ssoUser.email);
  return {
    authenticated: true,
    user: chooseMembership(memberships, store.get(TENANT_COOKIE)?.value),
    displayName: ssoUser.name,
    companies: memberships.length,
  };
}

/**
 * Cookies are read before the configuration: `cookies()` is what tells Next the
 * route is per-request, so `next build` never evaluates the production check.
 */
async function currentIdentity(): Promise<{ config: Runtime; identity: Identity }> {
  const store = await cookies();
  const config = runtime(process.env);
  return { config, identity: await resolveIdentity(process.env, config, store) };
}

/** Every company the signed-in person belongs to, to switch among. Empty when signed out. */
export async function listCompanies(): Promise<{ slug: string; name: string }[]> {
  const store = await cookies();
  const config = runtime(process.env);

  const local = localProvider(process.env);
  if (local.available && local.userFromCookie(store.get(LOCAL_COOKIE)?.value)) {
    return local.tenants.map(({ slug, name }) => ({ slug, name }));
  }
  const ssoUser = verifySsoToken(store.get(SSO_COOKIE)?.value, config.ssoSecret);
  if (!ssoUser) return [];
  return (await config.directory.findMemberships(ssoUser.email)).map(({ tenant }) => ({ slug: tenant.slug, name: tenant.name }));
}

/** The signed-in ERP user, or `null`. The profile never comes from the browser. */
export async function getSession(): Promise<Session | null> {
  return sessionFrom((await currentIdentity()).identity);
}

/**
 * Gate for a server page: returns the session or redirects (central login when
 * signed out, "sem acesso" when the e-mail or the profile is not allowed).
 * `path` is where the login sends the user back; it defaults to the item's route.
 *
 * With the local sign-in on (development only), signed out goes to it instead:
 * the central auth only returns to the host registered for the ERP, never to
 * localhost, so sending a developer there strands them on another address.
 */
export async function requirePermission(item: MenuItemKey, path?: string): Promise<Session> {
  const { config, identity } = await currentIdentity();
  const decision = decideAccess(identity, item);

  if (decision.kind === "login") {
    if (localProvider(process.env).available) redirect(LOCAL_LOGIN_PATH);
    redirect(loginUrl(config.appUrl, path ?? menuItem(item).href));
  }
  if (decision.kind === "no-access") redirect(NO_ACCESS_PATH);
  return decision.session;
}

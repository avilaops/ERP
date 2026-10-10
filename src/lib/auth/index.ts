import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decideAccess, sessionFrom } from "@/lib/auth/access";
import type { Identity, Session } from "@/lib/auth/access";
import { assertAuthConfig, isProduction } from "@/lib/auth/config";
import type { AuthEnv } from "@/lib/auth/config";
import { createCombinedDirectory, createEnvDirectory } from "@/lib/auth/directory";
import type { DirectoryUser, UserDirectory } from "@/lib/auth/directory";
import { LOCAL_COOKIE, LOCAL_LOGIN_PATH, localProvider } from "@/lib/auth/local-provider";
import { menuItem } from "@/lib/auth/permissions";
import { ROLES } from "@/lib/auth/roles";
import type { MenuItemKey } from "@/lib/auth/permissions";
import { signedUpMemberships } from "@/lib/auth/signed-up";
import { loginUrl, SSO_COOKIE, verifySsoToken } from "@/lib/auth/sso";
import { chooseMembership, parseTenants } from "@/lib/auth/tenants";
import type { Tenant } from "@/lib/auth/tenants";
import { tenantDb } from "@/lib/db/pool";
import { modulesOff } from "@/lib/db/modules";
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
 * Every company an e-mail belongs to: first the ones of the configuration, then
 * the ones that signed up on the site (when the sign-up is on; otherwise the
 * second list is empty and no query is made).
 */
async function membershipsOf(env: AuthEnv, config: Runtime, email: string): Promise<DirectoryUser[]> {
  const configured = await config.directory.findMemberships(email);
  const signedUp = await signedUpMemberships(env, email, config.tenants.map((tenant) => tenant.slug));
  return [...configured, ...signedUp];
}

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

  const memberships = await membershipsOf(env, config, ssoUser.email);
  return {
    authenticated: true,
    user: chooseMembership(memberships, store.get(TENANT_COOKIE)?.value),
    displayName: ssoUser.name,
    companies: memberships.length,
  };
}

/**
 * The person with the modules their company turned off. A company whose
 * settings cannot be read hides nothing: hiding is tidiness, not a lock.
 */
async function withModules(user: DirectoryUser | null): Promise<DirectoryUser | null> {
  if (!user) return null;
  try {
    return { ...user, off: await modulesOff(tenantDb(user.tenant.slug)) };
  } catch (error) {
    console.error(`[auth] módulos de ${user.tenant.slug} não puderam ser lidos:`, error instanceof Error ? error.message : error);
    return user;
  }
}

/**
 * Cookies are read before the configuration: `cookies()` is what tells Next the
 * route is per-request, so `next build` never evaluates the production check.
 */
async function currentIdentity(): Promise<{ config: Runtime; identity: Identity }> {
  const store = await cookies();
  const config = runtime(process.env);
  const identity = await resolveIdentity(process.env, config, store);
  return { config, identity: { ...identity, user: await withModules(identity.user) } };
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
  return (await membershipsOf(process.env, config, ssoUser.email)).map(({ tenant }) => ({ slug: tenant.slug, name: tenant.name }));
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

/**
 * Gate for a page that any signed-in user of the ERP may open, whatever their
 * screens: returns the session or sends the visitor to the login and back to
 * `path`. Signed in but unknown to the ERP goes to "sem acesso".
 */
export async function requireSession(path: string): Promise<Session> {
  const { config, identity } = await currentIdentity();
  if (!identity.authenticated) {
    if (localProvider(process.env).available) redirect(LOCAL_LOGIN_PATH);
    redirect(loginUrl(config.appUrl, path));
  }
  const session = sessionFrom(identity);
  if (!session) redirect(NO_ACCESS_PATH);
  return session;
}

/**
 * The session of a person in a company, as the ERP's own directory says it is
 * right now. For a request that proves who the person is by something other
 * than the login cookie (a key the person authorised): the profile, the
 * screens and the powers are read again on every request, so a person who was
 * removed or had the profile changed loses or changes access at once. `null`
 * when the e-mail no longer belongs to that company.
 */
export async function sessionOf(email: string, tenantSlug: string, env: AuthEnv = process.env): Promise<Session | null> {
  const local = localProvider(env);
  if (local.available) {
    const tenant = local.tenants.find((candidate) => candidate.slug === tenantSlug);
    const user = tenant ? ROLES.map((role) => local.userFromCookie(`${role}@${tenant.slug}`)).find((candidate) => candidate?.email === email) : null;
    if (user) return sessionFrom({ authenticated: true, user: await withModules(user), companies: local.tenants.length });
  }
  const memberships = await membershipsOf(env, runtime(env), email);
  const user = memberships.find((membership) => membership.tenant.slug === tenantSlug) ?? null;
  return sessionFrom({ authenticated: true, user: await withModules(user), companies: memberships.length });
}

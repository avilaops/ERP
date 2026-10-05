import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decideAccess, sessionFrom } from "@/lib/auth/access";
import type { Identity, Session } from "@/lib/auth/access";
import { assertAuthConfig, isProduction } from "@/lib/auth/config";
import type { AuthEnv } from "@/lib/auth/config";
import { createEnvDirectory } from "@/lib/auth/directory";
import type { UserDirectory } from "@/lib/auth/directory";
import { LOCAL_COOKIE, localProvider } from "@/lib/auth/local-provider";
import { menuItem } from "@/lib/auth/permissions";
import type { MenuItemKey } from "@/lib/auth/permissions";
import { loginUrl, SSO_COOKIE, verifySsoToken } from "@/lib/auth/sso";

export type { Session } from "@/lib/auth/access";

export const NO_ACCESS_PATH = "/sem-acesso";
const DEV_APP_URL = "http://localhost:3020";

type Runtime = {
  ssoSecret: string | undefined;
  appUrl: string;
  directory: UserDirectory;
};

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
      directory: createEnvDirectory(env.ERP_USERS),
    };
  }
  return {
    ssoSecret: env.SSO_JWT_SECRET,
    appUrl: env.APP_URL?.trim() || DEV_APP_URL,
    directory: createEnvDirectory(env.ERP_USERS),
  };
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

async function resolveIdentity(env: AuthEnv, config: Runtime, store: CookieStore): Promise<Identity> {
  const local = localProvider(env);
  if (local.available) {
    const user = local.userFromCookie(store.get(LOCAL_COOKIE)?.value);
    if (user) return { authenticated: true, user };
  }

  const ssoUser = verifySsoToken(store.get(SSO_COOKIE)?.value, config.ssoSecret);
  if (!ssoUser) return { authenticated: false, user: null };

  return {
    authenticated: true,
    user: await config.directory.findByEmail(ssoUser.email),
    displayName: ssoUser.name,
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

/** The signed-in ERP user, or `null`. The profile never comes from the browser. */
export async function getSession(): Promise<Session | null> {
  return sessionFrom((await currentIdentity()).identity);
}

/**
 * Gate for a server page: returns the session or redirects (central login when
 * signed out, "sem acesso" when the e-mail or the profile is not allowed).
 * `path` is where the login sends the user back; it defaults to the item's route.
 */
export async function requirePermission(item: MenuItemKey, path?: string): Promise<Session> {
  const { config, identity } = await currentIdentity();
  const decision = decideAccess(identity, item);

  if (decision.kind === "login") redirect(loginUrl(config.appUrl, path ?? menuItem(item).href));
  if (decision.kind === "no-access") redirect(NO_ACCESS_PATH);
  return decision.session;
}

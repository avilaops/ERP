import { isProduction } from "@/lib/auth/config";
import type { AuthEnv } from "@/lib/auth/config";
import type { DirectoryUser } from "@/lib/auth/directory";
import { isRole, ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";
import { parseTenants } from "@/lib/auth/tenants";
import type { Tenant } from "@/lib/auth/tenants";

/**
 * Local sign-in, one fake user per profile, so the four menus can be exercised
 * without the central auth. It exists only in development and tests, and only
 * when switched on explicitly: its cookie is not signed, so NODE_ENV alone
 * (a server started with `next dev` by mistake) must never be enough.
 */
export const LOCAL_COOKIE = "erp_dev_session";
/** Where the local sign-in lives. Answers 404 when the provider is off. */
export const LOCAL_LOGIN_PATH = "/dev/login";
/** Must be exactly "1" for the local sign-in to exist. */
export const LOCAL_LOGIN_FLAG = "ERP_LOCAL_LOGIN";

const LOCAL_NAMES: Record<Role, string> = {
  DIRETORIA: "Diretoria (teste)",
  GERENTE_COMERCIAL: "Gerente comercial (teste)",
  VENDEDOR: "Vendedor (teste)",
  FINANCEIRO: "Financeiro (teste)",
};

function localUser(role: Role, tenant: Tenant): DirectoryUser {
  return {
    email: `${role.toLowerCase().replace("_", ".")}@teste.local`,
    name: LOCAL_NAMES[role],
    role,
    tenant,
  };
}

/**
 * Needs both: NODE_ENV `development` or `test` (unset or unexpected keeps it
 * off) and ERP_LOCAL_LOGIN=1. In production the flag is ignored.
 */
export function isLocalProviderEnabled(env: AuthEnv): boolean {
  return !isProduction(env) && env[LOCAL_LOGIN_FLAG] === "1";
}

export type LocalProvider =
  | { available: false }
  | {
      available: true;
      /** The companies configured: the local sign-in enters any of them. */
      tenants: Tenant[];
      /** One test user per profile, in the first company. */
      users: DirectoryUser[];
      /** Resolves the value of the local cookie (`PERFIL` or `PERFIL@empresa`) to a user. */
      userFromCookie(value: string | undefined): DirectoryUser | null;
    };

export function localProvider(env: AuthEnv): LocalProvider {
  if (!isLocalProviderEnabled(env)) return { available: false };
  const tenants = parseTenants(env.ERP_TENANTS);
  return {
    available: true,
    tenants,
    users: tenants.length === 0 ? [] : ROLES.map((role) => localUser(role, tenants[0])),
    userFromCookie(value) {
      const [role, slug, ...extra] = (value ?? "").split("@");
      if (!isRole(role) || extra.length > 0) return null;
      const tenant = slug === undefined ? tenants[0] : tenants.find((candidate) => candidate.slug === slug);
      return tenant ? localUser(role, tenant) : null;
    },
  };
}

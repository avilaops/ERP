import { isProduction } from "@/lib/auth/config";
import type { AuthEnv } from "@/lib/auth/config";
import type { DirectoryUser } from "@/lib/auth/directory";
import { isRole, ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";

/**
 * Local sign-in, one fake user per profile, so the four menus can be exercised
 * without the central auth. It exists only in development and tests.
 */
export const LOCAL_COOKIE = "erp_dev_session";

const LOCAL_NAMES: Record<Role, string> = {
  DIRETORIA: "Diretoria (teste)",
  GERENTE_COMERCIAL: "Gerente comercial (teste)",
  VENDEDOR: "Vendedor (teste)",
  FINANCEIRO: "Financeiro (teste)",
};

function localUser(role: Role): DirectoryUser {
  return {
    email: `${role.toLowerCase().replace("_", ".")}@teste.local`,
    name: LOCAL_NAMES[role],
    role,
  };
}

/** Only with NODE_ENV `development` or `test`; unset or unexpected keeps it off. */
export function isLocalProviderEnabled(env: AuthEnv): boolean {
  return !isProduction(env);
}

export type LocalProvider =
  | { available: false }
  | {
      available: true;
      users: DirectoryUser[];
      /** Resolves the value of the local cookie to a user. */
      userFromCookie(value: string | undefined): DirectoryUser | null;
    };

export function localProvider(env: AuthEnv): LocalProvider {
  if (!isLocalProviderEnabled(env)) return { available: false };
  return {
    available: true,
    users: ROLES.map(localUser),
    userFromCookie(value) {
      return isRole(value) ? localUser(value) : null;
    },
  };
}

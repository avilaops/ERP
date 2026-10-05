import { parseErpUsers } from "@/lib/auth/directory";
import type { DirectoryUser } from "@/lib/auth/directory";

export type AuthEnv = Record<string, string | undefined>;

export type AuthConfig = {
  ssoSecret: string;
  /** Public origin of the ERP, without trailing slash. */
  appUrl: string;
  users: DirectoryUser[];
};

function parseAppUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Fail-closed check of everything the login depends on. Throws one error
 * naming every variable that is missing or invalid.
 */
export function assertAuthConfig(env: AuthEnv): AuthConfig {
  const problems: string[] = [];

  const ssoSecret = env.SSO_JWT_SECRET?.trim() ?? "";
  if (ssoSecret === "") problems.push("SSO_JWT_SECRET ausente");

  const rawAppUrl = env.APP_URL?.trim() ?? "";
  const appUrl = rawAppUrl === "" ? null : parseAppUrl(rawAppUrl);
  if (rawAppUrl === "") problems.push("APP_URL ausente");
  else if (appUrl === null) problems.push("APP_URL inválida (esperado http(s)://host)");

  let users: DirectoryUser[] = [];
  if ((env.ERP_USERS?.trim() ?? "") === "") {
    problems.push("ERP_USERS ausente");
  } else {
    try {
      users = parseErpUsers(env.ERP_USERS);
      if (users.length === 0) problems.push("ERP_USERS sem nenhum usuário");
    } catch (error) {
      problems.push(error instanceof Error ? error.message : "ERP_USERS inválida");
    }
  }

  if (problems.length > 0 || appUrl === null) {
    throw new Error(`Configuração de login do ERP inválida: ${problems.join("; ")}.`);
  }

  return { ssoSecret, appUrl, users };
}

/**
 * Everything that is not explicitly development or test is treated as
 * production: an unset or unexpected NODE_ENV gets the strict rules.
 */
export function isProduction(env: AuthEnv): boolean {
  return env.NODE_ENV !== "development" && env.NODE_ENV !== "test";
}

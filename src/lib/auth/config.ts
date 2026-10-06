import { parseErpUsers } from "@/lib/auth/directory";
import type { DirectoryUser } from "@/lib/auth/directory";
import { parseTenants } from "@/lib/auth/tenants";
import type { Tenant } from "@/lib/auth/tenants";

export type AuthEnv = Record<string, string | undefined>;

export type AuthConfig = {
  ssoSecret: string;
  /** Public origin of the ERP, without trailing slash. */
  appUrl: string;
  tenants: Tenant[];
  users: DirectoryUser[];
};

/** Shortest SSO_JWT_SECRET accepted in production. */
export const MIN_SSO_SECRET_LENGTH = 32;
/** Placeholder shipped in `.env.example`; it is public, so it is never a secret. */
export const EXAMPLE_SSO_SECRET = "troque-por-um-segredo-longo-e-aleatorio";

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
 *
 * In production it also refuses a weak secret (short, or the `.env.example`
 * placeholder) and an APP_URL that is not https.
 */
export function assertAuthConfig(env: AuthEnv): AuthConfig {
  const problems: string[] = [];
  const strict = isProduction(env);

  const ssoSecret = env.SSO_JWT_SECRET?.trim() ?? "";
  if (ssoSecret === "") problems.push("SSO_JWT_SECRET ausente");
  else if (strict && ssoSecret === EXAMPLE_SSO_SECRET) {
    problems.push("SSO_JWT_SECRET é o valor de exemplo do .env.example");
  } else if (strict && ssoSecret.length < MIN_SSO_SECRET_LENGTH) {
    problems.push(`SSO_JWT_SECRET curto (mínimo de ${MIN_SSO_SECRET_LENGTH} caracteres em produção)`);
  }

  const rawAppUrl = env.APP_URL?.trim() ?? "";
  const appUrl = rawAppUrl === "" ? null : parseAppUrl(rawAppUrl);
  if (rawAppUrl === "") problems.push("APP_URL ausente");
  else if (appUrl === null) problems.push("APP_URL inválida (esperado http(s)://host)");
  else if (strict && !appUrl.startsWith("https://")) {
    problems.push("APP_URL sem https (obrigatório em produção)");
  }

  let tenants: Tenant[] = [];
  if ((env.ERP_TENANTS?.trim() ?? "") === "") {
    problems.push("ERP_TENANTS ausente");
  } else {
    try {
      tenants = parseTenants(env.ERP_TENANTS);
      if (tenants.length === 0) problems.push("ERP_TENANTS sem nenhuma empresa");
    } catch (error) {
      problems.push(error instanceof Error ? error.message : "ERP_TENANTS inválida");
    }
  }

  let users: DirectoryUser[] = [];
  if ((env.ERP_USERS?.trim() ?? "") === "") {
    problems.push("ERP_USERS ausente");
  } else if (tenants.length > 0) {
    try {
      users = parseErpUsers(env.ERP_USERS, tenants);
      if (users.length === 0) problems.push("ERP_USERS sem nenhum usuário");
    } catch (error) {
      problems.push(error instanceof Error ? error.message : "ERP_USERS inválida");
    }
  }

  if (problems.length > 0 || appUrl === null) {
    throw new Error(`Configuração de login do ERP inválida: ${problems.join("; ")}.`);
  }

  return { ssoSecret, appUrl, tenants, users };
}

/**
 * Everything that is not explicitly development or test is treated as
 * production: an unset or unexpected NODE_ENV gets the strict rules.
 */
export function isProduction(env: AuthEnv): boolean {
  return env.NODE_ENV !== "development" && env.NODE_ENV !== "test";
}

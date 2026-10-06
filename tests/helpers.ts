import jwt from "jsonwebtoken";

/** 32+ characters: production refuses a shorter SSO_JWT_SECRET. */
export const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
export const APP_URL = "https://erp.teste.local";
/** One company, as most tests need: `ERP_USERS` may then leave the company out. */
export const TENANTS = "ludus:Ludus Equipamentos";
export const LUDUS = { slug: "ludus", name: "Ludus Equipamentos", hosts: [] as string[] };

declare global {
  var __TEST_HEADERS__: Map<string, string> | undefined;
}

/** Headers the stubbed `next/headers` will hand to the code under test (the host, mostly). */
export function setHeaders(headers: Record<string, string>): void {
  globalThis.__TEST_HEADERS__ = new Map(Object.entries(headers));
}

declare global {
  var __TEST_COOKIES__: Map<string, string> | undefined;
}

/** Cookies the stubbed `next/headers` will hand to the code under test. */
export function setCookies(cookies: Record<string, string>): void {
  globalThis.__TEST_COOKIES__ = new Map(Object.entries(cookies));
}

export function ssoToken(
  claims: Record<string, unknown> = {},
  options: { secret?: string; issuer?: string; expiresIn?: number } = {},
): string {
  return jwt.sign(
    { sub: "u1", email: "dir@teste.local", nome: "Diana Diretora", foto: null, papel: "CLIENTE", ...claims },
    options.secret ?? SECRET,
    { issuer: options.issuer ?? "auth.avilaops.com", expiresIn: options.expiresIn ?? 3600 },
  );
}

/** Runs `fn` with the given variables set (undefined removes one), then restores. */
export async function withEnv<T>(
  vars: Record<string, string | undefined>,
  fn: () => T | Promise<T>,
): Promise<T> {
  const env = process.env as Record<string, string | undefined>;
  const before = Object.fromEntries(Object.keys(vars).map((key) => [key, env[key]]));
  const apply = (values: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  };
  apply(vars);
  try {
    return await fn();
  } finally {
    apply(before);
  }
}

/** The URL a call redirected to, or `null` when it returned normally. */
export async function redirectOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (thrown) {
    if (typeof thrown === "object" && thrown !== null && "redirect" in thrown) {
      return String(thrown.redirect);
    }
    throw thrown;
  }
}

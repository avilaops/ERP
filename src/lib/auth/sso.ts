import jwt from "jsonwebtoken";

/** Session cookie written by auth.avilaops.com on `.avilaops.com`. */
export const SSO_COOKIE = "avila_sso";
export const SSO_ISSUER = "auth.avilaops.com";
export const SSO_LOGIN_URL = "https://auth.avilaops.com/login";
export const SSO_LOGOUT_URL = "https://auth.avilaops.com/api/auth/logout";
/** Id of this app in the central auth registry. */
export const SSO_APP_ID = "erp";

export type SsoUser = {
  email: string;
  name: string;
};

/**
 * Validates the central auth token locally. Anything wrong with it (signature,
 * issuer, expiry, shape, missing secret) yields `null`.
 *
 * The SSO `papel` claim is deliberately not returned: the ERP profile comes
 * from the ERP's own user directory.
 */
export function verifySsoToken(token: string | undefined, secret: string | undefined): SsoUser | null {
  if (!token || !secret) return null;
  try {
    const payload = jwt.verify(token, secret, { issuer: SSO_ISSUER, algorithms: ["HS256"] });
    if (typeof payload === "string") return null;
    const { email, nome } = payload;
    if (typeof email !== "string" || email.trim() === "") return null;
    return { email, name: typeof nome === "string" && nome.trim() !== "" ? nome : email };
  } catch {
    return null;
  }
}

/** Where a signed-out visitor goes; `returnTo` brings them back to `path`. */
export function loginUrl(appUrl: string, path: string): string {
  const returnTo = new URL(path, appUrl).toString();
  const params = new URLSearchParams({ app: SSO_APP_ID, returnTo });
  return `${SSO_LOGIN_URL}?${params.toString()}`;
}

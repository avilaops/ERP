import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { TENANT_SLUG } from "@/lib/auth/tenants";

/**
 * The pieces of OAuth 2.1 the ERP needs to let an assistant act for a person:
 * who the application is, the one-use code of an authorisation and the keys
 * it is exchanged for. Pure: nothing here reads a database or a request.
 */
export const SCOPE = "erp";
export const CODE_MINUTES = 5;
export const ACCESS_MINUTES = 60;
export const REFRESH_DAYS = 30;

export type OauthClient = { clientId: string; name: string; redirectUris: string[] };

/** Where an application may be sent back to: https anywhere, or http on the person's own machine. Nothing else, and no fragment. */
export function isRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (value.length > 500 || url.hash !== "" || url.username !== "" || url.password !== "") return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

const clientKey = (secret: string) => createHmac("sha256", secret).update("erp-mcp-client").digest();

/**
 * Registers an application without storing anything: its name and the
 * addresses it may be sent back to are signed into its own identifier. An
 * identifier nobody signed, or changed after, is not an application.
 */
export function registerClient(input: { name: unknown; redirectUris: unknown }, secret: string): OauthClient {
  const uris = Array.isArray(input.redirectUris) ? input.redirectUris.filter((uri): uri is string => typeof uri === "string") : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(isRedirectUri)) throw new Error("invalid_redirect_uri");
  const name = (typeof input.name === "string" ? input.name : "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 80) || "Aplicativo sem nome";
  const clientId = jwt.sign({ n: name, r: uris }, clientKey(secret), { algorithm: "HS256", audience: "erp-mcp-client", noTimestamp: true });
  return { clientId, name, redirectUris: uris };
}

/** The application an identifier stands for, or `null` for one this ERP did not sign. */
export function clientOf(clientId: string, secret: string | undefined): OauthClient | null {
  if (!secret || clientId.length > 4000) return null;
  try {
    const payload = jwt.verify(clientId, clientKey(secret), { algorithms: ["HS256"], audience: "erp-mcp-client" });
    if (typeof payload === "string" || typeof payload.n !== "string" || !Array.isArray(payload.r) || !payload.r.every((uri: unknown) => typeof uri === "string" && isRedirectUri(uri))) return null;
    return { clientId, name: payload.n, redirectUris: payload.r as string[] };
  } catch {
    return null;
  }
}

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** PKCE (S256): the code is only exchanged by who holds what its challenge was made from. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return false;
  const made = createHash("sha256").update(verifier).digest();
  const sent = Buffer.from(challenge, "base64url");
  return sent.length === made.length && timingSafeEqual(sent, made);
}

export type SecretKind = "code" | "access" | "refresh";
const PREFIX: Record<SecretKind, string> = { code: "erpc", access: "erpmcp", refresh: "erpr" };

/** A new code or key: `<kind>_<empresa>_<segredo>`. The company is in it so the request finds its database; only the hash is stored. */
export function newSecret(kind: SecretKind, tenant: string): string {
  let secret = randomBytes(32).toString("base64url");
  while (secret.startsWith("_")) secret = randomBytes(32).toString("base64url");
  return `${PREFIX[kind]}_${tenant}_${secret}`;
}

/** The company a code or key of this kind says it is of, or `null` for what is not one. */
export function tenantOfSecret(kind: SecretKind, value: string): string | null {
  const head = `${PREFIX[kind]}_`;
  if (!value.startsWith(head) || !new RegExp(`^${head}[a-z][a-z0-9_]{1,30}_[A-Za-z0-9-][A-Za-z0-9_-]{42}$`).test(value)) return null;
  const tenant = value.slice(head.length, -44);
  return TENANT_SLUG.test(tenant) ? tenant : null;
}

export const hashSecret = (value: string) => sha256(`mcp:${value}`);

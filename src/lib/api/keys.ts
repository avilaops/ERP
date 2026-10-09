import { createHash, createHmac, randomBytes } from "node:crypto";
import { TENANT_SLUG } from "@/lib/auth/tenants";

/**
 * A key of the API: `erp_<empresa>_<segredo>`. The company is in the key so a
 * request finds its database; it gives nothing by itself, because the secret
 * (32 random bytes) has to match a key of that company, and only the hash of
 * the whole key is ever stored.
 */
export function newApiKey(tenant: string): { key: string; prefix: string; hash: string } {
  const key = `erp_${tenant}_${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, 5 + tenant.length + 6), hash: hashApiKey(key) };
}

export const hashApiKey = (key: string) => createHash("sha256").update(`api:${key}`).digest("hex");

/** The company a key says it is of, or `null` for what is not a key. */
export function tenantOfKey(key: string): string | null {
  const match = /^erp_([a-z][a-z0-9_]{1,30})_[A-Za-z0-9_-]{43}$/.exec(key);
  return match && TENANT_SLUG.test(match[1]) ? match[1] : null;
}

/** A new secret to sign the notices of one address. */
export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

/**
 * The signature a notice carries (`X-ERP-Assinatura: t=<segundos>,v1=<hmac>`):
 * HMAC-SHA256 of `<segundos>.<corpo>` with the secret of the address. Who
 * receives recomputes it and refuses an old `t`: a copied notice cannot be replayed later.
 */
export function signWebhook(secret: string, body: string, at: Date): string {
  const seconds = Math.floor(at.getTime() / 1000);
  return `t=${seconds},v1=${createHmac("sha256", secret).update(`${seconds}.${body}`).digest("hex")}`;
}

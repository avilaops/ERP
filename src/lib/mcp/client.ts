import { AddressError, checkPublicUrl } from "@/lib/api/address";
import { clientOf, isRedirectUri } from "@/lib/mcp/oauth";
import type { OauthClient } from "@/lib/mcp/oauth";

type Fetcher = (url: string, init: { headers: Record<string, string>; redirect: "error"; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>;
type Resolver = Parameters<typeof checkPublicUrl>[1];

/** What was read of an application that names itself by an address, kept for a while so each screen does not ask again. */
const read = new Map<string, { at: number; client: OauthClient | null }>();
const KEEP_MS = 10 * 60_000;

/**
 * The application an identifier stands for. Two kinds are known: the one this
 * ERP signed at the registration, and the one that is an https address where
 * the application publishes who it is (Client ID Metadata Document). The
 * address is only fetched when it is public (never a machine of the internal
 * network), without following redirects, and what comes back has to name that
 * very address as its identifier. Anything else is no application.
 */
export async function resolveClient(clientId: string, secret: string | undefined, now: number = Date.now(), fetcher: Fetcher = fetch, resolve?: Resolver): Promise<OauthClient | null> {
  const signed = clientOf(clientId, secret);
  if (signed) return signed;
  if (clientId.length > 500 || !/^https:\/\/[^\s?#]+\/[^\s?#]+$/.test(clientId)) return null;
  const known = read.get(clientId);
  if (known && now - known.at < KEEP_MS) return known.client;
  const client = await fetchClient(clientId, fetcher, resolve);
  read.set(clientId, { at: now, client });
  if (read.size > 500) for (const [key, value] of read) if (now - value.at >= KEEP_MS) read.delete(key);
  return client;
}

async function fetchClient(clientId: string, fetcher: Fetcher, resolve?: Resolver): Promise<OauthClient | null> {
  try {
    await checkPublicUrl(clientId, resolve);
    const response = await fetcher(clientId, { headers: { Accept: "application/json", "User-Agent": "ERP-Avila-Ops/1 (+https://erp.avilaops.com)" }, redirect: "error", signal: AbortSignal.timeout(5_000) });
    if (response.status !== 200) return null;
    const raw = await response.text();
    if (raw.length > 20_000) return null;
    const document = JSON.parse(raw) as { client_id?: unknown; client_name?: unknown; redirect_uris?: unknown };
    const uris = Array.isArray(document.redirect_uris) ? document.redirect_uris.filter((uri): uri is string => typeof uri === "string") : [];
    if (document.client_id !== clientId || uris.length === 0 || uris.length > 10 || !uris.every(isRedirectUri)) return null;
    const name = (typeof document.client_name === "string" ? document.client_name : "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 80) || new URL(clientId).host;
    return { clientId, name, redirectUris: uris };
  } catch (error) {
    if (!(error instanceof AddressError || error instanceof SyntaxError || error instanceof Error)) throw error;
    return null;
  }
}

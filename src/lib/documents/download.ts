import { request } from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress } from "@/lib/api/address";

export const MAX_DOWNLOAD_BYTES = 32_000_000;
export const NFE_HOSTS = ["www.nfe.fazenda.gov.br", "nfe.fazenda.gov.br"];

export class DownloadError extends Error {
  readonly status: number | null;
  readonly retryAfter: number;
  readonly transient: boolean;
  constructor(message: string, status: number | null = null, retryAfter = 0, transient = false) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.transient = transient;
  }
}

/** Preserve significant query bytes, including '+' (URLSearchParams would decode it). */
export function documentUrl(raw: string, base?: string): string {
  const url = new URL(raw, base);
  url.hash = "";
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new DownloadError("Somente HTTPS público na porta padrão.");
  return url.href;
}

export function allowedDocumentUrl(raw: string, hosts: readonly string[]): boolean {
  try {
    const u = new URL(documentUrl(raw));
    return hosts.includes(u.hostname) && !isIP(u.hostname);
  } catch { return false; }
}

/** Resolve once, reject every non-public answer and pin the TLS connection to that IP. */
export async function downloadDocument(raw: string, hosts: readonly string[], conditional: { etag?: string; modified?: string } = {}) {
  let current = documentUrl(raw);
  const seen = new Set<string>();
  const cookies = new Map<string, string>();
  for (let redirects = 0; redirects <= 8; redirects++) {
    if (!allowedDocumentUrl(current, hosts)) throw new DownloadError("Destino fora da lista de hosts permitidos.");
    if (seen.has(current)) throw new DownloadError("Loop de redirecionamento na fonte.");
    seen.add(current);
    const u = new URL(current);
    const addresses = await lookup(u.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address) || address.startsWith("2001:db8:") || address.startsWith("192.0.2.") || address.startsWith("198.51.100.") || address.startsWith("203.0.113."))) throw new DownloadError("Fonte resolve para endereço interno ou reservado.");
    const address = addresses[0];
    const result = await new Promise<{ status: number; headers: import("node:http").IncomingHttpHeaders; bytes: Buffer }>((resolve, reject) => {
      const req = request(u, {
        agent: false,
        family: address.family,
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
        headers: {
          "User-Agent": "AvilaERP-Documents/1 (+https://erp.avilaops.com)",
          Accept: "*/*", "Accept-Encoding": "identity",
          ...(cookies.has(u.hostname) ? { Cookie: cookies.get(u.hostname)! } : {}),
          ...(conditional.etag ? { "If-None-Match": conditional.etag } : {}),
          ...(conditional.modified ? { "If-Modified-Since": conditional.modified } : {}),
        },
      }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_DOWNLOAD_BYTES) { res.destroy(new DownloadError("Download excede 32 MB.")); return; }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, bytes: Buffer.concat(chunks) }));
      });
      const deadline = setTimeout(() => req.destroy(new DownloadError("Tempo total de download excedido.", null, 0, true)), 60_000);
      req.on("close", () => clearTimeout(deadline));
      req.on("error", reject);
      req.setTimeout(20_000, () => req.destroy(new DownloadError("Fonte não respondeu no prazo.", null, 0, true)));
      req.end();
    });
    const setCookies = result.headers["set-cookie"];
    if (setCookies) cookies.set(u.hostname, setCookies.map((c) => c.split(";")[0]).join("; "));
    if ([301, 302, 303, 307, 308].includes(result.status)) {
      if (!result.headers.location) throw new DownloadError("Redirecionamento sem destino.");
      current = documentUrl(result.headers.location, current);
      continue;
    }
    if (result.status !== 200 && result.status !== 304) {
      const retry = Number(result.headers["retry-after"]);
      throw new DownloadError(`Fonte respondeu HTTP ${result.status}.`, result.status, Number.isFinite(retry) ? Math.min(86_400, retry) : 60);
    }
    return { ...result, url: current };
  }
  throw new DownloadError("Limite de redirecionamentos excedido.");
}

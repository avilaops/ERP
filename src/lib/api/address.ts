import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** A refusal the user can act on. */
export class AddressError extends Error {}

/** Whether an IP address is one of a private, local or reserved network: never a place for a notice to go. */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
}

/**
 * Checks where a notice is about to go: only `https`, on the standard port or
 * 8443, to a name (not a bare IP) that resolves to public addresses only. This
 * is what keeps an address typed by a company from making the server talk to
 * its own network or to the other systems that live next to it.
 */
export async function checkPublicUrl(raw: string, resolve: (host: string) => Promise<string[]> = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address)): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AddressError("Endereço inválido. Ele começa com https://.");
  }
  if (url.protocol !== "https:") throw new AddressError("O endereço precisa começar com https://.");
  if (url.username !== "" || url.password !== "") throw new AddressError("O endereço não pode levar usuário e senha.");
  if (url.port !== "" && url.port !== "443" && url.port !== "8443") throw new AddressError("Porta não aceita: use a padrão (443) ou 8443.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0 || !host.includes(".") || /\.(local|internal|localhost|lan|avilaops)$/i.test(host) || /^localhost$/i.test(host)) {
    throw new AddressError("O endereço precisa ser um nome público na internet, não um IP nem um nome da rede interna.");
  }
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new AddressError("O nome do endereço não foi encontrado.");
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new AddressError("Este endereço aponta para uma rede interna e não pode receber avisos.");
  return url;
}

/**
 * The account of a person in the central login (auth.avilaops.com), asked for
 * by the ERP when a company invites someone. The central login answers whether
 * the account was created now and, only then, the address where the person
 * sets the password. That address is a key to the account: it goes to the
 * person's e-mail and nowhere else, never to a screen or a log.
 */
export class ProvisionError extends Error {}

export type ProvisionConfig = { url: string; clientId: string; secret: string };

/** How the ERP reaches the central login, or `null` while the credential is not on this server. */
export function provisionConfig(env: Record<string, string | undefined>): ProvisionConfig | null {
  const secret = env.ERP_AUTH_CLIENT_SECRET?.trim() ?? "";
  if (secret === "") return null;
  const url = (env.ERP_AUTH_URL?.trim() || "https://auth.avilaops.com").replace(/\/+$/, "");
  // The credential never travels in the clear.
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(url)) throw new ProvisionError("ERP_AUTH_URL inválida: precisa ser um endereço https.");
  return { url, clientId: env.ERP_AUTH_CLIENT_ID?.trim() || "erp", secret };
}

export type Provisioned = {
  /** The account did not exist and was created by this call. */
  created: boolean;
  /** Where the person sets the password; only for an account created now. */
  invite: string | null;
};

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>;

/**
 * Makes sure the person has an account in the central login. A refusal of the
 * central login the company can act on comes back as `ProvisionError`, with
 * the words of the central login.
 */
export async function provisionAccess(config: ProvisionConfig, person: { email: string; name: string }, fetcher: Fetcher = fetch): Promise<Provisioned> {
  const basic = Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.secret)}`).toString("base64");
  let response: Awaited<ReturnType<Fetcher>>;
  try {
    response = await fetcher(`${config.url}/api/provisionamento/acessos`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: person.email, nome: person.name.slice(0, 120) }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ProvisionError("O login central não respondeu. Tente enviar o convite de novo em instantes.");
  }
  const body = (await response.json().catch(() => null)) as { criada?: unknown; convite?: unknown; error?: unknown } | null;
  if (response.status === 401) throw new ProvisionError("O login central recusou a credencial do ERP. Avise a Ávila Ops.");
  if (response.status !== 200 && response.status !== 201) {
    throw new ProvisionError(typeof body?.error === "string" && body.error.length <= 200 ? body.error : `O login central respondeu ${response.status}.`);
  }
  const invite = typeof body?.convite === "string" ? body.convite : null;
  // Only an address of the central login itself is ever sent on to the person.
  if (invite !== null && !invite.startsWith(`${config.url}/recuperar/`)) throw new ProvisionError("O login central devolveu um endereço de convite inesperado.");
  return { created: body?.criada === true, invite };
}

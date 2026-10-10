import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A call made by the system: the telephony provider (Twilio) rings the seller
 * and, when they answer, connects them to the customer. Nothing is recorded.
 * The credentials are the server's; without them the feature is simply not there.
 */
export class VoiceError extends Error {}

export type VoiceConfig = { accountSid: string; authToken: string; from: string };

/** The provider's account and the number the calls leave from (`ERP_TWILIO_VOICE_FROM`, as `+5511…`), or `null` when the server has none. */
export function voiceConfig(env: Record<string, string | undefined> = process.env): VoiceConfig | null {
  const accountSid = env.ERP_TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = env.ERP_TWILIO_AUTH_TOKEN?.trim() ?? "";
  const from = env.ERP_TWILIO_VOICE_FROM?.trim() ?? "";
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid) || authToken === "" || !/^\+[1-9]\d{9,14}$/.test(from)) return null;
  return { accountSid, authToken, from };
}

export type CallRequest = { seller: string; customer: string; /** Where the provider tells how the call ended. */ statusUrl?: string | null };
export type CallStarter = (config: VoiceConfig, call: CallRequest) => Promise<{ id: string }>;

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>;

/**
 * Asks the provider to ring the seller and connect them to the customer. Both
 * numbers are digits with the country code, checked here again: they go inside
 * the instructions of the call, and nothing else may go with them.
 */
export async function startCall(config: VoiceConfig, call: CallRequest, fetcher: Fetcher = fetch): Promise<{ id: string }> {
  if (!/^55\d{10,11}$/.test(call.seller) || !/^55\d{10,11}$/.test(call.customer)) throw new VoiceError("Telefone inválido para a ligação.");
  const twiml = `<Response><Say language="pt-BR">Conectando com o cliente.</Say><Dial callerId="${config.from}" timeout="30"><Number>+${call.customer}</Number></Dial></Response>`;
  let response: Awaited<ReturnType<Fetcher>>;
  try {
    response = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: `+${call.seller}`, From: config.from, Twiml: twiml, ...(call.statusUrl ? { StatusCallback: call.statusUrl, StatusCallbackEvent: "completed", StatusCallbackMethod: "POST" } : {}) }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new VoiceError("O serviço de telefonia não respondeu. Tente de novo.");
  }
  const body = (await response.json().catch(() => null)) as { sid?: unknown; message?: unknown } | null;
  if (response.status !== 201 && response.status !== 200) throw new VoiceError(`O serviço de telefonia recusou a ligação (${response.status})${typeof body?.message === "string" ? `: ${body.message.replace(/[\r\n]+/g, " ").slice(0, 160)}` : ""}.`);
  if (typeof body?.sid !== "string" || body.sid === "") throw new VoiceError("O serviço de telefonia não confirmou a ligação.");
  return { id: body.sid };
}

/**
 * Whether a notice really came from the provider: the address it was sent to
 * and its fields in alphabetical order, signed with the account's token
 * (`X-Twilio-Signature`, HMAC-SHA1 in base64).
 */
export function signedByProvider(url: string, fields: Record<string, string>, header: string | null, authToken: string): boolean {
  if (!header || authToken === "") return false;
  const text = Object.keys(fields).sort().reduce((whole, key) => whole + key + fields[key], url);
  const expected = createHmac("sha1", authToken).update(text, "utf8").digest();
  const sent = Buffer.from(header, "base64");
  return sent.length === expected.length && timingSafeEqual(sent, expected);
}

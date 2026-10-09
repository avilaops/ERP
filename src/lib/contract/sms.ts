/**
 * The second code of a signature, sent to the mobile phone of who signs. The
 * ERP talks to one provider of SMS (Twilio) with the credentials of the
 * server; without them the second code is simply not available, and the screen says so.
 */
export class SmsError extends Error {}

export type SmsConfig = { accountSid: string; authToken: string; from: string };

export function smsConfig(env: Record<string, string | undefined>): SmsConfig | null {
  const accountSid = env.ERP_TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = env.ERP_TWILIO_AUTH_TOKEN?.trim() ?? "";
  const from = env.ERP_TWILIO_FROM?.trim() ?? "";
  if (accountSid === "" || authToken === "" || from === "") return null;
  if (!/^AC[0-9a-fA-F]{32}$/.test(accountSid)) throw new SmsError("ERP_TWILIO_ACCOUNT_SID inválido.");
  return { accountSid, authToken, from };
}

/** Whether the second code can be sent from this server. A configuration that does not parse counts as none. */
export function smsAvailable(env: Record<string, string | undefined>): boolean {
  try {
    return smsConfig(env) !== null;
  } catch {
    return false;
  }
}

/**
 * A Brazilian mobile number as typed, with or without the country code, as the
 * digits a provider takes (`5517999998888`). `null` for what is not a mobile
 * number: a landline cannot receive the code.
 */
export function mobileNumber(typed: string): string | null {
  let digits = typed.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  // DDD and nine digits starting with 9.
  return /^[1-9]\d9\d{8}$/.test(digits) ? `55${digits}` : null;
}

/** `(17) 9****-8888`: enough for the signer to know which phone, not enough to copy. */
export function maskedPhone(number: string): string {
  const local = number.slice(-11);
  return `(${local.slice(0, 2)}) ${local[2]}****-${local.slice(-4)}`;
}

export type SmsSender = (config: SmsConfig, to: string, text: string) => Promise<void>;

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>;

/** Hands one message to the provider. The text is never logged: it carries the code. */
export async function sendSms(config: SmsConfig, to: string, text: string, fetcher: Fetcher = fetch): Promise<void> {
  let response: Awaited<ReturnType<Fetcher>>;
  try {
    response = await fetcher(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: `+${to}`, From: config.from, Body: text }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SmsError("O serviço de SMS não respondeu.");
  }
  if (response.status === 201 || response.status === 200) return;
  const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
  throw new SmsError(`O serviço de SMS recusou o envio (${response.status})${typeof body?.message === "string" ? `: ${body.message.slice(0, 160)}` : ""}.`);
}

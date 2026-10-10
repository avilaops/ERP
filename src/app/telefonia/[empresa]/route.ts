import { noteCallEnded } from "@/lib/db/voice";
import { signedByProvider, voiceConfig } from "@/lib/voice/call";
import { callStatusUrl, openCallHook } from "@/lib/voice/public";

/**
 * Where the telephony provider tells how a call made by the system ended. No
 * session: the notice is believed only when it is signed with the token of
 * the server's account, for the very address it was asked to be sent to.
 * Every refusal answers the same.
 */
const NOT_FOUND = () => new Response(null, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ empresa: string }> }): Promise<Response> {
  const config = voiceConfig();
  const hook = config ? await openCallHook((await params).empresa).catch(() => null) : null;
  const url = hook ? callStatusUrl(hook.slug) : null;
  if (!config || !hook || !url) return NOT_FOUND();
  const body = await request.text();
  if (body.length > 20_000) return NOT_FOUND();
  const fields = Object.fromEntries(new URLSearchParams(body));
  if (!signedByProvider(url, fields, request.headers.get("x-twilio-signature"), config.authToken)) return NOT_FOUND();
  const seconds = /^\d{1,6}$/.test(fields.CallDuration ?? "") ? Number(fields.CallDuration) : null;
  await noteCallEnded(String(fields.CallSid ?? ""), String(fields.CallStatus ?? ""), seconds, hook.conn);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

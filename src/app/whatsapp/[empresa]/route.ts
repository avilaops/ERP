import { timingSafeEqual } from "node:crypto";
import { receiveWhatsapp } from "@/lib/db/whatsapp";
import { vaultKey } from "@/lib/fiscal/certificate";
import { eventsOf, signedByMeta } from "@/lib/whatsapp/api";
import { openWhatsappHook } from "@/lib/whatsapp/public";

/**
 * Where Meta tells the ERP what happened on the company's WhatsApp number. No
 * session: a GET is Meta checking the address (it gets its challenge back only
 * with the word this company was given), and a POST is believed only when its
 * body is signed with the secret of the company's application. Every refusal
 * answers the same, so nobody learns which company exists.
 */
const NOT_FOUND = () => new Response(null, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });
const key = () => vaultKey(process.env.ERP_CERT_KEY);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(request: Request, { params }: { params: Promise<{ empresa: string }> }): Promise<Response> {
  const hook = await openWhatsappHook((await params).empresa, key).catch(() => null);
  const query = new URL(request.url).searchParams;
  const challenge = query.get("hub.challenge") ?? "";
  if (!hook || query.get("hub.mode") !== "subscribe" || !same(query.get("hub.verify_token") ?? "", hook.account.verifyToken) || !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)) return NOT_FOUND();
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ empresa: string }> }): Promise<Response> {
  const hook = await openWhatsappHook((await params).empresa, key).catch(() => null);
  if (!hook) return NOT_FOUND();
  const body = await request.text();
  if (body.length > 1_000_000 || !signedByMeta(body, request.headers.get("x-hub-signature-256"), hook.account.secret)) return NOT_FOUND();
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NOT_FOUND();
  }
  await receiveWhatsapp(eventsOf(payload, hook.account.phoneNumberId), new Date(), hook.conn);
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}

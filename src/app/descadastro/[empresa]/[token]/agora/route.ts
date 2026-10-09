import { unsubscribeByToken } from "@/lib/db/optout";
import { openUnsubscribe } from "@/lib/marketing/public";

/**
 * The one-click way out (RFC 8058): the mail program of who received posts
 * here, with nobody on a page. Only a POST takes the address off; a link
 * followed by a scanner (a GET) changes nothing.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ empresa: string; token: string }> }): Promise<Response> {
  const { empresa, token } = await params;
  const open = await openUnsubscribe(empresa, token);
  if (!open) return new Response(null, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  await unsubscribeByToken(open.token, open.conn);
  return new Response(null, { status: 204, headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "private, no-store" } });
}

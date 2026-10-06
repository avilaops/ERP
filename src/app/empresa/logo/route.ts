import { getSession } from "@/lib/auth";
import { loadLogo } from "@/lib/db/company";
import { tenantDb } from "@/lib/db/pool";

/**
 * The logo of the company of the session. Only for who is signed in, and always
 * the one of their own company: the address carries no company at all.
 */
export async function GET(): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Not Found", { status: 404 });

  const logo = await loadLogo(tenantDb(session.tenant.slug));
  if (!logo) return new Response("Not Found", { status: 404 });

  return new Response(new Uint8Array(logo.bytes), {
    headers: {
      "Content-Type": logo.type,
      // Per person: the same address answers with another company's logo for someone else.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

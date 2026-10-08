import { getSession } from "@/lib/auth/index";
import { allows } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { loadSupplierItemPhoto } from "@/lib/db/supplier-items";

/**
 * The photo of one item of the supplier's catalogue, of the company of the
 * session. The catalogue says who the supplier is and what it sells: only who
 * has Produtos e custos sees it. Profile and company come from the session alone.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(request: Request, context: Context): Promise<Response> {
  const session = await getSession();
  if (!session) return text("Entre no sistema para continuar.", 401);
  if (!allows(session, "produtos")) return text("Seu perfil não vê o catálogo do fornecedor.", 403);

  const { id } = await context.params;
  const photo = /^[1-9]\d{0,8}$/.test(id) ? await loadSupplierItemPhoto(Number(id), tenantDb(session.tenant.slug)) : null;
  if (!photo) return text("Foto não encontrada.", 404);

  const etag = `"${photo.sha256}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(photo.bytes), { headers: { ...headers, "Content-Type": "image/jpeg" } });
}

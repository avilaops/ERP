import { getSession } from "@/lib/auth/index";
import type { Session } from "@/lib/auth/index";
import { canAccess } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { deleteProductPhoto, loadProductPhoto, saveProductPhoto } from "@/lib/db/product-photos";
import { ProductError } from "@/lib/db/products";
import { MAX_UPLOAD_BYTES, PhotoError, TOO_LARGE_MESSAGE } from "@/lib/photos/normalize";

/**
 * The photo of one product, of the company of the session. The only way a photo
 * leaves the system. Anyone signed in sees it; only who has the item Produtos
 * replaces or removes it. Profile, e-mail and company come from the session
 * alone: nothing of them is read from the body, a header or the address.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

const UNAUTHENTICATED = () => text("Entre no sistema para continuar.", 401);
const FORBIDDEN = () => text("Seu perfil não pode alterar fotos.", 403);
const NOT_FOUND = () => text("Foto não encontrada.", 404);

/** A positive integer, or `null`: anything else is not the id of a product. */
async function productId({ params }: Context): Promise<number | null> {
  const { id } = await params;
  const value = /^[1-9]\d{0,9}$/.test(id) ? Number(id) : null;
  return value !== null && value <= 2_147_483_647 ? value : null;
}

/** The session of who may change photos, or the refusal to answer with. */
function editor(session: Session | null): Session | Response {
  if (!session) return UNAUTHENTICATED();
  return canAccess(session.role, "produtos") ? session : FORBIDDEN();
}

/** The body, or `null` once it passes the limit: the rest is not read. */
async function readLimited(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Whether `If-None-Match` names this ETag. The header may carry a list, `*`, or
 * the weak form `W/"…"` a proxy adds; the comparison is the weak one (RFC 9110).
 */
function matchesEtag(header: string | null, etag: string): boolean {
  if (header === null) return false;
  return header.split(",").some((candidate) => {
    const value = candidate.trim();
    return value === "*" || value.replace(/^W\//, "") === etag;
  });
}

export async function GET(request: Request, context: Context): Promise<Response> {
  const session = await getSession();
  if (!session) return UNAUTHENTICATED();
  const id = await productId(context);
  if (id === null) return NOT_FOUND();

  const photo = await loadProductPhoto(id, tenantDb(session.tenant.slug));
  if (!photo) return NOT_FOUND();

  const etag = `"${photo.sha256}"`;
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (matchesEtag(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(photo.bytes), {
    status: 200,
    headers: { ...headers, "Content-Type": photo.mimeType, "Content-Length": String(photo.bytes.length) },
  });
}

export async function PUT(request: Request, context: Context): Promise<Response> {
  const session = editor(await getSession());
  if (session instanceof Response) return session;

  // Refused by the declared size, before a byte of the body is read.
  const declared = request.headers.get("content-length") ?? "";
  if (!/^\d+$/.test(declared) || Number(declared) > MAX_UPLOAD_BYTES) return text(TOO_LARGE_MESSAGE, 413);
  const id = await productId(context);
  if (id === null) return NOT_FOUND();

  const body = await readLimited(request);
  if (body === null) return text(TOO_LARGE_MESSAGE, 413);

  try {
    await saveProductPhoto(id, body, session.email, tenantDb(session.tenant.slug));
  } catch (error) {
    if (error instanceof PhotoError) return text(error.message, 415);
    if (error instanceof ProductError) return NOT_FOUND();
    throw error;
  }
  return new Response(null, { status: 204 });
}

export async function DELETE(_request: Request, context: Context): Promise<Response> {
  const session = editor(await getSession());
  if (session instanceof Response) return session;
  const id = await productId(context);
  if (id === null) return NOT_FOUND();

  const removed = await deleteProductPhoto(id, tenantDb(session.tenant.slug));
  return removed ? new Response(null, { status: 204 }) : NOT_FOUND();
}

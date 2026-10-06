import { getSession } from "@/lib/auth/index";
import { allows, seesAllOrders } from "@/lib/auth/permissions";
import { loadLogo } from "@/lib/db/company";
import { getOrder } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { loadPublishedTable } from "@/lib/db/price-table";
import { loadQuoteProducts } from "@/lib/db/quote";
import { isoDate } from "@/lib/format";
import { ORDER_NUMBER } from "@/lib/order-number";
import { dueDates, saleOf } from "@/lib/order-quote";
import { logoPng, thumbnail } from "@/lib/photos/normalize";
import { NO_ITEMS_MESSAGE, QuoteError, quoteDocument } from "@/lib/quote/document";
import { renderQuotePdf } from "@/lib/quote/pdf";

/**
 * The quotation of one order as a PDF, for the customer. The only way the PDF
 * leaves the system. It is made from the team's account of the order, so it
 * never reads a cost; a seller reaches only their own orders. Profile, e-mail
 * and company come from the session alone.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ numero: string }> };

/** Side of the photo embedded in the PDF, in pixels: sharp enough for a 56 pt frame, light enough for a long order. */
const PHOTO_SIDE = 240;
/** The logo as embedded: three times the box it is drawn in. */
const LOGO_SIDE = { width: 510, height: 144 };

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

const NOT_FOUND = () => text("Pedido não encontrado.", 404);

export async function GET(_request: Request, context: Context): Promise<Response> {
  const session = await getSession();
  if (!session) return text("Entre no sistema para continuar.", 401);
  if (!allows(session, "pedidos")) return text("Seu perfil não acessa pedidos.", 403);

  const { numero } = await context.params;
  if (!ORDER_NUMBER.test(numero)) return NOT_FOUND();

  const conn = tenantDb(session.tenant.slug);
  const order = await getOrder(numero, { sellerEmail: seesAllOrders(session.role) ? null : session.email }, conn);
  if (!order) return NOT_FOUND();
  if (order.items.length === 0) return text(NO_ITEMS_MESSAGE, 409);
  const table = await loadPublishedTable(order.priceTableVersion, conn);
  if (!table) return NOT_FOUND();

  const today = isoDate(new Date());
  const products = await loadQuoteProducts(
    order.items.map((item) => item.productId),
    conn,
  );
  let document;
  try {
    document = quoteDocument({
      company: session.tenant.name,
      order,
      table,
      sale: saleOf(order, table),
      dates: dueDates(order, table, today),
      products,
      today,
    });
  } catch (error) {
    if (error instanceof QuoteError) return text(error.message, 409);
    throw error;
  }

  // One image at a time: the server has little memory.
  const photos = new Map<number, Uint8Array>();
  for (const [productId, product] of products) {
    const { photo } = product;
    if (!photo) continue;
    // A photo that cannot be read does not stop the quotation: its frame stays empty.
    const small = await thumbnail(photo, PHOTO_SIDE).catch(() => null);
    if (small) photos.set(productId, small);
    // The stored bytes (up to 1 MB each) are let go here, not held until the PDF is done.
    product.photo = null;
  }
  const stored = await loadLogo(conn);
  // A logo that cannot be read does not stop the quotation: the company's name goes in its place.
  const logo = stored ? await logoPng(stored.bytes, LOGO_SIDE.width, LOGO_SIDE.height).catch(() => null) : null;

  const pdf = await renderQuotePdf(document, { logo, photos });
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="orcamento-${order.number}.pdf"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}

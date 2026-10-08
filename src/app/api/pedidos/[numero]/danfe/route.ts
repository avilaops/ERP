import { getSession } from "@/lib/auth/index";
import { allows, seesAllOrders } from "@/lib/auth/permissions";
import { loadAuthorizedXml } from "@/lib/db/invoices";
import { getOrder } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { loadDanfeReformDate } from "@/lib/db/fiscal";
import { danfeData, renderDanfe, usesReformLayout } from "@/lib/fiscal/danfe";
import { ORDER_NUMBER } from "@/lib/order-number";

/**
 * The DANFE of the authorised invoice of an order, drawn from its XML. Who
 * reaches the order reaches it; a seller, only their own.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ numero: string }> };

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, context: Context): Promise<Response> {
  const session = await getSession();
  if (!session) return text("Entre no sistema para continuar.", 401);
  if (!allows(session, "pedidos")) return text("Seu perfil não acessa pedidos.", 403);

  const { numero } = await context.params;
  if (!ORDER_NUMBER.test(numero)) return text("Pedido não encontrado.", 404);
  const conn = tenantDb(session.tenant.slug);
  const order = await getOrder(numero, { sellerEmail: seesAllOrders(session.role) ? null : session.email }, conn);
  if (!order) return text("Pedido não encontrado.", 404);

  const file = await loadAuthorizedXml(order.id, conn);
  if (!file) return text("Este pedido ainda não tem nota autorizada.", 404);

  const data = danfeData(file.xml);
  return new Response(Buffer.from(await renderDanfe(data, { reform: usesReformLayout(data.issuedAt, await loadDanfeReformDate(conn)) })), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="danfe-${data.number}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

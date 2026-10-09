import { getSession } from "@/lib/auth/index";
import { allows, seesAllOrders } from "@/lib/auth/permissions";
import { getOrderContract } from "@/lib/db/contracts";
import { getOrder } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { contractFile, contractFileName } from "@/lib/db/send-contract";
import { ORDER_NUMBER } from "@/lib/order-number";

/**
 * One contract of an order, as it was sent, followed by its record of
 * signatures as it stands now. Who reaches the order reaches it; a seller,
 * only their own.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ numero: string; id: string }> };

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, context: Context): Promise<Response> {
  const session = await getSession();
  if (!session) return text("Entre no sistema para continuar.", 401);
  if (!allows(session, "pedidos")) return text("Seu perfil não acessa pedidos.", 403);

  const { numero, id } = await context.params;
  if (!ORDER_NUMBER.test(numero) || !/^[1-9]\d{0,8}$/.test(id)) return text("Contrato não encontrado.", 404);
  const conn = tenantDb(session.tenant.slug);
  const order = await getOrder(numero, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  const contract = order ? await getOrderContract(order.id, Number(id), conn) : null;
  if (!order || !contract) return text("Contrato não encontrado.", 404);

  const pdf = await contractFile(contract, { company: session.tenant.name, orderNumber: order.number, now: new Date() }, conn);
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${contractFileName(order.number, contract)}"`, "Cache-Control": "private, no-store" },
  });
}

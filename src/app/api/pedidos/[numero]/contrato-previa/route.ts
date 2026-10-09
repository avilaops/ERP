import { getSession } from "@/lib/auth/index";
import { allows, seesAllOrders } from "@/lib/auth/permissions";
import { ContractError } from "@/lib/db/contracts";
import { getOrder } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { previewOrderContract } from "@/lib/db/send-contract";
import { ORDER_NUMBER } from "@/lib/order-number";

/**
 * The contract of a closed order as it would leave now, for conference before
 * sending: nothing is stored and nobody is written to. Who reaches the order
 * reaches it; a seller, only their own.
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
  const order = await getOrder(numero, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  if (!order) return text("Pedido não encontrado.", 404);

  let pdf: Uint8Array;
  try {
    pdf = await previewOrderContract(order, session.tenant.name, new Date(), conn);
  } catch (error) {
    if (error instanceof ContractError) return text(error.message, 409);
    throw error;
  }
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="conferencia-contrato-${numero}.pdf"`, "Cache-Control": "private, no-store" },
  });
}

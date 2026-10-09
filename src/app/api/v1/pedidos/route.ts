import { apiAccess, apiJson } from "@/lib/api/access";
import { listOrders } from "@/lib/db/orders";

/**
 * The orders of the company, for other systems: number, how each stands, whose
 * it is and when it moved. `?situacao=fechado` filters. No price, cost or margin.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const access = await apiAccess(request);
  if (access instanceof Response) return access;
  const situation = new URL(request.url).searchParams.get("situacao");
  const all = await listOrders({ sellerEmail: null }, access.conn);
  const rows = situation ? all.filter((order) => order.status === situation) : all;
  return apiJson({
    total: rows.length,
    pedidos: rows.slice(0, 500).map((order) => ({
      numero: order.number, situacao: order.status, cliente: order.customerName, vendedor: order.sellerName, uf_de_entrega: order.deliveryUf,
      unidades: order.items.reduce((sum, item) => sum + item.quantity, 0), atualizado_em: order.updatedAt.toISOString(), fechado_em: order.closedAt?.toISOString() ?? null,
    })),
  });
}

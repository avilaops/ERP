import { getOrder } from "@/lib/db/orders";
import type { OrderScope, OrderStatus } from "@/lib/db/orders";
import type { Queryable } from "@/lib/db/pool";
import { loadPublishedSnapshot } from "@/lib/db/price-table";
import type { PublishedSnapshot } from "@/lib/db/price-table";
import { directorOf } from "@/lib/order-quote";
import type { Uf } from "@/lib/pricing/states";

/** One order as the dashboard reads it: when it was born and closed, who sold, where to and what. No cost. */
export type DashboardOrder = {
  number: string;
  status: OrderStatus;
  sellerEmail: string;
  sellerName: string;
  deliveryUf: Uf | null;
  discount: number;
  /** IPI rate of the table version of the order. */
  ipi: number;
  /** `AAAA-MM-DD`, in São Paulo. */
  createdOn: string;
  closedOn: string | null;
  items: { name: string; quantity: number; tableUnitPrice: number }[];
};

/** Every order the scope reaches, each with the table price of its own version. */
export async function listDashboardOrders(scope: OrderScope, conn: Queryable): Promise<DashboardOrder[]> {
  const { rows } = await conn.query(
    `SELECT o.number, o.status, o.seller_email, o.seller_name, o.delivery_uf, o.discount, v.ipi,
            to_char(o.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS created_on,
            to_char(o.closed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS closed_on,
            (SELECT json_agg(json_build_object('name', p.name, 'quantity', i.quantity, 'price', p.table_price) ORDER BY i.product_id)
               FROM order_items i
               JOIN price_table_items p ON p.version = i.price_table_version AND p.product_id = i.product_id
              WHERE i.order_id = o.id) AS items
       FROM orders o
       JOIN price_table_versions v ON v.version = o.price_table_version
      WHERE ($1::text IS NULL OR o.seller_email = $1)
      ORDER BY o.id`,
    [scope.sellerEmail],
  );
  return rows.map((row) => ({
    number: String(row.number),
    status: row.status as OrderStatus,
    sellerEmail: String(row.seller_email),
    sellerName: String(row.seller_name),
    deliveryUf: row.delivery_uf as Uf | null,
    discount: Number(row.discount),
    ipi: Number(row.ipi),
    createdOn: String(row.created_on),
    closedOn: row.closed_on === null ? null : String(row.closed_on),
    items: ((row.items as { name: string; quantity: number; price: number }[] | null) ?? []).map((item) => ({
      name: String(item.name),
      quantity: Number(item.quantity),
      tableUnitPrice: Number(item.price),
    })),
  }));
}

/**
 * The net profit of the given orders, each with the costs of its own table
 * version. Only for who `seesCosts`: the caller asks this only for them.
 */
export async function ordersProfit(numbers: string[], conn: Queryable): Promise<{ netSale: number; netProfit: number }> {
  const snapshots = new Map<number, PublishedSnapshot>();
  let netSale = 0;
  let netProfit = 0;
  for (const number of numbers) {
    const order = await getOrder(number, { sellerEmail: null }, conn);
    if (!order) continue;
    let snapshot = snapshots.get(order.priceTableVersion);
    if (!snapshot) {
      const loaded = await loadPublishedSnapshot(order.priceTableVersion, conn);
      if (!loaded) throw new Error(`Tabela v${order.priceTableVersion} não encontrada.`);
      snapshots.set(order.priceTableVersion, (snapshot = loaded));
    }
    const board = directorOf(order, snapshot);
    if (!board) continue;
    netSale += board.quote.netSale;
    netProfit += board.quote.netProfit;
  }
  return { netSale, netProfit };
}

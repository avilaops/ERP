import { createHash } from "node:crypto";
import { loadOrderTransport } from "@/lib/db/carriers";
import { loadFiscalSettings, loadProductFiscal } from "@/lib/db/fiscal";
import type { ProductFiscal } from "@/lib/db/fiscal";
import { listPaymentCodes } from "@/lib/db/fiscal-rules";
import { loadOrderFiscalRules } from "@/lib/db/order-fiscal-rules";
import { loadOrderDelivery } from "@/lib/db/order-delivery";
import { getOrder } from "@/lib/db/orders";
import type { Order } from "@/lib/db/orders";
import type { Queryable } from "@/lib/db/pool";
import { loadPublishedSnapshot, loadPublishedTable } from "@/lib/db/price-table";
import { isAcceptableRandomCode } from "@/lib/fiscal/nfe";
import type { FreightMode, NfeInput } from "@/lib/fiscal/nfe";
import { orderNfe } from "@/lib/fiscal/order-nfe";
import { APP_NAME } from "@/lib/app-identity";
import { isoDate } from "@/lib/format";
import { paymentOf, saleOf } from "@/lib/order-quote";

/** Now in São Paulo, as the layout writes it. The state has had no daylight saving time since 2019. */
export function issueInstant(now: Date): string {
  const local = new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 19);
  return `${local}-03:00`;
}

/** Identifies every confirmed fiscal input except the emission instant, which belongs to the worker. */
export function nfePreparationFingerprint(input: NfeInput): string {
  return createHash("sha256").update(JSON.stringify({ ...input, randomCode: "", issuedAt: "" })).digest("hex");
}

/**
 * The eight digits of `cNF` of a preview: the same for the same order, so two
 * previews of it are the same file. Moved one ahead while it is a code the
 * layout refuses (the number of the invoice, repeated or sequential digits).
 */
function previewCode(orderNumber: string, invoiceNumber: number): string {
  let value = parseInt(createHash("sha256").update(orderNumber).digest("hex").slice(0, 8), 16) % 100_000_000;
  while (!isAcceptableRandomCode(String(value).padStart(8, "0"), invoiceNumber)) value = (value + 1) % 100_000_000;
  return String(value).padStart(8, "0");
}

/**
 * The invoice of a closed order as it would be issued now, with what is
 * missing. A conference: it takes the next number of the company without
 * consuming it and signs nothing. `null` when the order does not exist or is
 * not closed.
 */
export async function previewOrderNfe(orderNumber: string, now: Date, conn: Queryable, issue?: {
  number?: number;
  randomCode?: string;
  environment?: "homologacao" | "producao";
  series?: number;
}) {
  const order: Order | null = await getOrder(orderNumber, { sellerEmail: null }, conn);
  if (!order || order.status !== "fechado" || order.items.length === 0) return null;
  const table = await loadPublishedTable(order.priceTableVersion, conn);
  const snapshot = await loadPublishedSnapshot(order.priceTableVersion, conn);
  if (!table || !snapshot) return null;

  const currentSettings = await loadFiscalSettings(conn);
  const settings = {
    ...currentSettings,
    environment: issue?.environment ?? currentSettings.environment,
    series: issue?.series ?? currentSettings.series,
  };
  const { rules, revision: rulesRevision } = await loadOrderFiscalRules(order.id, table.lineId, conn);
  const fiscal = new Map<number, ProductFiscal>();
  for (const item of order.items) {
    const data = await loadProductFiscal(item.productId, conn);
    if (data) fiscal.set(item.productId, data);
  }
  const sale = saleOf(order, table);
  const plan = paymentOf(order, sale, table, isoDate(now));
  const codes = new Map((await listPaymentCodes(conn)).map((method) => [method.label, method.code]));

  const freight = await conn.query("SELECT nfe_freight_mode FROM orders WHERE id = $1", [order.id]);
  const number = issue?.number ?? settings.nextNumber;
  const built = orderNfe({
    freightMode: (freight.rows[0]?.nfe_freight_mode ?? null) as FreightMode | null,
    transport: await loadOrderTransport(order.id, conn),
    delivery: await loadOrderDelivery(order.id, conn),
    settings,
    rules,
    order,
    products: new Map(table.items.map((item) => [item.productId, item])),
    fiscal,
    params: snapshot.params,
    receipts: plan.receipts,
    paymentCodes: codes,
    number,
    randomCode: issue?.randomCode ?? previewCode(order.number, number),
    issuedAt: issueInstant(now),
    software: APP_NAME.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/\s+/g, " ").trim(),
  });
  return { ...built, orderId: order.id, issuerUf: settings.uf ?? "", rulesRevision };
}

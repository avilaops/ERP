import type { Queryable } from "@/lib/db/pool";
import type { Order } from "@/lib/db/orders";
import { loadFiscalSettings } from "@/lib/db/fiscal";
import { loadOrderDelivery } from "@/lib/db/order-delivery";
import { loadOrderTransport } from "@/lib/db/carriers";
import { loadPixSettings } from "@/lib/db/pix";
import { loadProposalDetails } from "@/lib/db/proposal-details";
import type { QuoteContext } from "@/lib/quote/complete";
import { usesCompanyPix } from "@/lib/quote/complete";
import { showDateTime } from "@/lib/format";

export async function loadQuoteContext(order: Order, now: Date, conn: Queryable): Promise<QuoteContext> {
  const [issuer, company, details, delivery, transport, pix, payment, contracts] = await Promise.all([
    loadFiscalSettings(conn), loadProposalDetails(conn), loadProposalDetails(conn, order.id),
    loadOrderDelivery(order.id, conn), loadOrderTransport(order.id, conn), loadPixSettings(conn),
    conn.query(`SELECT r.amount - COALESCE((SELECT sum(p.amount) FROM receipts p WHERE p.receivable_id = r.id
        AND NOT EXISTS (SELECT 1 FROM refund_requests q WHERE q.receipt_id = p.id AND q.status = 'confirmada')), 0) AS open
      FROM receivables r WHERE r.order_id = $1 AND r.kind = 'entrada' AND r.status <> 'cancelada'`, [order.id]),
    conn.query("SELECT status, expires_at, signed_at, recipient_email FROM order_contracts WHERE order_id = $1 AND status IN ('enviado', 'assinado') ORDER BY sequence DESC LIMIT 1", [order.id]),
  ]);
  const method = await conn.query("SELECT nfe_code,company_pix,on_delivery FROM payment_methods WHERE label = $1", [order.downPaymentMethod]);
  const contract = contracts.rows[0];
  const acceptance = !contract ? null : contract.status === "assinado"
    ? `Contrato assinado eletronicamente em ${showDateTime(new Date(contract.signed_at))}. Comprovantes e documento assinado disponíveis no sistema.`
    : new Date(contract.expires_at).getTime() <= now.getTime()
      ? "O link de assinatura do contrato expirou. Solicite à vendedora um novo envio."
      : `Assinatura eletrônica: use o link individual do contrato enviado para ${contract.recipient_email}. Confirme sua identidade pelo código enviado ao seu e-mail.`;
  return { issuer, companyDetails: company.details, orderDetails: details.details, delivery, transport, pix,
    downPaymentOpen: payment.rows[0] ? Math.max(0, Number(payment.rows[0].open)) : null,
    // A payment link may also be coded 17: it must keep its provider's payment flow.
    downPaymentIsPix: usesCompanyPix(method.rows[0]?.company_pix===true && method.rows[0]?.on_delivery!==true, method.rows[0]?.nfe_code ?? null), acceptance };
}

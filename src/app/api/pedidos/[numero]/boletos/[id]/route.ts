import { getSession } from "@/lib/auth";
import { allows } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { ORDER_NUMBER } from "@/lib/order-number";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ numero: string; id: string }> }): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Entre no sistema.", { status: 401 });
  if (!allows(session, "recebimentos")) return new Response("Seu perfil não acessa cobranças.", { status: 403 });
  const { numero, id } = await context.params;
  if (!ORDER_NUMBER.test(numero) || !/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2_147_483_647) return new Response("Boleto não encontrado.", { status: 404 });
  const { rows } = await tenantDb(session.tenant.slug).query(
    `SELECT b.pdf FROM receivable_bills b JOIN receivables r ON r.id = b.receivable_id JOIN orders o ON o.id = r.order_id
      WHERE b.id = $1 AND o.number = $2 AND b.pdf IS NOT NULL`, [Number(id), numero],
  );
  if (!rows[0]) return new Response("Boleto não encontrado.", { status: 404 });
  return new Response(new Uint8Array(rows[0].pdf as Buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Boleto-${numero}-${id}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

import { getSession } from "@/lib/auth/index";
import { allows } from "@/lib/auth/permissions";
import { listPayables } from "@/lib/db/payables";
import { tenantDb } from "@/lib/db/pool";
import { payablesCsv } from "@/lib/payables-view";

/**
 * The bills of the company of the session, as a spreadsheet file. Only who has
 * Contas a pagar. Profile and company come from the session alone: nothing is
 * read from the request.
 */
export const dynamic = "force-dynamic";

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET() {
  const session = await getSession();
  if (!session) return text("Entre no sistema para continuar.", 401);
  if (!allows(session, "contas-pagar")) return text("Seu perfil não vê as contas a pagar.", 403);

  const csv = payablesCsv(await listPayables(tenantDb(session.tenant.slug)));
  // The mark at the start makes Excel read the accents right.
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contas-a-pagar.csv"',
      "Cache-Control": "no-store",
    },
  });
}

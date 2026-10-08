import { getSession } from "@/lib/auth/index";
import { allows } from "@/lib/auth/permissions";
import { previewOrderNfe } from "@/lib/db/order-nfe";
import { tenantDb } from "@/lib/db/pool";
import { buildNfeXml } from "@/lib/fiscal/nfe";
import { ORDER_NUMBER } from "@/lib/order-number";

/**
 * The XML of the invoice of a closed order, for the accountant to check: not
 * signed, not sent, without fiscal value, and it does not consume the number.
 * Only for who edits the fiscal parameters (the directors). Company and
 * profile come from the session alone.
 */
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ numero: string }> };

const text = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, context: Context): Promise<Response> {
  const session = await getSession();
  if (!session) return text("Entre no sistema para continuar.", 401);
  if (!allows(session, "parametros")) return text("Seu perfil não acessa a conferência da nota fiscal.", 403);

  const { numero } = await context.params;
  if (!ORDER_NUMBER.test(numero)) return text("Pedido não encontrado.", 404);
  const preview = await previewOrderNfe(numero, new Date(), tenantDb(session.tenant.slug));
  if (!preview) return text("Pedido não encontrado ou ainda não fechado.", 404);
  if (preview.problems.length > 0) return text(`A nota ainda não pode ser montada. Falta:\n- ${preview.problems.join("\n- ")}`, 409);

  const { xml } = buildNfeXml(preview.input);
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="conferencia-nfe-pedido-${numero}.xml"`,
      "Cache-Control": "private, no-store",
    },
  });
}

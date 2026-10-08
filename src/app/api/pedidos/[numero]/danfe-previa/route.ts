import { getSession } from "@/lib/auth/index";
import { allows } from "@/lib/auth/permissions";
import { previewOrderNfe } from "@/lib/db/order-nfe";
import { tenantDb } from "@/lib/db/pool";
import { loadDanfeReformDate } from "@/lib/db/fiscal";
import { danfeData, renderDanfe, usesReformLayout } from "@/lib/fiscal/danfe";
import { buildNfeXml } from "@/lib/fiscal/nfe";
import { ORDER_NUMBER } from "@/lib/order-number";

/**
 * The DANFE of conference of a closed order: the invoice as it would be issued
 * now, stamped as having no fiscal value. Only for who edits the fiscal
 * parameters; nothing is signed, sent or numbered.
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
  const conn = tenantDb(session.tenant.slug);
  const preview = await previewOrderNfe(numero, new Date(), conn);
  if (!preview) return text("Pedido não encontrado ou ainda não fechado.", 404);
  if (preview.problems.length > 0) return text(`A nota ainda não pode ser montada. Falta:\n- ${preview.problems.join("\n- ")}`, 409);

  const data = danfeData(buildNfeXml(preview.input).xml);
  return new Response(Buffer.from(await renderDanfe(data, { reform: usesReformLayout(data.issuedAt, await loadDanfeReformDate(conn)) })), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="conferencia-danfe-${numero}.pdf"`, "Cache-Control": "private, no-store" },
  });
}

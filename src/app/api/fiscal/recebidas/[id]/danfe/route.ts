import { getSession } from "@/lib/auth";
import { allows } from "@/lib/auth/permissions";
import { receivedNfeXml } from "@/lib/db/received-nfes";
import { loadDanfeReformDate } from "@/lib/db/fiscal";
import { tenantDb } from "@/lib/db/pool";
import { danfeData, renderDanfe, usesReformLayout } from "@/lib/fiscal/danfe";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Entre no sistema para continuar.", { status: 401 });
  if (!allows(session, "fiscal")) return new Response("Seu perfil não acessa notas fiscais.", { status: 403 });
  const conn = tenantDb(session.tenant.slug);
  const document = await receivedNfeXml(Number((await params).id), conn);
  if (!document) return new Response("NF-e não encontrada.", { status: 404 });
  try {
    const data = danfeData(document.xml);
    const pdf = await renderDanfe(data, { reform: usesReformLayout(data.issuedAt, await loadDanfeReformDate(conn)) });
    return new Response(Buffer.from(pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="DANFE-${document.accessKey}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response("Não foi possível gerar o DANFE desta NF-e.", { status: 422 });
  }
}

import { apiAccess } from "@/lib/api/access";
import { receivedNfeXml } from "@/lib/db/received-nfes";
import { loadDanfeReformDate } from "@/lib/db/fiscal";
import { danfeData, renderDanfe, usesReformLayout } from "@/lib/fiscal/danfe";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const access = await apiAccess(request);
  if (access instanceof Response) return access;
  const idText = (await params).id;
  const document = /^[1-9]\d{0,18}$/.test(idText) ? await receivedNfeXml(Number(idText), access.conn) : null;
  if (!document) return new Response("NF-e recebida não encontrada.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const data = danfeData(document.xml);
  const pdf = await renderDanfe(data, { reform: usesReformLayout(data.issuedAt, await loadDanfeReformDate(access.conn)) });
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="DANFE-${document.accessKey}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

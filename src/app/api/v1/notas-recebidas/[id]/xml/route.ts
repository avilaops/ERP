import { apiAccess } from "@/lib/api/access";
import { receivedNfeXml } from "@/lib/db/received-nfes";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const access = await apiAccess(request);
  if (access instanceof Response) return access;
  const idText = (await params).id;
  const document = /^[1-9]\d{0,18}$/.test(idText) ? await receivedNfeXml(Number(idText), access.conn) : null;
  if (!document) return new Response("NF-e recebida não encontrada.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  return new Response(document.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="NFe-${document.accessKey}.xml"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

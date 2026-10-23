import { getSession } from "@/lib/auth";
import { allows } from "@/lib/auth/permissions";
import { receivedNfeXml } from "@/lib/db/received-nfes";
import { tenantDb } from "@/lib/db/pool";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Entre no sistema para continuar.", { status: 401 });
  if (!allows(session, "fiscal")) return new Response("Seu perfil não acessa notas fiscais.", { status: 403 });
  const id = Number((await params).id);
  const document = await receivedNfeXml(id, tenantDb(session.tenant.slug));
  if (!document) return new Response("NF-e não encontrada.", { status: 404 });
  return new Response(document.xml, { headers: {
    "Content-Type": "application/xml; charset=utf-8",
    "Content-Disposition": `attachment; filename="NFe-${document.accessKey}.xml"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}


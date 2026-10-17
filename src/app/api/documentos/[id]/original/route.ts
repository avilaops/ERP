import { getSession } from "@/lib/auth";
import { allows } from "@/lib/auth/permissions";
import { getDocument } from "@/lib/db/documents";
import { tenantDb } from "@/lib/db/pool";
import { readBlob } from "@/lib/documents/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Entre no sistema.", { status: 401 });
  if (!allows(session, "documentos")) return new Response("Sem acesso.", { status: 403 });
  const { id } = await params;
  const doc = await getDocument(id, session, tenantDb(session.tenant.slug), new URL(request.url).searchParams.get("versao") ?? undefined);
  if (!doc) return new Response("Documento não encontrado.", { status: 404 });
  const root = process.env.ERP_DOCUMENTS_ROOT;
  if (!root) return new Response("Armazenamento de documentos não configurado.", { status: 503 });
  try {
    const bytes = await readBlob(root, String(doc.sha256));
    const extensions: Record<string, string> = { "application/pdf": "pdf", "application/zip": "zip", "application/xml": "xml", "text/html": "html", "text/plain": "txt", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx" };
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="documento-${id}-versao-${doc.version_id}.${extensions[String(doc.mime)] ?? "bin"}"`,
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox", "Cache-Control": "private, no-store",
    } });
  } catch {
    return new Response("Original indisponível ou com falha de integridade. Consulte a diretoria.", { status: 503 });
  }
}

import { apiAccess, apiError, apiJson } from "@/lib/api/access";
import { allows } from "@/lib/auth/permissions";
import { findActiveUser } from "@/lib/db/users";
import { documentJobs } from "@/lib/db/documents";

export const dynamic = "force-dynamic";

/** n8n supervises/queues; the bounded worker handles downloads and extraction. */
export async function GET(request: Request) {
  const access = await apiAccess(request);
  if (access instanceof Response) return access;
  const user = await findActiveUser(access.key.ownerEmail, access.conn);
  if (!user || user.role !== "DIRETORIA" || !allows(user, "documentos")) return apiError(403, "A chave precisa pertencer a uma pessoa da diretoria com acesso a Documentos.");
  return apiJson(await documentJobs(access.conn));
}

export async function POST(request: Request) {
  const access = await apiAccess(request);
  if (access instanceof Response) return access;
  const user = await findActiveUser(access.key.ownerEmail, access.conn);
  if (!access.key.canWrite || !user || user.role !== "DIRETORIA" || !allows(user, "documentos")) return apiError(403, "Revisitação exige chave de escrita da diretoria com acesso a Documentos.");
  // A daily poll revalidates known URLs, including changed files behind old links.
  // Failed/blocked jobs require explicit review rather than endless daily retries.
  const { rows } = await access.conn.query(`UPDATE document_jobs j SET state='pending',attempts=0,available_at=now(),updated_at=now()
    FROM document_sources s WHERE s.id=j.source_id AND s.active AND j.state='indexed' AND j.updated_at < now()-interval '24 hours' RETURNING j.id`);
  return apiJson({ enfileirados: rows.length, aviso: "O worker processa a fila separadamente; enfileirado não significa indexado." }, 202);
}

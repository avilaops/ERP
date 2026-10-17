import type { Queryable } from "@/lib/db/pool";
import type { Role } from "@/lib/auth/roles";

export type DocumentReader = { email: string; role: Role };
const ACCESS = "(c.visibility = 'official' OR c.owner_email = $1 OR $2::boolean)";
const readerValues = (who: DocumentReader) => [who.email, who.role === "DIRETORIA"];

export type DocumentFilter = { q: string; kind: string; collection: string; before: string; limit: number; status: string; category: string; from: string; until: string; version: string };
export const DOCUMENT_KINDS = ["application/pdf", "application/zip", "application/xml", "text/html", "text/plain", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

export function documentFilter(params: Record<string, string | string[] | undefined>, limit = 4): DocumentFilter {
  const first = (key: string) => String(Array.isArray(params[key]) ? params[key][0] ?? "" : params[key] ?? "");
  const date = (key: string) => {
    const raw = first(key);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) && new Date(raw).toISOString().slice(0,10) === raw ? raw : "";
  };
  return { q: first("q").trim().slice(0, 160), kind: DOCUMENT_KINDS.includes(first("tipo")) ? first("tipo") : "", collection: /^\d{1,12}$/.test(first("colecao")) ? first("colecao") : "", before: /^\d{1,16}(?::[123])?$/.test(first("antes")) ? first("antes") : "", limit: Math.min(30, Math.max(1, limit)), status:["indexed","partial","failed"].includes(first("estado")) ? first("estado") : "", category:["manuais","esquemas-xml","informes-tecnicos","diversos","material-tecnico"].includes(first("categoria")) ? first("categoria") : "", from:date("de"),until:date("ate"),version:/^\d{1,16}$/.test(first("versao")) ? first("versao") : "" };
}

export function documentHref(filter: DocumentFilter, changes: Partial<DocumentFilter> = {}): string {
  const f = { ...filter, ...changes };
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.kind) p.set("tipo", f.kind);
  if (f.collection) p.set("colecao", f.collection);
  if (f.before) p.set("antes", f.before);
  if (f.status) p.set("estado", f.status);
  if (f.category) p.set("categoria", f.category);
  if (f.from) p.set("de", f.from);
  if (f.until) p.set("ate", f.until);
  if (f.version) p.set("versao", f.version);
  return `/documentos${p.size ? `?${p}` : ""}`;
}

export async function listDocumentCollections(who: DocumentReader, conn: Queryable) {
  const { rows } = await conn.query(`SELECT c.id::text, c.name FROM document_collections c WHERE ${ACCESS} ORDER BY c.name`, readerValues(who));
  return rows as { id: string; name: string }[];
}

export const DOCUMENT_SEARCH_SQL = `
    WITH schema_hits AS (
      SELECT DISTINCT version_id FROM document_schema_elements WHERE $3<>'' AND (name=$3 OR namespace=$3)
    ), text_hits AS (
      SELECT DISTINCT version_id FROM document_chunks WHERE $3<>'' AND search_vector @@ websearch_to_tsquery('portuguese',$3)
    ), matched AS (
    SELECT d.id::text, d.id AS sort_id, d.title, d.url, d.category, c.name AS collection, v.id::text AS version_id,
           v.mime, v.status, v.collected_at,
           CASE WHEN sh.version_id IS NOT NULL THEN 3
                WHEN $3 <> '' AND d.title ILIKE '%' || $3 || '%' THEN 2 ELSE 1 END AS relevance
      FROM library_documents d JOIN document_collections c ON c.id = d.collection_id
      JOIN document_versions v ON v.document_id=d.id AND (($12::bigint IS NULL AND v.id=d.current_version_id) OR v.id=$12::bigint)
      LEFT JOIN schema_hits sh ON sh.version_id=v.id
      LEFT JOIN text_hits th ON th.version_id=v.id
     WHERE ${ACCESS} AND ($4 = '' OR v.mime = $4)
       AND ($5::bigint IS NULL OR c.id = $5)
       AND ($8 = '' OR v.status = $8) AND ($9 = '' OR d.category = $9)
       AND ($10::date IS NULL OR v.collected_at >= $10::date)
       AND ($11::date IS NULL OR v.collected_at < $11::date + interval '1 day')
       AND ($12::bigint IS NULL OR v.id = $12)
       AND ($3 = '' OR d.title ILIKE '%' || $3 || '%' OR th.version_id IS NOT NULL OR sh.version_id IS NOT NULL)
    ) SELECT limited.*, (SELECT substring(ch.content,1,220) FROM document_chunks ch
        WHERE ch.version_id=limited.version_id::bigint AND ($3='' OR ch.search_vector @@ websearch_to_tsquery('portuguese',$3))
        ORDER BY ch.ordinal LIMIT 1) AS excerpt
      FROM (SELECT * FROM matched WHERE ($6::bigint IS NULL OR relevance < $13 OR (relevance = $13 AND sort_id < $6))
        ORDER BY relevance DESC,sort_id DESC LIMIT $7) limited
      ORDER BY relevance DESC,sort_id DESC`;

/** Keyset pagination never loads the corpus into the application process. */
export async function searchDocuments(filter: DocumentFilter, who: DocumentReader, conn: Queryable) {
  const [id, rank] = filter.before.split(":");
  const values: unknown[] = [...readerValues(who), filter.q, filter.kind, filter.collection || null, id || null, filter.limit + 1,filter.status,filter.category,filter.from||null,filter.until||null,filter.version||null,Number(rank)||1];
  const { rows } = await conn.query(DOCUMENT_SEARCH_SQL, values);
  const more = rows.length > filter.limit;
  return { rows: rows.slice(0, filter.limit), more };
}

export async function getDocument(id: string, who: DocumentReader, conn: Queryable, version?: string) {
  if (!/^\d{1,16}$/.test(id)) return null;
  const { rows } = await conn.query(`SELECT d.id::text, d.title, d.url, c.name AS collection, c.visibility,
    v.id::text AS version_id, v.sha256, v.mime, v.bytes::text, v.status, v.warnings, v.metadata, v.collected_at, v.final_url, v.extractor
    FROM library_documents d JOIN document_collections c ON c.id = d.collection_id
    JOIN document_versions v ON v.document_id = d.id AND v.id = COALESCE($4::bigint, d.current_version_id)
    WHERE d.id = $3 AND ${ACCESS}`, [...readerValues(who), id, version && /^\d{1,16}$/.test(version) ? version : null]);
  return rows[0] ?? null;
}

export async function documentContent(version: string, page: number, conn: Queryable) {
  const { rows } = await conn.query("SELECT page, section, content FROM document_chunks WHERE version_id = $1 ORDER BY ordinal LIMIT 1 OFFSET $2", [version, Math.max(0, page - 1)]);
  const count = await conn.query("SELECT count(*)::int AS total FROM document_chunks WHERE version_id = $1", [version]);
  return { chunk: rows[0] ?? null, total: Number(count.rows[0].total) };
}

/** Caller must first authorize the document through getDocument. */
export async function documentVersions(id: string, conn: Queryable) {
  const { rows } = await conn.query("SELECT id::text, collected_at, status, sha256 FROM document_versions WHERE document_id = $1 ORDER BY id DESC LIMIT 30", [id]);
  return rows;
}

export async function documentSchema(version: string, conn: Queryable, name = "") {
  const { rows } = await conn.query("SELECT namespace, name, kind, type_name, min_occurs, max_occurs, archive_path, documentation, details FROM document_schema_elements WHERE version_id = $1 AND ($2 = '' OR name = $2 OR namespace = $2) ORDER BY id LIMIT 30", [version, name.slice(0, 200)]);
  return rows;
}

export async function documentJobs(conn: Queryable) {
  const { rows } = await conn.query("SELECT j.id::text, j.url, j.state, j.attempts, j.last_error, j.updated_at FROM document_jobs j ORDER BY j.updated_at DESC, j.id DESC LIMIT 5");
  const summary = await conn.query("SELECT state, count(*)::int AS total FROM document_jobs GROUP BY state ORDER BY state");
  return { rows, summary: summary.rows };
}

export async function retryDocumentJob(id: string, conn: Queryable) {
  if (!/^\d{1,16}$/.test(id)) throw new Error("Coleta inválida.");
  await conn.query("UPDATE document_jobs SET state = 'pending', attempts = 0, available_at = now(), last_error = NULL, lease_token = NULL, lease_until = NULL, updated_at = now() WHERE id = $1 AND state IN ('failed','blocked','partial')", [id]);
}

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename, resolve } from "node:path";
import type { Queryable } from "@/lib/db/pool";
import { allowedDocumentUrl, documentUrl, downloadDocument, DownloadError } from "@/lib/documents/download";
import { blobPath, saveBlob, saveExtraction } from "@/lib/documents/storage";

const execute = promisify(execFile);
export const FISCAL_SEEDS = [
  "https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=ndIjl+iEFdE=",
  "https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w=",
  "https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=hXzemuyNHW4=",
  "https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=/NJarYc9nus=",
];

export type Extracted = {
  title: string; extractor: string; error?: string;
  pages: { page: number; section: string; content: string }[];
  links: string[]; warnings: string[]; metadata: Record<string, unknown>;
  elements: { namespace: string; name: string; kind: string; type_name?: string; min_occurs?: string; max_occurs?: string; documentation: string; details: unknown; archive_path?: string }[];
};

/** RFC 5987 names and older UTF-8 bytes transported as Latin-1 headers. */
export function documentFilename(disposition: string, fallback: string): string {
  const extended = /filename\*\s*=\s*UTF-8''([^;\r\n]+)/i.exec(disposition)?.[1];
  if (extended) {
    try { return basename(decodeURIComponent(extended.trim()).replaceAll("\\", "/")); } catch { /* Try the plain filename. */ }
  }
  const plain = /filename\s*=\s*["']?([^"';\r\n]+)/i.exec(disposition)?.[1]?.trim();
  if (!plain) return basename(fallback);
  const decoded = Buffer.from(plain, "latin1").toString("utf8");
  return basename((decoded.includes("\uFFFD") ? plain : decoded).replaceAll("\\", "/"));
}

export function fileType(bytes: Buffer, header: string, filename: string): string {
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))) return /\.xlsx$/i.test(filename) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/zip";
  if (bytes.subarray(0, 8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])) && /\.xls$/i.test(filename)) return "application/vnd.ms-excel";
  const prefix = bytes.subarray(0, 2048).toString("utf8").trimStart();
  if (/<(?:!doctype\s+html|html)[\s>]/i.test(prefix)) return "text/html";
  if (/<\?xml|<(?:\w+:)?(?:schema|definitions)\b/i.test(prefix)) return "application/xml";
  if (/\.(?:txt|md|csv|sql)$/i.test(filename) && !bytes.includes(0)) return "text/plain";
  return /^(text\/|application\/(xml|json))/.test(header) ? header.split(";")[0] : "application/octet-stream";
}

export function discoverLinks(links: string[], base: string, hosts: string[]): { url: string; disposition: "queued" | "excluded"; reason: string }[] {
  const found = new Map<string, { url: string; disposition: "queued" | "excluded"; reason: string }>();
  for (const link of links) {
    if (typeof link !== "string" || link.length > 8000) continue;
    try {
      const candidate = new URL(link, base);
      if (candidate.protocol === "http:" && hosts.includes(candidate.hostname)) candidate.protocol = "https:";
      const url = documentUrl(candidate.href);
      const u = new URL(url);
      const inScope = allowedDocumentUrl(url, hosts) && (
        FISCAL_SEEDS.includes(url) || (/\/listaConteudo\.aspx$/i.test(u.pathname) && FISCAL_SEEDS.some(seed => u.search.slice(1).split("&").includes(new URL(seed).search.slice(1))))
        || /\.(?:pdf|zip|xsd|xml|wsdl|txt|md|sql|csv|xlsx)(?:$)/i.test(u.pathname)
        || /\/portal\/(?:exibirArquivo|download|downloadConteudo|listaHistorico|exibirConteudo|visualizarArquivo)\.aspx$/i.test(u.pathname)
      );
      found.set(url, { url, disposition: inScope ? "queued" : "excluded", reason: inScope ? "" : "Fora das raízes ou formatos técnicos permitidos" });
    } catch { /* Non-HTTP navigation (mail, script, page anchor) is not a source. */ }
  }
  return [...found.values()];
}

export async function extractDocument(path: string, filename: string, mime: string, python: string): Promise<Extracted> {
  let stdout: string;
  try {
    ({ stdout } = await execute(python, [resolve("workers/documents/extract.py"), path, filename, mime], { timeout: 120_000, maxBuffer: 24_000_000, windowsHide: true }));
  } catch (error) {
    const output = (error as { stdout?: string }).stdout;
    if (output) {
      let detail: { error?: string } = {};
      try { detail = JSON.parse(output); } catch { /* Bounded generic error below. */ }
      if (detail.error) throw new Error(detail.error);
    }
    throw new Error("Extrator interrompido ou excedeu limite de tempo/memória/saída; original preservado.");
  }
  const result = JSON.parse(stdout) as Extracted;
  if (result.error || !Array.isArray(result.pages) || !Array.isArray(result.links)) throw new Error(result.error ?? "Extrator devolveu formato inválido.");
  return result;
}

export async function seedDocuments(conn: Queryable, owner: string) {
  const { rows } = await conn.query("INSERT INTO document_collections (slug, name, visibility, owner_email) VALUES ('nfe-oficial', 'NF-e · Documentação oficial', 'official', $1) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id", [owner]);
  for (const url of FISCAL_SEEDS) {
    const source = await conn.query("INSERT INTO document_sources (collection_id, url, allowed_hosts) VALUES ($1, $2, $3) ON CONFLICT (collection_id, url) DO UPDATE SET active = true RETURNING id", [rows[0].id, url, ["www.nfe.fazenda.gov.br", "nfe.fazenda.gov.br"]]);
    await conn.query("INSERT INTO document_jobs (source_id, collection_id, url) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [source.rows[0].id, rows[0].id, url]);
  }
}

/** A lease is fenced by a UUID. A stale worker cannot commit a result after reclaim. */
export async function claimDocumentJob(conn: Queryable) {
  await conn.query("UPDATE document_jobs SET state = 'failed', lease_token = NULL, lease_until = NULL, last_error = 'Lease expirado após três tentativas; revisão necessária', updated_at = now() WHERE state = 'running' AND lease_until < now() AND attempts >= 3");
  const token = randomUUID();
  const { rows } = await conn.query(`UPDATE document_jobs j SET state = 'running', attempts = attempts + 1,
    lease_token = $1, lease_until = now() + interval '10 minutes', updated_at = now()
    WHERE id = (SELECT q.id FROM document_jobs q JOIN document_sources s ON s.id = q.source_id WHERE s.active AND q.attempts < 3
      AND ((q.state = 'pending' AND q.available_at <= now()) OR (q.state = 'running' AND q.lease_until < now()))
      ORDER BY q.available_at, q.id FOR UPDATE OF q SKIP LOCKED LIMIT 1)
    RETURNING j.*`, [token]);
  return rows[0] ?? null;
}

/** No transaction spans download or extraction. conn must be a held connection. */
export async function ingestDocumentJob(job: Record<string, unknown>, conn: Queryable, root: string, python: string) {
  const source = await conn.query("SELECT * FROM document_sources WHERE id = $1 AND active", [job.source_id]);
  if (!source.rows[0]) throw new Error("Fonte não está ativa.");
  const s = source.rows[0];
  const attempt = await conn.query("INSERT INTO document_attempts (job_id) VALUES ($1) RETURNING id", [job.id]);
  let hash: string | null = null;
  let http: number | null = null;
  try {
    const previous = await conn.query(`SELECT v.* FROM library_documents d JOIN document_versions v ON v.id = d.current_version_id WHERE d.collection_id = $1 AND d.url = $2`, [s.collection_id, job.url]);
    const old = previous.rows[0];
    // Conditional retrieval only after a complete extraction; partial versions can be retried.
    const file = await downloadDocument(String(job.url), s.allowed_hosts, old?.status === "indexed" && old.metadata?.derivative_sha256 ? { etag: old.etag, modified: old.last_modified } : {});
    http = file.status;
    if (file.status === 304) {
      if (!old) throw new Error("Fonte retornou 304 sem original anterior.");
      await conn.query("UPDATE document_jobs SET state = $3, lease_token = NULL, lease_until = NULL, last_http = 304, last_error = NULL, updated_at = now() WHERE id = $1 AND lease_token = $2", [job.id, job.lease_token, old.status]);
      await conn.query("UPDATE document_attempts SET finished_at = now(), outcome = 'unchanged', http_status = 304 WHERE id = $1", [attempt.rows[0].id]);
      return;
    }
    hash = await saveBlob(root, file.bytes);
    const name = documentFilename(String(file.headers["content-disposition"] ?? ""), new URL(file.url).pathname);
    const mime = fileType(file.bytes, String(file.headers["content-type"] ?? ""), name);
    const extracted = await extractDocument(blobPath(root, hash), name, mime, python);
    extracted.metadata.original_filename = name;
    extracted.metadata.derivative_sha256 = await saveExtraction(root, hash, extracted);
    // Different OCR/parser output for the same original is a new version too.
    // This prevents a partial re-extraction from mutating a complete version.
    const extractorRevision = `${extracted.extractor}-${String(extracted.metadata.derivative_sha256).slice(0, 16)}`;
    const textLength = extracted.pages.reduce((n, p) => n + p.content.trim().length, 0);
    if (mime === "text/html" && (textLength < 80 || /access denied|captcha|request rejected/i.test(extracted.title))) throw new DownloadError("HTTP 200 sem conteúdo técnico utilizável; original preservado.", 200);
    const status = textLength === 0 ? "failed" : extracted.warnings.length ? "partial" : "indexed";
    const links = discoverLinks(extracted.links, file.url, s.allowed_hosts);
    await conn.query("BEGIN");
    try {
      const held = await conn.query("SELECT id FROM document_jobs WHERE id = $1 AND lease_token = $2 AND lease_until > now() FOR UPDATE", [job.id, job.lease_token]);
      if (!held.rows.length) throw new Error("Lease expirado; resultado descartado sem sobrescrever versão válida.");
      const category = ["manuais", "esquemas-xml", "informes-tecnicos", "diversos"][FISCAL_SEEDS.indexOf(s.url)] ?? "material-tecnico";
      const doc = await conn.query("INSERT INTO library_documents (collection_id, source_id, url, title, category) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (collection_id,url) DO UPDATE SET title = EXCLUDED.title, category = EXCLUDED.category RETURNING id, current_version_id", [s.collection_id, s.id, job.url, extracted.title.slice(0, 1000) || name, category]);
      const version = await conn.query(`INSERT INTO document_versions (document_id,sha256,mime,bytes,final_url,etag,last_modified,extractor,status,warnings,metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (document_id,sha256,extractor) DO UPDATE SET status = EXCLUDED.status, warnings = EXCLUDED.warnings RETURNING id`,
      [doc.rows[0].id, hash, mime, file.bytes.length, file.url, file.headers.etag ?? null, file.headers["last-modified"] ?? null, extractorRevision, status, JSON.stringify(extracted.warnings), JSON.stringify(extracted.metadata)]);
      const v = version.rows[0].id;
      await conn.query("DELETE FROM document_chunks WHERE version_id = $1", [v]);
      let ordinal = 0;
      const chunks = [];
      for (const page of extracted.pages) {
        // Small sections keep FTS vectors bounded and previews usable on a phone.
        for (let offset = 0; offset < page.content.length; offset += 6000) {
          chunks.push({ ordinal: ++ordinal, page: page.page, section: page.section, content: page.content.slice(offset, offset + 6000) });
        }
      }
      await conn.query("INSERT INTO document_chunks(version_id,ordinal,page,section,content) SELECT $1,x.ordinal,x.page,x.section,x.content FROM jsonb_to_recordset($2::jsonb) AS x(ordinal int,page int,section text,content text)", [v, JSON.stringify(chunks)]);
      await conn.query("DELETE FROM document_schema_elements WHERE version_id = $1", [v]);
      await conn.query(`INSERT INTO document_schema_elements(version_id,archive_path,namespace,name,kind,type_name,min_occurs,max_occurs,documentation,details)
        SELECT $1,COALESCE(x.archive_path,''),x.namespace,x.name,x.kind,x.type_name,x.min_occurs,x.max_occurs,x.documentation,x.details
        FROM jsonb_to_recordset($2::jsonb) AS x(archive_path text,namespace text,name text,kind text,type_name text,min_occurs text,max_occurs text,documentation text,details jsonb)`, [v, JSON.stringify(extracted.elements)]);
      const classified = links.map(link => Number(job.depth) >= 12 && link.disposition === "queued" ? { ...link, disposition: "excluded", reason: "Limite de profundidade 12: revisão necessária" } : link);
      await conn.query("INSERT INTO document_links(source_version_id,url,disposition,reason) SELECT $1,x.url,x.disposition,x.reason FROM jsonb_to_recordset($2::jsonb) AS x(url text,disposition text,reason text) ON CONFLICT DO NOTHING", [v, JSON.stringify(classified)]);
      await conn.query("INSERT INTO document_jobs(source_id,collection_id,url,depth) SELECT $1,$2,x.url,$3 FROM jsonb_to_recordset($4::jsonb) AS x(url text,disposition text) WHERE x.disposition='queued' ON CONFLICT DO NOTHING", [s.id, s.collection_id, Number(job.depth) + 1, JSON.stringify(classified)]);
      // A failed/partial refresh must not replace an existing complete version.
      if (status === "indexed" || !doc.rows[0].current_version_id || old?.status !== "indexed") await conn.query("UPDATE library_documents SET current_version_id = $2 WHERE id = $1", [doc.rows[0].id, v]);
      await conn.query("UPDATE document_jobs SET state = $3, lease_token = NULL, lease_until = NULL, last_error = $4, last_http = $5, updated_at = now() WHERE id = $1 AND lease_token = $2", [job.id, job.lease_token, status, extracted.warnings.join("; ").slice(0, 1000) || null, http]);
      await conn.query("UPDATE document_attempts SET finished_at = now(), outcome = $2, bytes = $3, sha256 = $4, http_status = $5 WHERE id = $1", [attempt.rows[0].id, status, file.bytes.length, hash, http]);
      await conn.query("COMMIT");
    } catch (error) { await conn.query("ROLLBACK"); throw error; }
  } catch (error) {
    const status = error instanceof DownloadError ? error.status : http;
    const retryable = status === 429 || (status !== null && status >= 500) || (status === null && (!(error instanceof DownloadError) || error.transient));
    const state = retryable && Number(job.attempts) < 3 ? "pending" : [401, 403, 429].includes(status ?? 0) ? "blocked" : "failed";
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Falha de ingestão";
    const delay = Math.max(30 * 2 ** Number(job.attempts), error instanceof DownloadError ? error.retryAfter : 0);
    await conn.query("UPDATE document_jobs SET state = $3, last_error = $4, last_http = $5, lease_token = NULL, lease_until = NULL, available_at = now() + $6 * interval '1 second', updated_at = now() WHERE id = $1 AND lease_token = $2", [job.id, job.lease_token, state, message, status, delay]);
    await conn.query("UPDATE document_attempts SET finished_at = now(), outcome = $2, detail = $3, http_status = $4, sha256 = $5 WHERE id = $1", [attempt.rows[0].id, state, message, status, hash]);
  }
}

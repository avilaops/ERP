import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withTenantConnection, closeTenantPools } from "../src/lib/db/pool.ts";
import { claimDocumentJob, ingestDocumentJob, seedDocuments, FISCAL_SEEDS, extractDocument, discoverLinks } from "../src/lib/documents/ingest.ts";
import { downloadDocument } from "../src/lib/documents/download.ts";
import { saveBlob, blobPath } from "../src/lib/documents/storage.ts";

const [command, tenant = "ludus", amount = "20"] = process.argv.slice(2);
const root = process.env.ERP_DOCUMENTS_ROOT;
if (!root) throw new Error("Configure ERP_DOCUMENTS_ROOT em um volume persistente.");
if (command === "probe") {
  for (const url of FISCAL_SEEDS) {
    try {
      const file = await downloadDocument(url, ["www.nfe.fazenda.gov.br", "nfe.fazenda.gov.br"]);
      const hash = await saveBlob(root, file.bytes);
      const extracted = await extractDocument(blobPath(root, hash), "index.html", "text/html", process.env.ERP_DOCUMENTS_PYTHON ?? "python3");
      const links = discoverLinks(extracted.links, file.url, ["www.nfe.fazenda.gov.br", "nfe.fazenda.gov.br"]);
      console.log(JSON.stringify({ url, final: file.url, status: file.status, bytes: file.bytes.length, sha256: hash, title: extracted.title, links: links.filter(x => x.disposition === "queued").length, examples: links.filter(x => x.disposition === "queued").slice(0, 4) }));
    } catch (error) { console.log(JSON.stringify({ url, error: error instanceof Error ? error.message : String(error) })); }
  }
} else {
  const name = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!/_(test|demo)$/.test(name) && process.env.ERP_DOCUMENTS_PRODUCTION_APPROVED !== "1") throw new Error("Ingestão de produção exige aprovação e ERP_DOCUMENTS_PRODUCTION_APPROVED=1.");
  try {
    await withTenantConnection(tenant, async (conn) => {
      if (command === "seed") await seedDocuments(conn, "documents-worker@avilaops.local");
      else if (command === "run" || command === "watch") {
        const max = Math.min(2000, Math.max(1, Number(amount) || 20));
        let stopped = false;
        const stop = () => { stopped = true; };
        process.once("SIGTERM", stop);
        process.once("SIGINT", stop);
        for (let i = 0; !stopped && (command === "watch" || i < max); i++) {
          const job = await claimDocumentJob(conn);
          if (!job) {
            if (command !== "watch") break;
            await new Promise((done) => setTimeout(done, 15_000));
            continue;
          }
          await ingestDocumentJob(job, conn, root, process.env.ERP_DOCUMENTS_PYTHON ?? "python3");
          const result = await conn.query("SELECT id::text,state,last_error FROM document_jobs WHERE id = $1", [job.id]);
          console.log(JSON.stringify(result.rows[0]));
          await new Promise((done) => setTimeout(done, 1000));
        }
        process.removeListener("SIGTERM", stop);
        process.removeListener("SIGINT", stop);
      } else if (command === "manifest") {
        const { rows } = await conn.query(`SELECT j.id::text, s.url AS root, j.url, j.state, j.attempts, j.last_error, j.last_http,
          (SELECT json_agg(json_build_object('sha256',a.sha256,'outcome',a.outcome,'bytes',a.bytes)) FROM document_attempts a WHERE a.job_id=j.id) AS attempts_detail
          FROM document_jobs j JOIN document_sources s ON s.id=j.source_id ORDER BY j.id`);
        const summary = await conn.query("SELECT state,count(*)::int AS total FROM document_jobs GROUP BY state");
        const excluded = await conn.query("SELECT DISTINCT l.url,l.reason FROM document_links l WHERE l.disposition='excluded' ORDER BY l.url");
        const versions = await conn.query("SELECT v.id::text,d.url,v.sha256,v.mime,v.status,v.warnings,v.extractor,v.collected_at,v.metadata->>'original_filename' AS original_filename,(SELECT count(*)::int FROM document_chunks ch WHERE ch.version_id=v.id) AS chunks,(SELECT count(*)::int FROM document_schema_elements e WHERE e.version_id=v.id) AS schema_elements FROM document_versions v JOIN library_documents d ON d.id=v.document_id ORDER BY v.id");
        const dir = resolve(".work/documents-manifest");
        await mkdir(dir, { recursive: true });
        await writeFile(resolve(dir, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), tenant, coveragePolicy:"Classified links are not the same as downloaded/extracted/indexed documents. Pending, partial and failed remain incomplete.", summary: summary.rows, links: rows, excluded:excluded.rows, versions:versions.rows }, null, 2));
        const csv = ["id,url,state,attempts,last_error", ...rows.map(r => [r.id,r.url,r.state,r.attempts,r.last_error ?? ""].map(v => `"${String(v).replaceAll('"', '""')}"`).join(","))].join("\n");
        await writeFile(resolve(dir, "manifest.csv"), csv);
        console.log(JSON.stringify({ path: dir, summary: summary.rows }));
      } else throw new Error("Use seed, run, manifest ou probe.");
    });
  } finally { await closeTenantPools(); }
}

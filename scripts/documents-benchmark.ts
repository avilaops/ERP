/** Reproducible benchmark in a disposable schema, never in a production database. */
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { cpus, totalmem } from "node:os";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { migrate } from "../src/lib/db/migrate.ts";
import { fileURLToPath } from "node:url";
import { searchDocuments, documentFilter, DOCUMENT_SEARCH_SQL } from "../src/lib/db/documents.ts";

const url = process.env.ERP_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("Benchmark exige banco _test.");
const schema = `test_document_bench_${randomBytes(5).toString("hex")}`;
const db = new pg.Client({ connectionString: url });
await db.connect();
await db.query(`CREATE SCHEMA ${schema}`);
await db.query(`SET search_path TO ${schema}`);
const rows = Math.min(100_000, Math.max(1000, Number(process.argv[2]) || 10_000));
try {
  await migrate(db, fileURLToPath(new URL("../db/migrations/", import.meta.url)));
  await db.query("INSERT INTO document_collections(slug,name,visibility,owner_email) VALUES('bench','Benchmark','official','bench@teste.local')");
  await db.query("INSERT INTO document_sources(collection_id,url,allowed_hosts) VALUES(1,'https://example.org',ARRAY['example.org'])");
  await db.query("INSERT INTO library_documents(collection_id,source_id,url,title) SELECT 1,1,'https://example.org/'||g,'Nota Técnica '||g FROM generate_series(1,$1::int) g", [rows]);
  await db.query(`INSERT INTO document_versions(document_id,sha256,mime,bytes,final_url,extractor,status)
    SELECT id, repeat('a',64),CASE WHEN id%2=0 THEN 'application/pdf' ELSE 'application/xml' END,1000,url,'benchmark','indexed' FROM library_documents`);
  await db.query("UPDATE library_documents d SET current_version_id=v.id FROM document_versions v WHERE v.document_id=d.id");
  await db.query(`INSERT INTO document_chunks(version_id,ordinal,page,content)
    SELECT id,1,1,CASE WHEN id%10=0 THEN 'Autorização NF-e rejeição tributação protocolo' ELSE 'Leiaute de campos XML eventos distribuição documentos' END FROM document_versions`);
  await db.query("INSERT INTO document_schema_elements(version_id,namespace,name,kind) SELECT id,'urn:nfe','cStat','element' FROM document_versions WHERE id%100=0");
  await db.query("ANALYZE");
  const who = { email: "bench@teste.local", role: "DIRETORIA" as const };
  const cases = [{ q:"" }, { q:"rejeição" }, { q:"cStat" }, { q:"distribuição",tipo:"application/xml",colecao:"1" }];
  const results = [];
  for (const query of cases) {
    const times = [];
    const serverTimes: number[] = [];
    for (let i = 0; i < 25; i++) {
      const start = performance.now();
      await searchDocuments(documentFilter(query, 10), who, db);
      if (i >= 5) times.push(performance.now() - start);
      if (i >= 5) {
        const f = documentFilter(query, 10);
        const plan = await db.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + DOCUMENT_SEARCH_SQL, [who.email,true,f.q,f.kind,f.collection||null,null,11,f.status,f.category,f.from||null,f.until||null,f.version||null,1]);
        serverTimes.push(Number(plan.rows[0]["QUERY PLAN"][0]["Execution Time"]));
      }
    }
    times.sort((a,b)=>a-b);
    serverTimes.sort((a,b)=>a-b);
    results.push({ query, repetitions:times.length,client_including_network:{p50_ms:times[Math.floor(times.length*.5)],p95_ms:times[Math.ceil(times.length*.95)-1]},database_execution:{p50_ms:serverTimes[Math.floor(serverTimes.length*.5)],p95_ms:serverTimes[Math.ceil(serverTimes.length*.95)-1]} });
  }
  const plans = await db.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM document_chunks WHERE search_vector @@ websearch_to_tsquery('portuguese','rejeição')");
  const server = await db.query("SELECT version(), pg_size_pretty(pg_total_relation_size('document_chunks')) AS chunks_size");
  await mkdir(".work/documents-manifest", { recursive:true });
  const report = { generatedAt:new Date().toISOString(),documents:rows,chunks:rows,concurrency:1,transport:"SSH tunnel; client wall time includes network, server plan time is separate",client:{cpu:cpus()[0]?.model,memoryBytes:totalmem()},server:server.rows[0],results,plans:plans.rows[0] };
  await writeFile(".work/documents-manifest/benchmark.json",JSON.stringify(report,null,2));
  console.log(JSON.stringify({ documents:rows,concurrency:1,results,report:".work/documents-manifest/benchmark.json" }));
} finally {
  await db.query(`DROP SCHEMA ${schema} CASCADE`);
  await db.end();
}

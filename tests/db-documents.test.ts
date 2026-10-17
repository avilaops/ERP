import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { openTestDb, SKIP_WITHOUT_DB, type TestDb } from "./db-helpers.ts";
import { seedDocuments, claimDocumentJob } from "@/lib/documents/ingest";
import { searchDocuments, documentFilter, getDocument, retryDocumentJob } from "@/lib/db/documents";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
const director = { email: "diretoria@teste.local", role: "DIRETORIA" as const };
const seller = { email: "vendedor@teste.local", role: "VENDEDOR" as const };
before(async () => { if (!skip) db = await openTestDb("documents"); });
after(async () => { if (!skip) await db.close(); });

test("documentos: seeds idempotentes, leases exclusivos e recuperação de queda", { skip }, async () => {
  await seedDocuments(db.pool, director.email);
  await seedDocuments(db.pool, director.email);
  assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM document_jobs")).rows[0].n, 4);
  const claimed = await Promise.all([claimDocumentJob(db.pool), claimDocumentJob(db.pool)]);
  assert.notEqual(claimed[0]!.id, claimed[1]!.id);
  await db.pool.query("UPDATE document_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [claimed[0]!.id]);
  const reclaimed = await claimDocumentJob(db.pool);
  assert.equal(reclaimed!.id, claimed[0]!.id);
  assert.notEqual(reclaimed!.lease_token, claimed[0]!.lease_token);
  await db.pool.query("UPDATE document_jobs SET attempts=3,lease_until=now()-interval '1 second' WHERE id=$1", [reclaimed!.id]);
  await claimDocumentJob(db.pool);
  assert.equal((await db.pool.query("SELECT state FROM document_jobs WHERE id=$1", [reclaimed!.id])).rows[0].state, "failed");
  await retryDocumentJob(String(reclaimed!.id), db.pool);
  assert.equal((await db.pool.query("SELECT attempts FROM document_jobs WHERE id=$1", [reclaimed!.id])).rows[0].attempts, 0);
});

test("documentos: busca FTS, campo exato, paginação e coleção privada respeitam acesso", { skip }, async () => {
  const collection = await db.pool.query("INSERT INTO document_collections(slug,name,visibility,owner_email) VALUES('privada','Restrita','private',$1) RETURNING id", [director.email]);
  const source = await db.pool.query("INSERT INTO document_sources(collection_id,url,allowed_hosts) VALUES($1,'https://example.org/a.pdf',ARRAY['example.org']) RETURNING id", [collection.rows[0].id]);
  const d = await db.pool.query("INSERT INTO library_documents(collection_id,source_id,url,title) VALUES($1,$2,'https://example.org/a.pdf','Nota Técnica 2026') RETURNING id", [collection.rows[0].id, source.rows[0].id]);
  const id = String(d.rows[0].id);
  const v = await db.pool.query("INSERT INTO document_versions(document_id,sha256,mime,bytes,final_url,extractor,status) VALUES($1,$2,'application/pdf',9,'https://example.org/a.pdf','test','indexed') RETURNING id", [id, "a".repeat(64)]);
  await db.pool.query("UPDATE library_documents SET current_version_id=$2 WHERE id=$1", [id,v.rows[0].id]);
  await db.pool.query("INSERT INTO document_chunks(version_id,ordinal,page,content) VALUES($1,1,7,'Autorização de documentos eletrônicos: rejeições e validações')", [v.rows[0].id]);
  await db.pool.query("INSERT INTO document_schema_elements(version_id,namespace,name,kind) VALUES($1,'urn:teste','cStat','element')", [v.rows[0].id]);
  assert.equal(await getDocument(id, seller, db.pool), null);
  assert.equal((await searchDocuments(documentFilter({ q: "rejeições" }), seller, db.pool)).rows.length, 0);
  assert.equal((await searchDocuments(documentFilter({ q: "rejeições" }), director, db.pool)).rows.length, 1);
  assert.equal((await searchDocuments(documentFilter({ q: "cStat" }), director, db.pool)).rows.length, 1);
  assert.equal((await searchDocuments(documentFilter({ q: "urn:teste" }), director, db.pool)).rows.length, 1);
  assert.equal((await searchDocuments(documentFilter({ q: "cStat", antes:`${id}:3` }), director, db.pool)).rows.length, 0);
  assert.equal((await searchDocuments(documentFilter({ versao:String(v.rows[0].id),estado:"indexed" }), director, db.pool)).rows.length, 1);
  assert.equal((await searchDocuments(documentFilter({ de:"2099-01-01" }), director, db.pool)).rows.length, 0);
  assert.equal((await searchDocuments(documentFilter({ ate:"2000-01-01" }), director, db.pool)).rows.length, 0);
  assert.equal((await searchDocuments(documentFilter({ antes:id }), director, db.pool)).rows.length, 0);
  await db.pool.query("UPDATE document_collections SET visibility='official' WHERE id=$1", [collection.rows[0].id]);
  assert.equal((await searchDocuments(documentFilter({}), seller, db.pool)).rows.length, 1);
  assert.equal((await getDocument(id, seller, db.pool))?.id, id);
  const other = await openTestDb("documents_other");
  try { assert.equal(await getDocument(id, director, other.pool), null); }
  finally { await other.close(); }
});

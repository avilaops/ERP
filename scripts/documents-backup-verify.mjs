/** Verify an isolated tenant backup; production names are rejected. */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { resolve, join } from 'node:path';
import pg from 'pg';

const database = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
if (database !== 'erp_documents_test') throw Error('Este ensaio exige erp_documents_test.');
const storage = process.env.ERP_DOCUMENTS_ROOT;
if (!storage) throw Error('ERP_DOCUMENTS_ROOT obrigatório.');
const destination = `erp_documents_restore_${randomBytes(4).toString('hex')}_test`;
if (!/^erp_documents_restore_[a-f0-9]{8}_test$/.test(destination)) throw Error('Destino inválido.');
const directory = resolve('.work/documents-backup');
await mkdir(directory, { recursive: true });
const remote = (command, input) => execFileSync('ssh', ['-o', 'BatchMode=yes', 'applications', command], { input, timeout: 120000, maxBuffer: 128000000, windowsHide: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let created = false;
try {
  const source = await db.query(`SELECT
    (SELECT count(*)::int FROM tenant_ludus.library_documents) AS documents,
    (SELECT count(*)::int FROM tenant_ludus.document_versions) AS versions,
    (SELECT count(*)::int FROM tenant_ludus.document_chunks) AS chunks,
    (SELECT count(*)::int FROM tenant_ludus.document_schema_elements) AS elements`);
  const hashes = await db.query('SELECT DISTINCT sha256 FROM tenant_ludus.document_versions ORDER BY sha256');
  const dump = remote('sudo -n -u postgres pg_dump -Fc --schema=tenant_ludus erp_documents_test');
  await writeFile(join(directory, 'tenant.dump'), dump, { mode: 0o600 });
  console.log('Dump isolado salvo; conferindo originais e restauração.');
  for (const { sha256: hash } of hashes.rows) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('Hash inválido no banco.');
    const bytes = await readFile(join(storage, 'sha256', hash.slice(0, 2), hash));
    if (createHash('sha256').update(bytes).digest('hex') !== hash) throw Error('Original corrompido.');
    const folder = join(directory, 'originals', 'sha256', hash.slice(0, 2));
    await mkdir(folder, { recursive: true });
    await copyFile(join(storage, 'sha256', hash.slice(0, 2), hash), join(folder, hash));
    const backup = await readFile(join(folder, hash));
    if (createHash('sha256').update(backup).digest('hex') !== hash) throw Error('Cópia corrompida.');
  }
  remote(`sudo -n -u postgres createdb ${destination}`);
  created = true;
  remote(`sudo -n -u postgres pg_restore --no-owner --exit-on-error -d ${destination}`, dump);
  const sql = `SELECT json_build_object('documents',(SELECT count(*) FROM tenant_ludus.library_documents),'versions',(SELECT count(*) FROM tenant_ludus.document_versions),'chunks',(SELECT count(*) FROM tenant_ludus.document_chunks),'elements',(SELECT count(*) FROM tenant_ludus.document_schema_elements));`;
  const restored = JSON.parse(remote(`sudo -n -u postgres psql -At -d ${destination}`, sql).toString().trim());
  for (const key of Object.keys(source.rows[0])) if (Number(restored[key]) !== Number(source.rows[0][key])) throw Error(`Contagem divergente: ${key}`);
  remote(`sudo -n -u postgres dropdb ${destination}`);
  created = false;
  const report = { at: new Date().toISOString(), source: database, restoredInto: destination, counts: restored, originalHashesVerified: hashes.rows.length, originalsCopiedAndVerified: hashes.rows.length, dumpBytes: dump.length, productionChanged: false, temporaryDatabaseRemoved: true };
  await writeFile(join(directory, 'verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  if (created) remote(`sudo -n -u postgres dropdb ${destination}`);
  await db.end();
}

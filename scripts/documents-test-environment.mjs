/** Isolated PostgreSQL on the existing server; no production database is changed. */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

mkdirSync('.work', { recursive: true });
const envFile = resolve('.work/documents.env');
if (!existsSync(envFile)) {
  const password = randomBytes(24).toString('hex');
  const sql = `CREATE ROLE erp_documents_dev LOGIN PASSWORD '${password}';\nCREATE DATABASE erp_documents_test OWNER erp_documents_dev;\n`;
  const result = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', 'applications', 'sudo -n -u postgres psql -v ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Não foi possível preparar o banco isolado. Confira o papel e o banco antes de repetir.');
  writeFileSync(envFile, [
    `DATABASE_URL=postgresql://erp_documents_dev:${password}@127.0.0.1:15439/erp_documents_test`,
    `ERP_TEST_DATABASE_URL=postgresql://erp_documents_dev:${password}@127.0.0.1:15439/erp_documents_test`,
    'ERP_TENANTS=ludus:Ludus Equipamentos',
    'ERP_LOCAL_LOGIN=1',
    'ERP_USERS=diretoria@teste.local:DIRETORIA@ludus,gerente@teste.local:GERENTE_COMERCIAL@ludus,vendedor@teste.local:VENDEDOR@ludus,financeiro@teste.local:FINANCEIRO@ludus',
    `ERP_DOCUMENTS_ROOT=${resolve('.work/documents-storage').replaceAll('\\', '/')}`,
    `ERP_DOCUMENTS_PYTHON=${resolve('.work/documents-venv/Scripts/python.exe').replaceAll('\\', '/')}`,
    'APP_URL=http://localhost:3020',
  ].join('\n') + '\n', { mode: 0o600 });
}
const tunnel = spawn('ssh', ['-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-L', '127.0.0.1:15439:127.0.0.1:5432', 'applications'], { detached: true, stdio: 'ignore', windowsHide: true });
tunnel.unref();
writeFileSync('.work/documents-tunnel.pid', String(tunnel.pid));
console.log('Banco erp_documents_test preparado; túnel solicitado em 127.0.0.1:15439. Credenciais somente em .work/documents.env.');

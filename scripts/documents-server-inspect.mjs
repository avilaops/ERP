/** Read-only inspection. No credential columns or environment values are read. */
import { spawnSync } from 'node:child_process';
const sql = `SELECT current_database(), current_setting('server_version'), pg_size_pretty(pg_database_size(current_database()));
SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables WHERE relname ILIKE '%data%table%' ORDER BY schemaname,relname;
SELECT extname FROM pg_extension ORDER BY extname;`;
const result = spawnSync('ssh', ['-o','BatchMode=yes','-o','ConnectTimeout=10','applications','sudo -n -u postgres psql -d n8n -At -v ON_ERROR_STOP=1'], { input:sql,encoding:'utf8',windowsHide:true,timeout:30000 });
console.log(result.stdout);
if (result.status !== 0) throw new Error('Inspeção PostgreSQL n8n não concluída.');

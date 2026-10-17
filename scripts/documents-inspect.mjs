import { existsSync } from 'node:fs';
import pg from 'pg';

for (const file of ['.env.local', '.env.test.local']) if (existsSync(file)) process.loadEnvFile(file);
for (const key of ['DATABASE_URL', 'ERP_TEST_DATABASE_URL']) {
  const value = process.env[key];
  if (!value) { console.log(JSON.stringify({ key, configured: false })); continue; }
  const u = new URL(value);
  const client = new pg.Client({ connectionString: value, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT current_database() AS database, current_setting('server_version') AS version, pg_size_pretty(pg_database_size(current_database())) AS size");
    console.log(JSON.stringify({ key, host: u.hostname, port: u.port || '5432', ...rows[0] }));
  } catch (error) { console.log(JSON.stringify({ key, host: u.hostname, reachable: false, code: error.code })); }
  finally { await client.end(); }
}

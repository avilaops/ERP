/**
 * Applies the pending migrations of db/migrations/ to the schema of every
 * company in ERP_TENANTS, in the database of DATABASE_URL. A company that has
 * no schema yet gets one. Run with `npm run db:migrate`; running it again
 * changes nothing.
 */
import { fileURLToPath } from "node:url";
import pg from "pg";
import { parseTenants } from "../src/lib/auth/tenants.ts";
import { databaseUrl, tenantSchema } from "../src/lib/db/config.ts";
import { migrate } from "../src/lib/db/migrate.ts";

const dir = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const tenants = parseTenants(process.env.ERP_TENANTS);
if (tenants.length === 0) {
  console.error("ERP_TENANTS ausente: não há empresa para migrar. Ex.: ERP_TENANTS=ludus:Ludus Equipamentos");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl(process.env) });
await client.connect();
try {
  for (const tenant of tenants) {
    // The schema name is built from a checked identifier, never from free text.
    const schema = tenantSchema(tenant.slug);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    const applied = await migrate(client, dir);
    console.log(
      `${tenant.name} (${schema}): ${applied.length === 0 ? "em dia, nenhuma migração pendente." : `aplicadas ${applied.join(", ")}`}`,
    );
  }
} finally {
  await client.end();
}

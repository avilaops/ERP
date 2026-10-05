/**
 * Applies the pending migrations of db/migrations/ to the database of
 * DATABASE_URL. Run with `npm run db:migrate`; running it again changes nothing.
 */
import { fileURLToPath } from "node:url";
import pg from "pg";
import { databaseUrl } from "../src/lib/db/config.ts";
import { migrate } from "../src/lib/db/migrate.ts";

const dir = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const client = new pg.Client({ connectionString: databaseUrl(process.env) });

await client.connect();
try {
  const applied = await migrate(client, dir);
  console.log(applied.length === 0 ? "Banco em dia: nenhuma migração pendente." : `Aplicadas: ${applied.join(", ")}`);
} finally {
  await client.end();
}

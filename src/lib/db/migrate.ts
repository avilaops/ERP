import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** One connection (not a pool): each migration runs in a transaction of its own. */
export type MigrationClient = {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

const FILE_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * Applies, in order, every `NNNN_nome.sql` of `dir` not yet recorded in
 * `schema_migrations`. Safe to run again: applied files are skipped. Returns
 * the names applied in this run.
 */
export async function migrate(client: MigrationClient, dir: string): Promise<string[]> {
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  for (const name of files) {
    if (!FILE_NAME.test(name)) throw new Error(`Nome de migração inválido: "${name}". Use NNNN_nome.sql.`);
  }

  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const { rows } = await client.query("SELECT name FROM schema_migrations");
  const done = new Set(rows.map((row) => String(row.name)));

  const applied: string[] = [];
  for (const name of files) {
    if (done.has(name)) continue;
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(join(dir, name), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migração ${name} falhou: ${error instanceof Error ? error.message : String(error)}`);
    }
    applied.push(name);
  }
  return applied;
}

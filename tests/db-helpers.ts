import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrate } from "@/lib/db/migrate";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../db/migrations/", import.meta.url));

const TEST_URL = process.env.ERP_TEST_DATABASE_URL?.trim() ?? "";

/** Passed to `test(..., { skip })`: database tests are skipped, visibly, without the variable. */
export const SKIP_WITHOUT_DB: string | false =
  TEST_URL === "" ? "ERP_TEST_DATABASE_URL ausente: testes de banco pulados" : false;

/** The test database URL. Refuses anything whose name does not end in `_test`. */
export function testDatabaseUrl(url: string = TEST_URL): string {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!name.endsWith("_test")) {
    throw new Error(`Testes de banco só rodam em banco com nome terminado em _test (recebido: "${name}").`);
  }
  return url;
}

export type TestDb = {
  pool: pg.Pool;
  schema: string;
  /** Drops the schema and closes the pool. */
  close(): Promise<void>;
};

/**
 * A schema of its own for one test file (files run in parallel), with every
 * connection of the pool looking only at it. `migrated: false` leaves it empty.
 */
export async function openTestDb(label: string, { migrated = true } = {}): Promise<TestDb> {
  const url = testDatabaseUrl();
  const schema = `test_${label}_${randomBytes(5).toString("hex")}`;

  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.end();

  const pool = new pg.Pool({ connectionString: url, max: 3, options: `-c search_path=${schema}` });
  if (migrated) {
    const client = await pool.connect();
    try {
      await migrate(client, MIGRATIONS_DIR);
    } finally {
      client.release();
    }
  }

  return {
    pool,
    schema,
    async close() {
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    },
  };
}

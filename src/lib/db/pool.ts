import pg from "pg";
import { databaseUrl, tenantSchema } from "@/lib/db/config";

/** What a repository needs from a connection. A pool, a client and a test pool all fit. */
export type Queryable = {
  query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<Row>>;
};

declare global {
  var __ERP_DB_POOLS__: Map<string, pg.Pool> | undefined;
}

/**
 * The database of one company: a pool whose connections see only that company's
 * schema. There is no connection "of the system": every read and write names
 * the company it is for, and the company comes from the session
 * (`session.tenant.slug`). Created on the first query, never at import time, so
 * `next build` runs without DATABASE_URL; kept on globalThis so the dev server's
 * reloads do not open a new pool each time.
 */
export function tenantDb(slug: string): Queryable {
  const schema = tenantSchema(slug);
  const pools = (globalThis.__ERP_DB_POOLS__ ??= new Map());
  let pool = pools.get(schema);
  if (!pool) {
    pool = new pg.Pool({ connectionString: databaseUrl(process.env), max: 5, options: `-c search_path=${schema}` });
    pools.set(schema, pool);
  }
  return pool;
}

/** Closes every pool. For scripts and tests; the server keeps them open. */
export async function closeTenantPools(): Promise<void> {
  const pools = [...(globalThis.__ERP_DB_POOLS__?.values() ?? [])];
  globalThis.__ERP_DB_POOLS__ = new Map();
  await Promise.all(pools.map((pool) => pool.end()));
}

/** PostgreSQL error code, when the thrown value is a database error. */
export function pgErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

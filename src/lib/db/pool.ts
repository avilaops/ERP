import pg from "pg";
import { databaseUrl } from "@/lib/db/config";

/** What a repository needs from a connection. A pool, a client and a test pool all fit. */
export type Queryable = {
  query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<Row>>;
};

declare global {
  var __ERP_DB_POOL__: pg.Pool | undefined;
}

/**
 * The application pool. Created on the first query, never at import time, so
 * `next build` runs without DATABASE_URL; kept on globalThis so the dev
 * server's reloads do not open a new pool each time.
 */
export function db(): Queryable {
  globalThis.__ERP_DB_POOL__ ??= new pg.Pool({ connectionString: databaseUrl(process.env), max: 5 });
  return globalThis.__ERP_DB_POOL__;
}

/** PostgreSQL error code, when the thrown value is a database error. */
export function pgErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

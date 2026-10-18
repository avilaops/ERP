import type { Queryable } from "@/lib/db/pool";

/** Serializes irreversible numbering decisions inside one fiscal environment and series. */
export async function lockFiscalNumbering(environment: "homologacao" | "producao", series: number, conn: Queryable): Promise<void> {
  await conn.query(
    "SELECT pg_advisory_xact_lock(hashtext('erp-fiscal-numbering'), hashtext(current_schema() || ':' || $1 || ':' || $2::text))",
    [environment, series],
  );
}

import { createHash } from "node:crypto";
import type { Queryable } from "@/lib/db/pool";
import { withQueryableConnection } from "@/lib/db/pool";
import { importReceivedNfe } from "@/lib/db/received-nfes";
import type { DistributedDocument, DistributionResult } from "@/lib/fiscal/distribution";
import { validateReceivedNfe } from "@/lib/fiscal/received-nfe";

export type DistributionStanding = {
  lastNsu: string; maxNsu: string; nextQueryAt: Date; lastCode: string | null; lastReason: string | null; lastQueriedAt: Date | null;
  pending: number; summaries: number; events: number; full: number;
};

export async function distributionStanding(conn: Queryable): Promise<DistributionStanding> {
  const [state, counts] = await Promise.all([
    conn.query("SELECT last_nsu, max_nsu, next_query_at, last_code, last_reason, last_queried_at FROM fiscal_distribution_state WHERE id = true"),
    conn.query(`SELECT count(*) FILTER (WHERE processed_at IS NULL)::int AS pending, count(*) FILTER (WHERE kind='summary')::int AS summaries,
                       count(*) FILTER (WHERE kind='event')::int AS events, count(*) FILTER (WHERE kind='full')::int AS full
                  FROM fiscal_distributed_documents`),
  ]);
  const row = state.rows[0]; const count = counts.rows[0];
  return { lastNsu: String(row.last_nsu), maxNsu: String(row.max_nsu), nextQueryAt: row.next_query_at as Date,
    lastCode: row.last_code === null ? null : String(row.last_code), lastReason: row.last_reason === null ? null : String(row.last_reason),
    lastQueriedAt: row.last_queried_at as Date | null, pending: Number(count.pending), summaries: Number(count.summaries), events: Number(count.events), full: Number(count.full) };
}

/** Saves every returned document before advancing the durable cursor. */
export async function saveDistributionBatch(result: DistributionResult, now: Date, conn: Queryable): Promise<void> {
  await withQueryableConnection(conn, async (held) => {
    await held.query("BEGIN");
    try {
      const state = await held.query("SELECT last_nsu, max_nsu FROM fiscal_distribution_state WHERE id = true FOR UPDATE");
      const previous = String(state.rows[0].last_nsu);
      if (!new Set(["137", "138", "656"]).has(result.code)) throw new Error(`A distribuição foi recusada pela SEFAZ (${result.code}): ${result.reason}`);
      if (result.code !== "656" && BigInt(result.lastNsu) < BigInt(previous)) throw new Error("A SEFAZ devolveu um cursor anterior ao já processado.");
      for (const document of result.documents) {
        const stored = await held.query(
          `INSERT INTO fiscal_distributed_documents (nsu, schema_name, kind, xml, xml_sha256)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (nsu) DO UPDATE SET schema_name=EXCLUDED.schema_name
             WHERE fiscal_distributed_documents.xml_sha256=EXCLUDED.xml_sha256 AND fiscal_distributed_documents.schema_name=EXCLUDED.schema_name
           RETURNING nsu`,
          [document.nsu, document.schema, document.kind, document.xml, createHash("sha256").update(document.xml, "utf8").digest("hex")],
        );
        if (!stored.rows[0]) throw new Error(`O NSU ${document.nsu} já existe com conteúdo diferente. O cursor não avançou.`);
      }
      const wait = result.code === "137" || result.code === "656" ? 60 : 0;
      await held.query(
        `UPDATE fiscal_distribution_state SET last_nsu=$1,max_nsu=$2,next_query_at=$3::timestamptz + ($4 * interval '1 minute'),
           last_code=$5,last_reason=$6,last_queried_at=$3,updated_at=now() WHERE id=true`,
        [result.code === "656" ? previous : result.lastNsu, result.code === "656" ? String(state.rows[0].max_nsu ?? previous) : result.maxNsu, now, wait, result.code, result.reason],
      );
      await held.query("COMMIT");
    } catch (error) { await held.query("ROLLBACK"); throw error; }
  });
}

/** Turns stored full documents into received invoices. Summaries/events stay available for audit. */
export async function processDistributedDocuments(recipientDocument: string, conn: Queryable): Promise<{ imported: number; failed: number }> {
  const { rows } = await conn.query<DistributedDocument & { nsu: string }>(
    `SELECT nsu, schema_name AS schema, kind, xml FROM fiscal_distributed_documents WHERE processed_at IS NULL ORDER BY nsu LIMIT 50`,
  );
  let imported = 0; let failed = 0;
  for (const row of rows) {
    if (row.kind !== "full") {
      await conn.query("UPDATE fiscal_distributed_documents SET processed_at=now(),process_error=NULL WHERE nsu=$1", [row.nsu]);
      continue;
    }
    try {
      const note = await validateReceivedNfe(String(row.xml));
      if (note.recipientDocument !== recipientDocument) throw new Error("O destinatário do XML não é a empresa desta consulta.");
      const saved = await importReceivedNfe(note, "distribuição SEFAZ", conn);
      await conn.query("UPDATE fiscal_distributed_documents SET processed_at=now(),process_error=NULL,nfe_id=$2 WHERE nsu=$1", [row.nsu, saved.id]);
      imported += saved.created ? 1 : 0;
    } catch (error) {
      await conn.query("UPDATE fiscal_distributed_documents SET processed_at=now(),process_error=$2 WHERE nsu=$1", [row.nsu, error instanceof Error ? error.message.slice(0, 1000) : "Falha ao conferir documento."]);
      failed += 1;
    }
  }
  return { imported, failed };
}

import { createHash } from "node:crypto";
import type { Queryable } from "@/lib/db/pool";
import { withQueryableConnection } from "@/lib/db/pool";
import { importReceivedNfe } from "@/lib/db/received-nfes";
import type { DistributedDocument, DistributionResult } from "@/lib/fiscal/distribution";
import { parseDistributedNfeEvent, parseNfeSummary } from "@/lib/fiscal/distribution";
import { validateReceivedNfe } from "@/lib/fiscal/received-nfe";

export type DistributionStanding = {
  lastNsu: string; maxNsu: string; nextQueryAt: Date; lastCode: string | null; lastReason: string | null; lastQueriedAt: Date | null;
  pending: number; summaries: number; events: number; full: number;
};

export type NfeSummaryRow = { nsu: string; accessKey: string; issuerDocument: string; issuerName: string; issuedAt: Date; totalInvoice: number; situation: string; fullNfeId: number | null };

export async function listNfeSummaries(conn: Queryable): Promise<NfeSummaryRow[]> {
  const { rows } = await conn.query("SELECT nsu,access_key,issuer_document,issuer_name,issued_at,total_invoice,situation,full_nfe_id FROM fiscal_received_nfe_summaries WHERE full_nfe_id IS NULL ORDER BY issued_at DESC,nsu DESC");
  return rows.map((row) => ({ nsu: String(row.nsu), accessKey: String(row.access_key), issuerDocument: String(row.issuer_document), issuerName: String(row.issuer_name), issuedAt: row.issued_at as Date, totalInvoice: Number(row.total_invoice), situation: String(row.situation), fullNfeId: row.full_nfe_id === null ? null : Number(row.full_nfe_id) }));
}

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
    if (row.kind === "summary") {
      try {
        const summary = parseNfeSummary(String(row.xml));
        await conn.query(`INSERT INTO fiscal_received_nfe_summaries (nsu,access_key,issuer_document,issuer_name,issued_at,total_invoice,situation)
          VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (nsu) DO UPDATE SET situation=EXCLUDED.situation WHERE fiscal_received_nfe_summaries.access_key=EXCLUDED.access_key`,
        [row.nsu, summary.accessKey, summary.issuerDocument, summary.issuerName, summary.issuedAt, summary.totalInvoice, summary.situation]);
        await conn.query("UPDATE fiscal_distributed_documents SET processed_at=now(),process_error=NULL WHERE nsu=$1", [row.nsu]);
      } catch (error) {
        await conn.query("UPDATE fiscal_distributed_documents SET processed_at=now(),process_error=$2 WHERE nsu=$1", [row.nsu, error instanceof Error ? error.message.slice(0, 1000) : "Resumo inválido."]);
        failed += 1;
      }
      continue;
    }
    if (row.kind === "event") {
      try {
        const event = parseDistributedNfeEvent(String(row.xml));
        await conn.query(`INSERT INTO fiscal_received_nfe_events (nsu,access_key,event_type,sequence,status_code,protocol,registered_at,xml)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (nsu) DO NOTHING`, [row.nsu, event.accessKey, event.eventType, event.sequence, event.statusCode, event.protocol, event.registeredAt, row.xml]);
        if (event.eventType === "110111" && ["135", "136", "155"].includes(event.statusCode)) {
          await conn.query("UPDATE fiscal_received_nfes SET canceled_at=COALESCE(canceled_at,$2),cancellation_protocol=COALESCE(cancellation_protocol,$3) WHERE access_key=$1", [event.accessKey, event.registeredAt, event.protocol]);
        }
        await conn.query("UPDATE fiscal_distributed_documents SET processed_at=now(),process_error=NULL WHERE nsu=$1", [row.nsu]);
      } catch (error) {
        await conn.query("UPDATE fiscal_distributed_documents SET processed_at=now(),process_error=$2 WHERE nsu=$1", [row.nsu, error instanceof Error ? error.message.slice(0, 1000) : "Evento inválido."]);
        failed += 1;
      }
      continue;
    }
    try {
      const note = await validateReceivedNfe(String(row.xml));
      if (note.recipientDocument !== recipientDocument) throw new Error("O destinatário do XML não é a empresa desta consulta.");
      const saved = await importReceivedNfe(note, "distribuição SEFAZ", conn);
      await conn.query("UPDATE fiscal_received_nfe_summaries SET full_nfe_id=$2 WHERE access_key=$1 AND full_nfe_id IS NULL", [note.accessKey, saved.id]);
      await conn.query(`UPDATE fiscal_received_nfes n SET canceled_at=e.registered_at,cancellation_protocol=e.protocol
        FROM fiscal_received_nfe_events e WHERE n.id=$1 AND e.access_key=n.access_key AND e.event_type='110111' AND e.status_code IN ('135','136','155') AND n.canceled_at IS NULL`, [saved.id]);
      await conn.query("UPDATE fiscal_distributed_documents SET processed_at=now(),process_error=NULL,nfe_id=$2 WHERE nsu=$1", [row.nsu, saved.id]);
      imported += saved.created ? 1 : 0;
    } catch (error) {
      await conn.query("UPDATE fiscal_distributed_documents SET processed_at=now(),process_error=$2 WHERE nsu=$1", [row.nsu, error instanceof Error ? error.message.slice(0, 1000) : "Falha ao conferir documento."]);
      failed += 1;
    }
  }
  return { imported, failed };
}

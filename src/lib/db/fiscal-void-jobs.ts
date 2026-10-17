import { IssueError, prepareNumberVoid, sendPreparedNumberVoid } from "@/lib/db/issue-nfe";
import type { NumberVoidRange } from "@/lib/db/issue-nfe";
import type { Queryable } from "@/lib/db/pool";
import { usedNumbersIn } from "@/lib/db/invoices";
import type { Send } from "@/lib/fiscal/channel";

const LEASE_MS = 2 * 60_000;

export type FiscalVoidJob = {
  id: number;
  environment: "homologacao" | "producao";
  issuerUf: string;
  range: NumberVoidRange;
  signedXml: string;
  requestedBy: string;
  attempts: number;
};

export type FiscalVoidJobSummary = {
  id: number;
  environment: "homologacao" | "producao";
  series: number;
  first: number;
  last: number;
  status: "pendente" | "processando" | "concluido" | "revisao_manual";
  attempts: number;
  lastError: string | null;
  runAfter: Date;
};

/** Signing and saving finish before the screen confirms the request; nothing is sent yet. */
export async function enqueueNumberVoid(range: NumberVoidRange, who: string, now: Date, vault: Buffer, conn: Queryable): Promise<{ id: number; joined: boolean }> {
  const prepared = await prepareNumberVoid(range, now, vault, conn);
  const { rows } = await conn.query(
    `INSERT INTO fiscal_void_jobs (environment, issuer_uf, series, first_number, last_number, reason, signed_xml, requested_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (environment, series, first_number, last_number) WHERE status IN ('pendente', 'processando')
     DO UPDATE SET updated_at = now()
     RETURNING id, reason, (xmax <> 0) AS joined`,
    [prepared.environment, prepared.issuerUf, prepared.series, prepared.first, prepared.last, prepared.reason, prepared.signedXml, who],
  );
  if (String(rows[0].reason) !== prepared.reason) throw new IssueError("Já há uma inutilização pendente para esta faixa com outra justificativa. Aguarde a conclusão ou revise a pendência antes de confirmar novamente.");
  return { id: Number(rows[0].id), joined: rows[0].joined === true };
}

export async function listNumberVoidJobs(conn: Queryable): Promise<FiscalVoidJobSummary[]> {
  const { rows } = await conn.query(
    "SELECT id, environment, series, first_number, last_number, status, attempts, last_error, run_after FROM fiscal_void_jobs ORDER BY id DESC LIMIT 10",
  );
  return rows.map((row) => ({
    id: Number(row.id), environment: row.environment as FiscalVoidJobSummary["environment"], series: Number(row.series), first: Number(row.first_number), last: Number(row.last_number),
    status: row.status as FiscalVoidJobSummary["status"], attempts: Number(row.attempts), lastError: row.last_error === null ? null : String(row.last_error), runAfter: row.run_after as Date,
  }));
}

async function claimNumberVoidJob(now: Date, conn: Queryable): Promise<FiscalVoidJob | null> {
  await conn.query(
    `UPDATE fiscal_void_jobs
        SET status = 'revisao_manual', lease_until = NULL,
            last_error = COALESCE(last_error, 'Processamento interrompido após o envio; confira a SEFAZ antes de qualquer retransmissão.'), updated_at = $1
      WHERE status = 'processando' AND lease_until <= $1`,
    [now],
  );
  const { rows } = await conn.query(
    `WITH candidate AS (
       SELECT id FROM fiscal_void_jobs
        WHERE status = 'pendente' AND run_after <= $1
        ORDER BY run_after, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE fiscal_void_jobs j
        SET status = 'processando', attempts = attempts + 1, lease_until = $2, updated_at = $1
       FROM candidate c
      WHERE j.id = c.id
      RETURNING j.id, j.environment, j.issuer_uf, j.series, j.first_number, j.last_number, j.reason, j.signed_xml, j.requested_by, j.attempts`,
    [now, new Date(now.getTime() + LEASE_MS)],
  );
  const row = rows[0];
  return row
    ? {
        id: Number(row.id), environment: row.environment as FiscalVoidJob["environment"], issuerUf: String(row.issuer_uf),
        range: { series: Number(row.series), first: Number(row.first_number), last: Number(row.last_number), reason: String(row.reason) },
        signedXml: String(row.signed_xml), requestedBy: String(row.requested_by), attempts: Number(row.attempts),
      }
    : null;
}

/** A missing answer is manual review: without a reliable consultation endpoint, automatic retransmission could duplicate a tax request. */
export async function runOneNumberVoidJob(now: Date, vault: Buffer, send: Send, conn: Queryable): Promise<"none" | "completed" | "retry" | "manual_review"> {
  const job = await claimNumberVoidJob(now, conn);
  if (!job) return "none";
  try {
    const used = await usedNumbersIn(job.environment, job.range.series, job.range.first, job.range.last, conn);
    const unresolvedIssue = await conn.query(
      `SELECT i.number FROM fiscal_jobs j
        JOIN fiscal_invoices i ON i.fiscal_job_id = j.id
       WHERE j.kind = 'emitir_nfe' AND j.status = 'revisao_manual' AND i.status = 'assinada'
         AND i.environment = $1 AND i.series = $2 AND i.number BETWEEN $3 AND $4
       LIMIT 1`,
      [job.environment, job.range.series, job.range.first, job.range.last],
    );
    const activeIssue = await conn.query(
      `SELECT 1 FROM fiscal_jobs j
        LEFT JOIN fiscal_invoices i ON i.fiscal_job_id = j.id
       WHERE j.kind = 'emitir_nfe' AND j.status IN ('pendente', 'processando')
         AND (i.id IS NULL OR (i.environment = $1 AND i.series = $2 AND i.number BETWEEN $3 AND $4))
       LIMIT 1`,
      [job.environment, job.range.series, job.range.first, job.range.last],
    );
    if (used.length > 0) {
      throw new IssueError(`A faixa passou a conter nota com veredito da SEFAZ (número ${used.join(", ")}); confira-a manualmente.`);
    }
    if (unresolvedIssue.rows[0]) {
      throw new IssueError(`A faixa contém a nota assinada ${Number(unresolvedIssue.rows[0].number)} em revisão manual; confira a situação na SEFAZ antes de inutilizar.`);
    }
    if (activeIssue.rows[0]) {
      await conn.query(
        `UPDATE fiscal_void_jobs
            SET status = 'pendente', attempts = GREATEST(attempts - 1, 0), run_after = $2,
                lease_until = NULL, last_error = 'Aguardando a emissão fiscal ativa terminar antes de conferir a faixa.', updated_at = $1
          WHERE id = $3 AND status = 'processando'`,
        [now, new Date(now.getTime() + 60_000), job.id],
      );
      return "retry";
    }
    await sendPreparedNumberVoid({ ...job.range, environment: job.environment, issuerUf: job.issuerUf, signedXml: job.signedXml }, job.requestedBy, now, vault, send, conn);
    await conn.query("UPDATE fiscal_void_jobs SET status = 'concluido', completed_at = $2, lease_until = NULL, last_error = NULL, updated_at = $2 WHERE id = $1 AND status = 'processando'", [job.id, now]);
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 2000) : "Falha inesperada ao inutilizar a numeração.";
    await conn.query("UPDATE fiscal_void_jobs SET status = 'revisao_manual', lease_until = NULL, last_error = $2, updated_at = $3 WHERE id = $1 AND status = 'processando'", [job.id, message, now]);
    return "manual_review";
  }
}

/** Retains the public domain error type for action callers. */
export { IssueError };

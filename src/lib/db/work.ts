import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class WorkError extends Error {}

export type Machine = { id: number; name: string; active: boolean };

export async function listMachines(conn: Queryable): Promise<Machine[]> {
  const { rows } = await conn.query("SELECT id, name, active FROM machines ORDER BY active DESC, lower(name), id");
  return rows.map((row) => ({ id: Number(row.id), name: String(row.name), active: Boolean(row.active) }));
}

const MACHINE_GONE = "Máquina não encontrada. Recarregue a página.";

/** Creates a machine (or work post), or changes the name and whether it is in use of the one with `id`. */
export async function saveMachine(id: number | null, input: { name: string; active: boolean }, who: string, conn: Queryable): Promise<void> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) throw new WorkError("Nome da máquina: de 2 a 60 letras.");
  try {
    const { rows } = id === null
      ? await conn.query("INSERT INTO machines (name, updated_by) VALUES ($1, $2) RETURNING id", [name, who])
      : await conn.query("UPDATE machines SET name = $2, active = $3, updated_at = now(), updated_by = $4 WHERE id = $1 RETURNING id", [id, name, input.active, who]);
    if (rows.length === 0) throw new WorkError(MACHINE_GONE);
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new WorkError("Já existe uma máquina com esse nome.");
    throw error;
  }
}

/** Removes a machine nobody worked on. One with hours noted stays: turn it off instead. */
export async function deleteMachine(id: number, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query("DELETE FROM machines WHERE id = $1 RETURNING id", [id]);
    if (rows.length === 0) throw new WorkError(MACHINE_GONE);
  } catch (error) {
    if (pgErrorCode(error) === "23503") throw new WorkError("Há horas apontadas nesta máquina. Marque como fora de uso em vez de remover.");
    throw error;
  }
}

export type Work = { id: number; stageName: string; machine: string | null; workerEmail: string; workerName: string; startedAt: Date; endedAt: Date | null; minutes: number };

const toWork = (row: Record<string, unknown>): Work => ({
  id: Number(row.id), stageName: String(row.stage_name), machine: row.machine === null ? null : String(row.machine), workerEmail: String(row.worker_email), workerName: String(row.worker_name),
  startedAt: row.started_at as Date, endedAt: (row.ended_at as Date | null) ?? null, minutes: Number(row.minutes),
});

/** The periods of work on one production order, the newest first. An open one counts up to `now`. */
export async function listWork(productionOrderId: number, now: Date, conn: Queryable): Promise<Work[]> {
  const { rows } = await conn.query(
    `SELECT k.id, k.stage_name, h.name AS machine, k.worker_email, k.worker_name, k.started_at, k.ended_at, round(extract(epoch FROM COALESCE(k.ended_at, $2::timestamptz) - k.started_at) / 60) AS minutes
       FROM production_work k LEFT JOIN machines h ON h.id = k.machine_id WHERE k.production_order_id = $1 ORDER BY k.id DESC`,
    [productionOrderId, now],
  );
  return rows.map(toWork);
}

/**
 * "Começar": who asks starts working on the order, at the stage it is in. A
 * person works on one order at a time: starting here ends what they had open
 * elsewhere, at the same moment.
 */
export async function startWork(productionOrderId: number, machineId: number | null, who: { email: string; name: string }, now: Date, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query(
      `WITH closed AS (UPDATE production_work SET ended_at = GREATEST($5::timestamptz, started_at) WHERE worker_email = $3 AND ended_at IS NULL RETURNING id),
            job AS (SELECT w.id, s.name FROM production_orders w JOIN production_stages s ON s.id = w.stage_id WHERE w.id = $1 AND w.finished_at IS NULL AND (SELECT count(*) FROM closed) >= 0)
       INSERT INTO production_work (production_order_id, stage_name, machine_id, worker_email, worker_name, started_at)
       SELECT job.id, job.name, $2, $3, $4, $5 FROM job RETURNING id`,
      [productionOrderId, machineId, who.email, who.name, now],
    );
    if (rows.length === 0) throw new WorkError("Só dá para apontar hora em ordem que ainda não está pronta. Recarregue a página.");
  } catch (error) {
    if (pgErrorCode(error) === "23503") throw new WorkError(MACHINE_GONE);
    throw error;
  }
}

/** "Parar": ends the period who asks has open. */
export async function stopWork(email: string, now: Date, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("UPDATE production_work SET ended_at = GREATEST($2::timestamptz, started_at) WHERE worker_email = $1 AND ended_at IS NULL RETURNING id", [email, now]);
  if (rows.length === 0) throw new WorkError("Você não está com nenhuma ordem em andamento.");
}

/** Removes a period noted by mistake. */
export async function deleteWork(id: number, productionOrderId: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("DELETE FROM production_work WHERE id = $1 AND production_order_id = $2 RETURNING id", [id, productionOrderId]);
  if (rows.length === 0) throw new WorkError("Apontamento não encontrado. Recarregue a página.");
}

export type HoursRow = { label: string; minutes: number; periods: number };

/** The hours noted since `since`, by stage, by person and by machine. An open period counts up to `now`. */
export async function hoursReport(since: Date, now: Date, conn: Queryable): Promise<{ total: number; byStage: HoursRow[]; byWorker: HoursRow[]; byMachine: HoursRow[]; open: number }> {
  const grouped = async (label: string) => {
    const { rows } = await conn.query(
      `SELECT CASE $3 WHEN 'stage' THEN k.stage_name WHEN 'worker' THEN k.worker_name ELSE COALESCE(h.name, 'Sem máquina') END AS label,
              round(sum(extract(epoch FROM COALESCE(k.ended_at, $2::timestamptz) - k.started_at)) / 60) AS minutes, count(*) AS periods
         FROM production_work k LEFT JOIN machines h ON h.id = k.machine_id WHERE k.started_at >= $1 GROUP BY 1 ORDER BY 2 DESC, 1`,
      [since, now, label],
    );
    return rows.map((row) => ({ label: String(row.label), minutes: Number(row.minutes), periods: Number(row.periods) }));
  };
  const byStage = await grouped("stage");
  const open = await conn.query("SELECT count(*) AS total FROM production_work WHERE ended_at IS NULL");
  return { total: byStage.reduce((sum, row) => sum + row.minutes, 0), byStage, byWorker: await grouped("worker"), byMachine: await grouped("machine"), open: Number(open.rows[0].total) };
}

/** `2 h 05 min`, `45 min`. */
export const showMinutes = (minutes: number): string => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`);

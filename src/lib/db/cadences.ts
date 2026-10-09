import { MessageError, sendOpportunityMail } from "@/lib/db/messages";
import type { MailWay } from "@/lib/db/messages";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { MailError } from "@/lib/mail/message";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class CadenceError extends Error {}

export type CadenceStep = { id: number; position: number; waitDays: number; kind: "email" | "tarefa"; templateId: number | null; templateName: string | null; taskTitle: string | null };
export type Cadence = { id: number; name: string; active: boolean; steps: CadenceStep[]; running: number };

export async function listCadences(conn: Queryable): Promise<Cadence[]> {
  const { rows } = await conn.query(
    `SELECT c.id, c.name, c.active, (SELECT count(*)::int FROM opportunity_cadences e WHERE e.cadence_id = c.id AND e.status = 'ativa') AS running,
            COALESCE((SELECT json_agg(json_build_object('id', s.id, 'position', s.position, 'waitDays', s.wait_days, 'kind', s.kind, 'templateId', s.template_id,
                        'templateName', (SELECT t.name FROM message_templates t WHERE t.id = s.template_id), 'taskTitle', s.task_title) ORDER BY s.position)
                        FROM cadence_steps s WHERE s.cadence_id = c.id), '[]'::json) AS steps
       FROM cadences c ORDER BY lower(c.name), c.id`,
  );
  return rows.map((row) => ({ id: Number(row.id), name: String(row.name), active: row.active === true, running: Number(row.running), steps: row.steps as CadenceStep[] }));
}

const cadenceName = (name: string) => {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 60) throw new CadenceError("Nome da cadência: de 2 a 60 letras.");
  return clean;
};

export async function createCadence(name: string, who: string, conn: Queryable): Promise<number> {
  try {
    const { rows } = await conn.query("INSERT INTO cadences (name, updated_by) VALUES ($1, $2) RETURNING id", [cadenceName(name), who]);
    return Number(rows[0].id);
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new CadenceError("Já existe uma cadência com esse nome.");
    throw error;
  }
}

export async function saveCadence(id: number, input: { name: string; active: boolean }, who: string, conn: Queryable): Promise<void> {
  try {
    const { rows } = await conn.query("UPDATE cadences SET name = $2, active = $3, updated_at = now(), updated_by = $4 WHERE id = $1 RETURNING id", [id, cadenceName(input.name), input.active, who]);
    if (rows.length === 0) throw new CadenceError("Cadência não encontrada. Recarregue a página.");
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new CadenceError("Já existe uma cadência com esse nome.");
    throw error;
  }
}

/** Removes a cadence nobody is following, with its steps and the record of who finished it. */
export async function deleteCadence(id: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `WITH target AS (SELECT c.id FROM cadences c WHERE c.id = $1 AND NOT EXISTS (SELECT 1 FROM opportunity_cadences e WHERE e.cadence_id = c.id AND e.status = 'ativa')),
          followed AS (DELETE FROM opportunity_cadences e USING target WHERE e.cadence_id = target.id),
          steps AS (DELETE FROM cadence_steps s USING target WHERE s.cadence_id = target.id)
     DELETE FROM cadences c USING target WHERE c.id = target.id RETURNING c.id`,
    [id],
  );
  if (rows.length === 0) throw new CadenceError("Há oportunidades seguindo esta cadência, ou ela não existe mais. Pare-as antes de remover.");
}

/** A new step at the end: an e-mail of a template, or a task for the seller, some days after the step before. */
export async function addCadenceStep(cadenceId: number, input: { kind: string; waitDays: number; templateId: number | null; taskTitle: string | null }, conn: Queryable): Promise<void> {
  if (input.kind !== "email" && input.kind !== "tarefa") throw new CadenceError("Escolha se o passo é um e-mail ou uma tarefa.");
  if (!Number.isInteger(input.waitDays) || input.waitDays < 0 || input.waitDays > 90) throw new CadenceError("Espera: de 0 a 90 dias.");
  const title = input.taskTitle?.trim().replace(/\s+/g, " ") ?? "";
  if (input.kind === "tarefa" && (title.length < 2 || title.length > 200)) throw new CadenceError("Descreva a tarefa (2 a 200 letras).");
  if (input.kind === "email" && input.templateId === null) throw new CadenceError("Escolha o modelo do e-mail. Os modelos ficam em Parâmetros → Mensagens.");
  try {
    const { rows } = await conn.query(
      `INSERT INTO cadence_steps (cadence_id, position, wait_days, kind, template_id, task_title)
       SELECT c.id, COALESCE((SELECT max(position) FROM cadence_steps WHERE cadence_id = c.id), 0) + 1, $2, $3, $4, $5 FROM cadences c WHERE c.id = $1 RETURNING id`,
      [cadenceId, input.waitDays, input.kind, input.kind === "email" ? input.templateId : null, input.kind === "tarefa" ? title : null],
    );
    if (rows.length === 0) throw new CadenceError("Cadência não encontrada. Recarregue a página.");
  } catch (error) {
    if (pgErrorCode(error) === "23503") throw new CadenceError("Modelo não encontrado. Recarregue a página.");
    throw error;
  }
}

/** Removes a step and closes the gap in the order. Who is following the cadence goes on from the same number. */
export async function deleteCadenceStep(stepId: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `WITH gone AS (DELETE FROM cadence_steps WHERE id = $1 RETURNING cadence_id, position)
     UPDATE cadence_steps s SET position = s.position - 1 FROM gone WHERE s.cadence_id = gone.cadence_id AND s.position > gone.position RETURNING (SELECT cadence_id FROM gone)`,
    [stepId],
  );
  // A cadence whose last step was removed returns no row from the UPDATE: look at the step itself.
  if (rows.length === 0) {
    const still = await conn.query("SELECT 1 FROM cadence_steps WHERE id = $1", [stepId]);
    if (still.rows.length > 0) throw new CadenceError("Não foi possível remover o passo. Tente de novo.");
  }
}

export type Enrollment = { id: number; cadenceName: string; status: "ativa" | "concluida" | "parada"; nextPosition: number; nextAt: Date; steps: number; stoppedReason: string | null; startedAt: Date };

/** The cadences an opportunity followed or follows, the latest first. */
export async function listEnrollments(opportunityId: number, conn: Queryable): Promise<Enrollment[]> {
  const { rows } = await conn.query(
    `SELECT e.id, c.name, e.status, e.next_position, e.next_at, e.stopped_reason, e.started_at, (SELECT count(*)::int FROM cadence_steps s WHERE s.cadence_id = c.id) AS steps
       FROM opportunity_cadences e JOIN cadences c ON c.id = e.cadence_id WHERE e.opportunity_id = $1 ORDER BY e.id DESC`,
    [opportunityId],
  );
  return rows.map((row) => ({
    id: Number(row.id), cadenceName: String(row.name), status: row.status as Enrollment["status"], nextPosition: Number(row.next_position), nextAt: row.next_at as Date, steps: Number(row.steps),
    stoppedReason: row.stopped_reason === null ? null : String(row.stopped_reason), startedAt: row.started_at as Date,
  }));
}

const DAY = 86_400_000;

/** Puts an open opportunity (within reach of who asks) on a cadence. One at a time. */
export async function startCadence(opportunityId: number, cadenceId: number, who: string, ownerEmail: string | null, now: Date, conn: Queryable): Promise<void> {
  const first = await conn.query(
    `SELECT s.wait_days FROM cadences c JOIN cadence_steps s ON s.cadence_id = c.id AND s.position = 1
      WHERE c.id = $1 AND c.active`,
    [cadenceId],
  );
  if (!first.rows[0]) throw new CadenceError("Esta cadência está desligada ou ainda não tem passos.");
  try {
    const { rows } = await conn.query(
      `INSERT INTO opportunity_cadences (opportunity_id, cadence_id, next_position, next_at, started_by)
       SELECT o.id, $2, 1, $3, $4 FROM opportunities o JOIN pipeline_stages s ON s.id = o.stage_id
        WHERE o.id = $1 AND s.kind = 'aberta' AND ($5::text IS NULL OR o.owner_email = $5) RETURNING id`,
      [opportunityId, cadenceId, new Date(now.getTime() + Number(first.rows[0].wait_days) * DAY), who, ownerEmail],
    );
    if (rows.length === 0) throw new CadenceError("Só oportunidade em andamento entra em cadência.");
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new CadenceError("Esta oportunidade já está em uma cadência. Pare a atual antes de começar outra.");
    throw error;
  }
}

/** Takes an opportunity out of its cadence. */
export async function stopCadence(opportunityId: number, reason: string, ownerEmail: string | null, conn: Queryable): Promise<void> {
  const { rows } = await conn.query(
    `UPDATE opportunity_cadences e SET status = 'parada', stopped_reason = $2, finished_at = now()
       FROM opportunities o WHERE e.opportunity_id = $1 AND o.id = e.opportunity_id AND e.status = 'ativa' AND ($3::text IS NULL OR o.owner_email = $3) RETURNING e.id`,
    [opportunityId, reason.slice(0, 200), ownerEmail],
  );
  if (rows.length === 0) throw new CadenceError("Esta oportunidade não está em cadência.");
}

/**
 * Does what is due in every cadence: stops the ones whose sale was won or lost
 * (or whose cadence was turned off), and for the rest runs the step of the
 * moment and sets the next one. An e-mail that cannot go (no address, no
 * mailbox, the server refused) stops the cadence and leaves a task for the
 * seller saying why, instead of trying forever. Each enrollment is taken by one
 * caller only, so two runs at the same time never send the same step twice.
 */
export async function runCadences(company: string, now: Date, way: MailWay, conn: Queryable): Promise<{ sent: number; tasks: number; stopped: number }> {
  const closed = await conn.query(
    `UPDATE opportunity_cadences e SET status = 'parada', finished_at = now(),
            stopped_reason = CASE WHEN s.kind = 'ganha' THEN 'A venda foi ganha.' WHEN s.kind = 'perdida' THEN 'A venda foi perdida.' ELSE 'A cadência foi desligada.' END
       FROM opportunities o, pipeline_stages s, cadences c
      WHERE e.status = 'ativa' AND o.id = e.opportunity_id AND s.id = o.stage_id AND c.id = e.cadence_id AND (s.kind <> 'aberta' OR NOT c.active) RETURNING e.id`,
  );
  let sent = 0;
  let tasks = 0;
  let stopped = closed.rows.length;
  // Taken by pushing the moment forward: who takes an enrollment is the only one to run its step, and a crash leaves it to be tried again in an hour.
  const due = await conn.query(
    `UPDATE opportunity_cadences e SET next_at = $1::timestamptz + interval '1 hour'
      WHERE e.id IN (SELECT d.id FROM opportunity_cadences d WHERE d.status = 'ativa' AND d.next_at <= $1 ORDER BY d.next_at LIMIT 50 FOR UPDATE SKIP LOCKED)
      RETURNING e.id, e.opportunity_id, e.cadence_id, e.next_position`,
    [now],
  );
  for (const row of due.rows) {
    const id = Number(row.id);
    const opportunityId = Number(row.opportunity_id);
    const position = Number(row.next_position);
    const step = await conn.query(
      `SELECT s.kind, s.task_title, t.subject, t.body, (SELECT n.wait_days FROM cadence_steps n WHERE n.cadence_id = s.cadence_id AND n.position = s.position + 1) AS next_wait
         FROM cadence_steps s LEFT JOIN message_templates t ON t.id = s.template_id WHERE s.cadence_id = $1 AND s.position = $2`,
      [row.cadence_id, position],
    );
    const current = step.rows[0];
    // The steps were removed under it: nothing left to do.
    if (!current) {
      await conn.query("UPDATE opportunity_cadences SET status = 'concluida', finished_at = now() WHERE id = $1", [id]);
      continue;
    }
    const task = (title: string) =>
      conn.query(
        "INSERT INTO opportunity_activities (opportunity_id, kind, title, due_on, owner_email, created_by) SELECT o.id, 'tarefa', $2, ($3::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date, o.owner_email, 'cadência' FROM opportunities o WHERE o.id = $1",
        [opportunityId, title.slice(0, 300), now],
      );
    if (current.kind === "tarefa") {
      await task(String(current.task_title));
      tasks += 1;
    } else {
      let failure: string | null = null;
      try {
        const result = await sendOpportunityMail({ opportunityId, ownerEmail: null, subject: String(current.subject), body: String(current.body), company, sentBy: "cadência", now, way }, conn);
        if (result.status === "falhou") failure = `O e-mail da cadência para ${result.recipient} não saiu: ${result.detail ?? "falha no envio"}`;
      } catch (error) {
        if (!(error instanceof MessageError || error instanceof MailError)) throw error;
        failure = `A cadência parou: ${error.message}`;
      }
      if (failure !== null) {
        await task(failure);
        await conn.query("UPDATE opportunity_cadences SET status = 'parada', stopped_reason = $2, finished_at = now() WHERE id = $1", [id, failure.slice(0, 200)]);
        stopped += 1;
        tasks += 1;
        continue;
      }
      sent += 1;
    }
    if (current.next_wait === null) await conn.query("UPDATE opportunity_cadences SET status = 'concluida', finished_at = now() WHERE id = $1", [id]);
    else await conn.query("UPDATE opportunity_cadences SET next_position = $2, next_at = $3 WHERE id = $1", [id, position + 1, new Date(now.getTime() + Number(current.next_wait) * DAY)]);
  }
  return { sent, tasks, stopped };
}

import type { Queryable } from "@/lib/db/pool";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class AutomationError extends Error {}

export type AutomationKind = "orcamento_parado" | "contrato_pendente" | "parcela_vencendo" | "oportunidade_parada";

/** What each rule watches, in the words of the screen. `{n}` is the number of days of the rule. */
export const AUTOMATION_TEXT: Record<AutomationKind, { name: string; when: string; unit: string }> = {
  orcamento_parado: { name: "Orçamento parado", when: "Pedido em negociação sem nenhuma alteração", unit: "dias sem alteração" },
  contrato_pendente: { name: "Contrato sem assinatura", when: "Contrato enviado ao cliente e ainda não assinado", unit: "dias depois do envio" },
  parcela_vencendo: { name: "Parcela para vencer", when: "Parcela em aberto de um pedido fechado", unit: "dias antes do vencimento" },
  oportunidade_parada: { name: "Oportunidade parada", when: "Oportunidade em andamento, sem tarefa por fazer", unit: "dias sem movimento" },
};

export type AutomationRule = { id: number; kind: AutomationKind; days: number; title: string; active: boolean };

export async function listAutomationRules(conn: Queryable): Promise<AutomationRule[]> {
  const { rows } = await conn.query("SELECT id, kind, days, title, active FROM automation_rules ORDER BY id");
  return rows.map((row) => ({ id: Number(row.id), kind: row.kind as AutomationKind, days: Number(row.days), title: String(row.title), active: row.active === true }));
}

export async function saveAutomationRule(id: number, input: { days: number; title: string; active: boolean }, who: string, conn: Queryable): Promise<void> {
  const title = input.title.trim().replace(/\s+/g, " ");
  const problems: string[] = [];
  if (!Number.isInteger(input.days) || input.days < 0 || input.days > 90) problems.push("Prazo: de 0 a 90 dias.");
  if (title.length < 5 || title.length > 200) problems.push("Texto da tarefa: de 5 a 200 letras.");
  if (problems.length > 0) throw new AutomationError(problems.join(" "));
  const { rows } = await conn.query("UPDATE automation_rules SET days = $2, title = $3, active = $4, updated_at = now(), updated_by = $5 WHERE id = $1 RETURNING id", [id, input.days, title, input.active, who]);
  if (rows.length === 0) throw new AutomationError("Regra não encontrada. Recarregue a página.");
}

/**
 * Creates the tasks the rules of the company ask for, as of `today`
 * (`AAAA-MM-DD`, São Paulo). It is safe to run at any time and as often as
 * wanted: each fact has a key of its own, so it never gives the same task
 * twice, not even after the task is done. Run when the funnel or the tasks are
 * opened; nothing leaves the system.
 *
 * Who gets the task is the seller of the order or the owner of the
 * opportunity. `{pedido}` and `{cliente}` in the text of a rule take the
 * number of the order and the name of the customer.
 */
export async function runAutomations(today: string, conn: Queryable): Promise<number> {
  const { rows } = await conn.query(
    `WITH rule AS (SELECT kind, days, title FROM automation_rules WHERE active),
     named AS (
       -- A quote nobody touched for the days of the rule. The day of the last change is in the key: touched and left again, it is reminded again.
       SELECT 'orcamento:' || o.id || ':' || (o.updated_at AT TIME ZONE 'America/Sao_Paulo')::date AS auto_key, NULL::integer AS opportunity_id, o.id AS order_id, o.seller_email AS owner_email,
              r.title, o.number, c.name AS customer, $1::date AS due_on
         FROM orders o JOIN rule r ON r.kind = 'orcamento_parado' LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.status = 'em_negociacao' AND EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)
          AND (o.updated_at AT TIME ZONE 'America/Sao_Paulo')::date <= $1::date - r.days
       UNION ALL
       -- A contract sent and still waiting, within the time of its link.
       SELECT 'contrato:' || k.id, NULL, o.id, o.seller_email, r.title, o.number, c.name, $1::date
         FROM order_contracts k JOIN orders o ON o.id = k.order_id JOIN rule r ON r.kind = 'contrato_pendente' LEFT JOIN customers c ON c.id = o.customer_id
        WHERE k.status = 'enviado' AND k.expires_at > now() AND (k.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= $1::date - r.days
       UNION ALL
       -- An installment about to fall due (or already late and still open): the task is for the day it falls due.
       SELECT 'parcela:' || v.id, NULL, o.id, o.seller_email, r.title, o.number, c.name, v.due_date
         FROM receivables v JOIN orders o ON o.id = v.order_id JOIN rule r ON r.kind = 'parcela_vencendo' LEFT JOIN customers c ON c.id = o.customer_id
        WHERE v.status = 'aberta' AND v.due_date IS NOT NULL AND v.due_date <= $1::date + r.days AND o.status = 'fechado'
       UNION ALL
       -- An open opportunity with nothing left to do on it.
       SELECT 'parada:' || p.id || ':' || (p.updated_at AT TIME ZONE 'America/Sao_Paulo')::date, p.id, NULL, p.owner_email, r.title, NULL, NULL, $1::date
         FROM opportunities p JOIN pipeline_stages s ON s.id = p.stage_id JOIN rule r ON r.kind = 'oportunidade_parada'
        WHERE s.kind = 'aberta' AND (p.updated_at AT TIME ZONE 'America/Sao_Paulo')::date <= $1::date - r.days
          AND NOT EXISTS (SELECT 1 FROM opportunity_activities a WHERE a.opportunity_id = p.id AND a.done_at IS NULL AND a.kind <> 'nota')
     )
     INSERT INTO opportunity_activities (opportunity_id, order_id, kind, title, due_on, owner_email, created_by, auto_key)
     SELECT opportunity_id, order_id, 'tarefa', left(replace(replace(title, '{pedido}', COALESCE('#' || number, '')), '{cliente}', COALESCE(customer, 'cliente a definir')), 300), due_on, owner_email, 'sistema', auto_key
       FROM named
     ON CONFLICT (auto_key) DO NOTHING
     RETURNING id`,
    [today],
  );
  return rows.length;
}

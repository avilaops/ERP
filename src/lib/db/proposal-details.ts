import type { Queryable } from "@/lib/db/pool";
import { checkedProposalDetails, ProposalSettingsError } from "@/lib/quote/settings";
import type { ProposalDetails, ProposalField } from "@/lib/quote/settings";

export type StoredProposalDetails = { details: ProposalDetails; revision: string };
export async function loadProposalDetails(conn: Queryable, orderId?: number): Promise<StoredProposalDetails> {
  const { rows } = await conn.query(orderId === undefined
    ? "SELECT proposal_details, proposal_details_revision::text AS revision FROM company_settings"
    : "SELECT proposal_details, proposal_details_revision::text AS revision FROM orders WHERE id = $1", orderId === undefined ? [] : [orderId]);
  if (!rows[0]) throw new ProposalSettingsError("Cadastro não encontrado. Recarregue a tela.");
  return { details: rows[0].proposal_details as ProposalDetails, revision: String(rows[0].revision) };
}

/** A step patches its fields atomically; another tab cannot overwrite a newer revision. */
export async function saveProposalDetails(input: { values: ProposalDetails; fields: ProposalField[]; revision: string; actor: string; orderId?: number }, conn: Queryable): Promise<void> {
  if (!input.actor.trim() || !/^\d+$/.test(input.revision)) throw new ProposalSettingsError("Recarregue a tela antes de salvar.");
  const stored = await loadProposalDetails(conn, input.orderId);
  if (stored.revision !== input.revision) throw new ProposalSettingsError("Os dados mudaram em outra tela. Recarregue antes de salvar.");
  const next = { ...stored.details };
  for (const key of input.fields) { delete next[key]; if (input.values[key]) next[key] = input.values[key]; }
  const checked = checkedProposalDetails(next);
  const result = input.orderId === undefined
    ? await conn.query(`UPDATE company_settings SET proposal_details = $1::jsonb, proposal_details_revision = proposal_details_revision + 1,
        updated_at = now(), updated_by = $3 WHERE proposal_details_revision = $2::bigint RETURNING id`, [JSON.stringify(checked), input.revision, input.actor])
    : await conn.query(`UPDATE orders SET proposal_details = $1::jsonb, proposal_details_revision = proposal_details_revision + 1,
          proposal_details_updated_by = $4, proposal_details_updated_at = now()
        WHERE id = $3 AND proposal_details_revision = $2::bigint AND status IN ('em_negociacao', 'fechado')
          AND NOT EXISTS (SELECT 1 FROM order_contracts c WHERE c.order_id = orders.id AND c.status IN ('enviado', 'assinado'))
          AND NOT EXISTS (SELECT 1 FROM fiscal_invoices f WHERE f.order_id = orders.id AND f.status IN ('assinada', 'autorizada', 'denegada'))
        RETURNING id`, [JSON.stringify(checked), input.revision, input.orderId, input.actor]);
  if (!result.rows[0]) throw new ProposalSettingsError("Os dados mudaram ou o pedido já tem contrato/nota emitidos. Recarregue para conferir.");
}

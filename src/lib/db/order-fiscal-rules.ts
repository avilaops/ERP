import { FiscalError } from "@/lib/db/fiscal";
import { loadFiscalRules, normalizeFiscalRules } from "@/lib/db/fiscal-rules";
import type { FiscalRules } from "@/lib/db/fiscal-rules";
import type { Queryable } from "@/lib/db/pool";

/** Unchanged fields continue to follow the company's defaults. Explicit blanks override them. */
export async function loadOrderFiscalRules(orderId: number, lineId: number, conn: Queryable) {
  const { rows } = await conn.query("SELECT nfe_rules, nfe_rules_revision FROM orders WHERE id = $1", [orderId]);
  if (!rows[0]) throw new FiscalError("Pedido não encontrado.");
  const overrides = rows[0].nfe_rules as Partial<FiscalRules>;
  return {
    rules: normalizeFiscalRules({ ...await loadFiscalRules(lineId, conn), ...overrides }),
    revision: Number(rows[0].nfe_rules_revision),
    customized: Object.keys(overrides).length > 0,
  };
}

/** One atomic write, with a revision check. Signed, authorised or denied XML is immutable. */
export async function saveOrderFiscalRules(
  orderId: number, lineId: number, revision: number, changes: Partial<FiscalRules> | null, who: string, conn: Queryable,
): Promise<void> {
  if (!who.trim()) throw new Error("Falta dizer quem está preparando a nota.");
  const current = await loadOrderFiscalRules(orderId, lineId, conn);
  const normalized = normalizeFiscalRules({ ...current.rules, ...changes });
  const patch = changes === null ? {} : Object.fromEntries(Object.keys(changes).map((key) => [key, normalized[key as keyof FiscalRules]]));
  const { rows } = await conn.query(
    `UPDATE orders SET nfe_rules = CASE WHEN $4 THEN '{}'::jsonb ELSE nfe_rules || $3::jsonb END,
         nfe_rules_revision = nfe_rules_revision + 1, nfe_rules_updated_by = $5, nfe_rules_updated_at = now()
      WHERE id = $1 AND status = 'fechado' AND nfe_rules_revision = $2
        AND price_table_version IN (SELECT version FROM price_table_versions WHERE line_id = $6)
        AND NOT EXISTS (SELECT 1 FROM fiscal_invoices i WHERE i.order_id = orders.id
          AND i.environment = (SELECT nfe_environment FROM company_settings)
          AND i.status IN ('assinada', 'autorizada', 'denegada'))
      RETURNING id`,
    [orderId, revision, JSON.stringify(patch), changes === null, who, lineId],
  );
  if (!rows[0]) throw new FiscalError("A preparação mudou ou a nota já foi assinada, autorizada ou denegada. Recarregue antes de alterar.");
}

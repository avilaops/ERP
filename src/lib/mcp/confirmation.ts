import { createHash, randomBytes } from "node:crypto";
import type { Queryable } from "@/lib/db/pool";

export class ConfirmationError extends Error {}
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** A preview never changes the business record. The code identifies the exact stored intent. */
export async function prepareConfirmation(tool: string, who: string, payload: object, summary: object, conn: Queryable) {
  const token = randomBytes(24).toString("base64url");
  await conn.query("INSERT INTO mcp_confirmations (token_hash, user_email, tool, payload) VALUES ($1, $2, $3, $4::jsonb)", [hash(token), who, tool, JSON.stringify(payload)]);
  return { confirmacao_necessaria: true, resumo: summary, confirmar: token, instrucao: "Mostre o resumo e peça confirmação explícita à pessoa. Só depois chame esta mesma ferramenta apenas com confirmar. O código vence em 10 minutos." };
}

/**
 * Requires one pinned connection, supplied by the HTTP route. Locks the intent
 * until the business write and its result are committed together. A retry gets
 * the original result, even after expiry, and never executes the write twice.
 */
export async function executeConfirmation(tool: string, who: string, token: string, conn: Queryable, execute: (payload: Record<string, unknown>) => Promise<unknown>): Promise<unknown> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new ConfirmationError("Confirmação inválida. Peça uma nova prévia.");
  await conn.query("BEGIN");
  try {
    const { rows } = await conn.query("SELECT payload, result, expires_at > now() AS valid FROM mcp_confirmations WHERE token_hash = $1 AND user_email = $2 AND tool = $3 FOR UPDATE", [hash(token), who, tool]);
    const found = rows[0];
    if (!found) throw new ConfirmationError("Confirmação não encontrada. Peça uma nova prévia.");
    if (found.result !== null) {
      await conn.query("COMMIT");
      return found.result;
    }
    if (!found.valid) throw new ConfirmationError("Confirmação vencida. Peça uma nova prévia.");
    const result = await execute(found.payload as Record<string, unknown>);
    await conn.query("UPDATE mcp_confirmations SET confirmed_at = now(), result = $2::jsonb WHERE token_hash = $1", [hash(token), JSON.stringify(result)]);
    await conn.query("COMMIT");
    return result;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  }
}

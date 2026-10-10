import type { Queryable } from "@/lib/db/pool";
import { ACCESS_MINUTES, CODE_MINUTES, hashSecret, newSecret, pkceMatches, REFRESH_DAYS, sha256 } from "@/lib/mcp/oauth";
import type { OauthClient } from "@/lib/mcp/oauth";

/** Whether this company lets assistants connect at all. Off until somebody with Parâmetros turns it on. */
export async function mcpEnabled(conn: Queryable): Promise<boolean> {
  const { rows } = await conn.query("SELECT mcp_enabled FROM ai_settings");
  return Boolean(rows[0]?.mcp_enabled);
}

/** Turning it off also ends every connection there is: nothing keeps working on an old key. */
export async function setMcpEnabled(enabled: boolean, who: string, conn: Queryable): Promise<void> {
  await conn.query("UPDATE ai_settings SET mcp_enabled = $1, updated_at = now(), updated_by = $2", [enabled, who]);
  if (!enabled) await conn.query("UPDATE mcp_grants SET revoked_at = now(), revoked_by = $1 WHERE revoked_at IS NULL", [who]);
}

/** The person said yes on the consent screen: a one-use code for the application to exchange. Only its hash is kept. */
export async function grantCode(input: { tenant: string; email: string; client: OauthClient; redirectUri: string; codeChallenge: string; now: Date }, conn: Queryable): Promise<string> {
  const code = newSecret("code", input.tenant);
  await conn.query(
    `INSERT INTO mcp_grants (user_email, client_name, client_hash, redirect_uri, code_hash, code_challenge, code_expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz + make_interval(mins => $8), $7)`,
    [input.email.trim().toLowerCase(), input.client.name, sha256(input.client.clientId), input.redirectUri, hashSecret(code), input.codeChallenge, input.now, CODE_MINUTES],
  );
  return code;
}

export type Tokens = { accessToken: string; refreshToken: string; expiresIn: number };

async function issue(grantId: number, tenant: string, now: Date, conn: Queryable): Promise<Tokens> {
  const accessToken = newSecret("access", tenant);
  const refreshToken = newSecret("refresh", tenant);
  await conn.query(
    `UPDATE mcp_grants SET code_hash = NULL, code_challenge = NULL, code_expires_at = NULL, access_hash = $2, access_expires_at = $4::timestamptz + make_interval(mins => $5),
            refresh_hash = $3, refresh_expires_at = $4::timestamptz + make_interval(days => $6) WHERE id = $1`,
    [grantId, hashSecret(accessToken), hashSecret(refreshToken), now, ACCESS_MINUTES, REFRESH_DAYS],
  );
  return { accessToken, refreshToken, expiresIn: ACCESS_MINUTES * 60 };
}

/**
 * Exchanges a code for the keys, once: the same application, the same return
 * address and the proof (PKCE) that it is who asked. A code presented a
 * second time finds nothing, and what is wrong with it is never told apart.
 */
export async function exchangeCode(input: { tenant: string; code: string; verifier: string; clientId: string; redirectUri: string; now: Date }, conn: Queryable): Promise<Tokens | null> {
  // Taken by clearing it: two exchanges of the same code at the same moment give keys to one only.
  const { rows } = await conn.query(
    `UPDATE mcp_grants g SET code_hash = NULL FROM mcp_grants before
      WHERE before.id = g.id AND g.code_hash = $1 AND g.revoked_at IS NULL
      RETURNING g.id, before.code_challenge, before.code_expires_at, g.client_hash, g.redirect_uri`,
    [hashSecret(input.code)],
  );
  const grant = rows[0];
  if (!grant) return null;
  const good = (grant.code_expires_at as Date) > input.now && grant.client_hash === sha256(input.clientId) && grant.redirect_uri === input.redirectUri && pkceMatches(input.verifier, String(grant.code_challenge ?? ""));
  if (!good) {
    await conn.query("UPDATE mcp_grants SET revoked_at = now(), revoked_by = 'sistema' WHERE id = $1", [grant.id]);
    return null;
  }
  return issue(Number(grant.id), input.tenant, input.now, conn);
}

/** Exchanges a renewal key for a new pair. The old one stops working: used again, it finds nothing. */
export async function refreshTokens(input: { tenant: string; refreshToken: string; clientId: string; now: Date }, conn: Queryable): Promise<Tokens | null> {
  const { rows } = await conn.query(
    "UPDATE mcp_grants SET refresh_hash = NULL WHERE refresh_hash = $1 AND revoked_at IS NULL AND refresh_expires_at > $2 AND client_hash = $3 RETURNING id",
    [hashSecret(input.refreshToken), input.now, sha256(input.clientId)],
  );
  return rows[0] ? issue(Number(rows[0].id), input.tenant, input.now, conn) : null;
}

/** Whose key this is, while it is good. Notes that it was used. */
export async function grantOfAccess(accessToken: string, now: Date, conn: Queryable): Promise<{ id: number; email: string; clientName: string } | null> {
  const { rows } = await conn.query(
    "UPDATE mcp_grants SET last_used_at = $2 WHERE access_hash = $1 AND revoked_at IS NULL AND access_expires_at > $2 RETURNING id, user_email, client_name",
    [hashSecret(accessToken), now],
  );
  return rows[0] ? { id: Number(rows[0].id), email: String(rows[0].user_email), clientName: String(rows[0].client_name) } : null;
}

export type Connection = { id: number; email: string; clientName: string; createdAt: Date; lastUsedAt: Date | null; calls: number };

/** The connections that are on: who authorised which application, and how much it was used. Of one person, or of the whole company. */
export async function listConnections(email: string | null, conn: Queryable): Promise<Connection[]> {
  const { rows } = await conn.query(
    `SELECT g.id, g.user_email, g.client_name, g.created_at, g.last_used_at, (SELECT count(*) FROM mcp_calls c WHERE c.grant_id = g.id) AS calls
       FROM mcp_grants g WHERE g.revoked_at IS NULL AND g.refresh_hash IS NOT NULL AND g.refresh_expires_at > now() AND ($1::text IS NULL OR g.user_email = $1) ORDER BY g.id DESC`,
    [email],
  );
  return rows.map((row) => ({ id: Number(row.id), email: String(row.user_email), clientName: String(row.client_name), createdAt: row.created_at as Date, lastUsedAt: (row.last_used_at as Date | null) ?? null, calls: Number(row.calls) }));
}

/** Ends a connection: its keys stop working at once. `email` limits it to the person's own. */
export async function revokeConnection(id: number, email: string | null, who: string, conn: Queryable): Promise<boolean> {
  const { rows } = await conn.query("UPDATE mcp_grants SET revoked_at = now(), revoked_by = $3 WHERE id = $1 AND revoked_at IS NULL AND ($2::text IS NULL OR user_email = $2) RETURNING id", [id, email, who]);
  return rows.length > 0;
}

/** Writes down that a tool was called, by whom and whether it worked. Never what was asked or answered. */
export async function noteCall(grantId: number, email: string, tool: string, ok: boolean, conn: Queryable): Promise<void> {
  await conn.query("INSERT INTO mcp_calls (grant_id, user_email, tool, ok) VALUES ($1, $2, $3, $4)", [grantId, email, tool.slice(0, 80), ok]);
}

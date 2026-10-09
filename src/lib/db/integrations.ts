import { AddressError, checkPublicUrl } from "@/lib/api/address";
import { hashApiKey, newApiKey, newWebhookSecret, signWebhook } from "@/lib/api/keys";
import type { Queryable } from "@/lib/db/pool";
import { openSecret, sealSecret } from "@/lib/mail/vault";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class IntegrationError extends Error {}

const text = (value: unknown) => (value === null || value === undefined ? null : String(value));

export type ApiKey = { id: number; name: string; prefix: string; canWrite: boolean; ownerEmail: string; ownerName: string; createdAt: Date; createdBy: string; lastUsedAt: Date | null; revokedAt: Date | null };

const toKey = (row: Record<string, unknown>): ApiKey => ({
  id: Number(row.id), name: String(row.name), prefix: String(row.prefix), canWrite: row.can_write === true, ownerEmail: String(row.owner_email), ownerName: String(row.owner_name),
  createdAt: row.created_at as Date, createdBy: String(row.created_by), lastUsedAt: (row.last_used_at as Date | null) ?? null, revokedAt: (row.revoked_at as Date | null) ?? null,
});
const KEY_COLUMNS = "id, name, prefix, can_write, owner_email, owner_name, created_at, created_by, last_used_at, revoked_at";

export async function listApiKeys(conn: Queryable): Promise<ApiKey[]> {
  const { rows } = await conn.query(`SELECT ${KEY_COLUMNS} FROM api_keys ORDER BY (revoked_at IS NOT NULL), id DESC`);
  return rows.map(toKey);
}

/**
 * A new key. The key itself is returned once, to be shown to who created it;
 * what is stored is its hash. What the key creates is in the name of `owner`,
 * who has to be an active user of the company.
 */
export async function createApiKey(tenant: string, input: { name: string; canWrite: boolean; ownerEmail: string }, who: string, conn: Queryable): Promise<{ key: string; record: ApiKey }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) throw new IntegrationError("Diga para que serve a chave (2 a 60 letras).");
  const owner = await conn.query("SELECT email, name FROM users WHERE email = $1 AND active", [input.ownerEmail.trim().toLowerCase()]);
  if (!owner.rows[0]) throw new IntegrationError("Escolha, na lista, em nome de quem a chave grava: uma pessoa da empresa com acesso.");
  const made = newApiKey(tenant);
  const { rows } = await conn.query(
    `INSERT INTO api_keys (name, prefix, key_hash, can_write, owner_email, owner_name, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${KEY_COLUMNS}`,
    [name, made.prefix, made.hash, input.canWrite, String(owner.rows[0].email), String(owner.rows[0].name), who],
  );
  return { key: made.key, record: toKey(rows[0]) };
}

/** Stops a key for good. A key is never brought back: a new one is made. */
export async function revokeApiKey(id: number, who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("UPDATE api_keys SET revoked_at = now(), revoked_by = $2 WHERE id = $1 AND revoked_at IS NULL RETURNING id", [id, who]);
  if (rows.length === 0) throw new IntegrationError("Chave não encontrada ou já revogada.");
}

/** The key a request came with, when it is one of this company and still good. Marks that it was used. */
export async function matchApiKey(key: string, conn: Queryable): Promise<ApiKey | null> {
  const { rows } = await conn.query(`UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1 AND revoked_at IS NULL RETURNING ${KEY_COLUMNS}`, [hashApiKey(key)]);
  return rows[0] ? toKey(rows[0]) : null;
}

/** What the ERP tells other systems about, with the words of the screen. */
export const WEBHOOK_EVENTS = {
  "oportunidade.criada": "Oportunidade criada no funil",
  "oportunidade.ganha": "Oportunidade ganha",
  "oportunidade.perdida": "Oportunidade perdida",
  "pedido.fechado": "Pedido fechado",
  "contrato.assinado": "Contrato assinado pelo cliente",
} as const;
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;

export type Webhook = { id: number; name: string; url: string; events: string[]; active: boolean; createdAt: Date; createdBy: string; failed: number; delivered: number };

export async function listWebhooks(conn: Queryable): Promise<Webhook[]> {
  const { rows } = await conn.query(
    `SELECT w.id, w.name, w.url, w.events, w.active, w.created_at, w.created_by,
            (SELECT count(*)::int FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'falhou') AS failed,
            (SELECT count(*)::int FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'entregue') AS delivered
       FROM webhooks w ORDER BY w.id DESC`,
  );
  return rows.map((row) => ({
    id: Number(row.id), name: String(row.name), url: String(row.url), events: row.events as string[], active: row.active === true, createdAt: row.created_at as Date, createdBy: String(row.created_by),
    failed: Number(row.failed), delivered: Number(row.delivered),
  }));
}

/**
 * A new address for the notices. It has to be a public `https` address; the
 * secret that signs the notices is returned once and kept sealed.
 */
export async function createWebhook(input: { name: string; url: string; events: string[] }, key: Buffer, who: string, conn: Queryable, resolve?: Parameters<typeof checkPublicUrl>[1]): Promise<{ secret: string; id: number }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 60) throw new IntegrationError("Dê um nome ao destino (2 a 60 letras).");
  const events = [...new Set(input.events)].filter((event): event is WebhookEvent => event in WEBHOOK_EVENTS);
  if (events.length === 0) throw new IntegrationError("Marque ao menos um aviso.");
  let url: URL;
  try {
    url = await checkPublicUrl(input.url, resolve);
  } catch (error) {
    if (error instanceof AddressError) throw new IntegrationError(error.message);
    throw error;
  }
  const secret = newWebhookSecret();
  const sealed = sealSecret(secret, key);
  const { rows } = await conn.query(
    "INSERT INTO webhooks (name, url, events, secret, secret_iv, secret_tag, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    [name, url.toString(), events, sealed.ciphertext, sealed.iv, sealed.authTag, who],
  );
  return { secret, id: Number(rows[0].id) };
}

export async function setWebhookActive(id: number, active: boolean, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("UPDATE webhooks SET active = $2 WHERE id = $1 RETURNING id", [id, active]);
  if (rows.length === 0) throw new IntegrationError("Destino não encontrado.");
}

/** Removes an address with the record of what was sent to it. */
export async function deleteWebhook(id: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("WITH sent AS (DELETE FROM webhook_deliveries WHERE webhook_id = $1) DELETE FROM webhooks WHERE id = $1 RETURNING id", [id]);
  if (rows.length === 0) throw new IntegrationError("Destino não encontrado.");
}

/**
 * Leaves a notice to be delivered to every active address that asked for the
 * event. Nothing is sent here: the delivery happens after the answer to the
 * person, so a slow or broken address never holds a sale. `data` never
 * carries cost, margin or profit.
 */
export async function emitEvent(event: WebhookEvent, data: Record<string, unknown>, now: Date, conn: Queryable): Promise<number> {
  const { rows } = await conn.query(
    `INSERT INTO webhook_deliveries (webhook_id, event, payload)
     SELECT w.id, $1, $2::jsonb FROM webhooks w WHERE w.active AND $1 = ANY (w.events) RETURNING id`,
    [event, JSON.stringify({ evento: event, em: now.toISOString(), dados: data })],
  );
  return rows.length;
}

/** How many times a notice is tried before it is left as failed for someone to look at. */
export const MAX_ATTEMPTS = 5;

type Poster = (url: string, init: { method: string; headers: Record<string, string>; body: string; redirect: "manual"; signal: AbortSignal }) => Promise<{ status: number }>;

/**
 * Sends what is waiting, oldest first. Each notice goes by POST, signed, with
 * no redirect followed and ten seconds to answer; a 2xx is a delivery,
 * anything else counts a try. The address is checked again right before each
 * try. Safe to call from several places at once: a notice being sent is taken
 * by one caller only.
 */
export async function deliverPending(key: () => Buffer, now: Date, conn: Queryable, post: Poster = fetch, resolve?: Parameters<typeof checkPublicUrl>[1]): Promise<{ delivered: number; failed: number }> {
  const taken = await conn.query(
    `UPDATE webhook_deliveries d SET attempts = attempts + 1
      WHERE d.id IN (SELECT p.id FROM webhook_deliveries p JOIN webhooks w ON w.id = p.webhook_id
                      WHERE p.status <> 'entregue' AND p.attempts < $1 AND w.active ORDER BY p.id LIMIT 20 FOR UPDATE OF p SKIP LOCKED)
      RETURNING d.id, d.webhook_id, d.event, d.payload, d.attempts`,
    [MAX_ATTEMPTS],
  );
  let delivered = 0;
  let failed = 0;
  for (const row of taken.rows) {
    const hook = await conn.query("SELECT url, secret, secret_iv, secret_tag FROM webhooks WHERE id = $1", [row.webhook_id]);
    let result: string;
    let ok = false;
    try {
      const target = hook.rows[0];
      if (!target) throw new AddressError("destino removido");
      const url = await checkPublicUrl(String(target.url), resolve);
      let secret: string;
      try {
        secret = openSecret({ ciphertext: target.secret as Buffer, iv: target.secret_iv as Buffer, authTag: target.secret_tag as Buffer }, key());
      } catch {
        throw new AddressError("o segredo deste destino não pôde ser aberto neste servidor");
      }
      const body = JSON.stringify({ id: Number(row.id), ...(row.payload as object) });
      const response = await post(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "ERP-Avila-Ops/1", "X-ERP-Evento": String(row.event), "X-ERP-Assinatura": signWebhook(secret, body, now) },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      ok = response.status >= 200 && response.status < 300;
      result = `resposta ${response.status}`;
    } catch (error) {
      result = error instanceof AddressError ? error.message : "o destino não respondeu";
    }
    await conn.query("UPDATE webhook_deliveries SET status = $2, last_result = $3, delivered_at = CASE WHEN $2 = 'entregue' THEN now() END WHERE id = $1", [row.id, ok ? "entregue" : "falhou", result]);
    if (ok) delivered += 1;
    else failed += 1;
  }
  return { delivered, failed };
}

export type Delivery = { id: number; webhookId: number; event: string; status: "pendente" | "entregue" | "falhou"; attempts: number; lastResult: string | null; createdAt: Date };

/** The latest notices of every address, for the screen. The payload is not shown here. */
export async function listDeliveries(conn: Queryable, limit = 30): Promise<Delivery[]> {
  const { rows } = await conn.query("SELECT id, webhook_id, event, status, attempts, last_result, created_at FROM webhook_deliveries ORDER BY id DESC LIMIT $1", [limit]);
  return rows.map((row) => ({ id: Number(row.id), webhookId: Number(row.webhook_id), event: String(row.event), status: row.status as Delivery["status"], attempts: Number(row.attempts), lastResult: text(row.last_result), createdAt: row.created_at as Date }));
}

/** Gives a failed notice its tries back, to be sent again. */
export async function retryDelivery(id: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("UPDATE webhook_deliveries SET attempts = 0, status = 'pendente' WHERE id = $1 AND status = 'falhou' RETURNING id", [id]);
  if (rows.length === 0) throw new IntegrationError("Aviso não encontrado ou já entregue.");
}

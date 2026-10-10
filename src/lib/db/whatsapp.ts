import { randomBytes } from "node:crypto";
import type { FunnelScope } from "@/lib/db/funnel";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { openSecret, sealSecret } from "@/lib/mail/vault";
import { WhatsappError } from "@/lib/whatsapp/api";
import type { WhatsappEvent, WhatsappSender } from "@/lib/whatsapp/api";

/** What the screen shows of the company's WhatsApp account. The access key and the secret are never here. */
export type WhatsappInfo = { phoneNumberId: string; displayPhone: string | null; verifyToken: string };

export async function loadWhatsappInfo(conn: Queryable): Promise<WhatsappInfo | null> {
  const { rows } = await conn.query("SELECT phone_number_id, display_phone, verify_token FROM whatsapp_settings");
  return rows[0] ? { phoneNumberId: String(rows[0].phone_number_id), displayPhone: rows[0].display_phone === null ? null : String(rows[0].display_phone), verifyToken: String(rows[0].verify_token) } : null;
}

export type WhatsappInput = { phoneNumberId: string; displayPhone: string | null; token: string; secret: string };

/** Stores the company's account, with the access key and the secret of the application sealed. Another one replaces it; the address check word stays. */
export async function saveWhatsapp(input: WhatsappInput, key: Buffer, who: string, conn: Queryable): Promise<void> {
  const problems: string[] = [];
  if (!/^[0-9]{5,30}$/.test(input.phoneNumberId.trim())) problems.push("Identificador do número: só os dígitos que a Meta mostra em Configuração da API.");
  const display = input.displayPhone?.trim() || null;
  if (display !== null && (display.length < 8 || display.length > 25)) problems.push("Número como o cliente vê: de 8 a 25 caracteres.");
  if (input.token.trim().length < 20 || input.token.length > 2000) problems.push("Chave de acesso: a chave permanente gerada na Meta.");
  if (input.secret.trim().length < 8 || input.secret.length > 500) problems.push("Segredo do aplicativo: em Configurações do aplicativo → Básico.");
  if (problems.length > 0) throw new WhatsappError(problems.join(" "));
  const token = sealSecret(input.token.trim(), key);
  const secret = sealSecret(input.secret.trim(), key);
  await conn.query(
    `INSERT INTO whatsapp_settings (phone_number_id, display_phone, token, token_iv, token_tag, secret, secret_iv, secret_tag, verify_token, updated_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET phone_number_id = EXCLUDED.phone_number_id, display_phone = EXCLUDED.display_phone, token = EXCLUDED.token, token_iv = EXCLUDED.token_iv, token_tag = EXCLUDED.token_tag,
       secret = EXCLUDED.secret, secret_iv = EXCLUDED.secret_iv, secret_tag = EXCLUDED.secret_tag, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [input.phoneNumberId.trim(), display, token.ciphertext, token.iv, token.authTag, secret.ciphertext, secret.iv, secret.authTag, randomBytes(24).toString("base64url"), who],
  );
}

/** Takes the account away: nothing more is sent or received. The conversations stay. */
export async function removeWhatsapp(conn: Queryable): Promise<void> {
  await conn.query("DELETE FROM whatsapp_settings");
}

/** The account as the sending and the checking of a notice need it. `key` opens the two secrets. */
export async function whatsappAccount(conn: Queryable, key: () => Buffer): Promise<{ phoneNumberId: string; token: string; secret: string; verifyToken: string } | null> {
  const { rows } = await conn.query("SELECT phone_number_id, token, token_iv, token_tag, secret, secret_iv, secret_tag, verify_token FROM whatsapp_settings");
  const row = rows[0];
  if (!row) return null;
  const vault = key();
  return {
    phoneNumberId: String(row.phone_number_id), verifyToken: String(row.verify_token),
    token: openSecret({ ciphertext: row.token as Buffer, iv: row.token_iv as Buffer, authTag: row.token_tag as Buffer }, vault),
    secret: openSecret({ ciphertext: row.secret as Buffer, iv: row.secret_iv as Buffer, authTag: row.secret_tag as Buffer }, vault),
  };
}

export type WhatsappTemplate = { id: number; name: string; language: string; preview: string };

export async function listWhatsappTemplates(conn: Queryable): Promise<WhatsappTemplate[]> {
  const { rows } = await conn.query("SELECT id, name, language, preview FROM whatsapp_templates ORDER BY name");
  return rows.map((row) => ({ id: Number(row.id), name: String(row.name), language: String(row.language), preview: String(row.preview) }));
}

export async function saveWhatsappTemplate(id: number | null, input: { name: string; language: string; preview: string }, who: string, conn: Queryable): Promise<void> {
  const name = input.name.trim().toLowerCase();
  const language = input.language.trim() || "pt_BR";
  const preview = input.preview.replace(/\r\n?/g, "\n").trim();
  const problems: string[] = [];
  if (!/^[a-z0-9_]{1,100}$/.test(name)) problems.push("Nome do modelo: exatamente como está na Meta (letras minúsculas, números e _).");
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(language)) problems.push("Idioma: como pt_BR.");
  if (preview.length < 2 || preview.length > 1000) problems.push("Texto do modelo: de 2 a 1.000 letras, para a equipe saber o que ele diz.");
  if (problems.length > 0) throw new WhatsappError(problems.join(" "));
  try {
    const { rows } = id === null
      ? await conn.query("INSERT INTO whatsapp_templates (name, language, preview, updated_by) VALUES ($1, $2, $3, $4) RETURNING id", [name, language, preview, who])
      : await conn.query("UPDATE whatsapp_templates SET name = $2, language = $3, preview = $4, updated_at = now(), updated_by = $5 WHERE id = $1 RETURNING id", [id, name, language, preview, who]);
    if (rows.length === 0) throw new WhatsappError("Modelo não encontrado. Recarregue a página.");
  } catch (error) {
    if (pgErrorCode(error) === "23505") throw new WhatsappError("Já existe um modelo com esse nome.");
    throw error;
  }
}

export async function deleteWhatsappTemplate(id: number, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("DELETE FROM whatsapp_templates WHERE id = $1 RETURNING id", [id]);
  if (rows.length === 0) throw new WhatsappError("Modelo não encontrado. Recarregue a página.");
}

/** `5517999990000`: a Brazilian number with area code as WhatsApp knows it, or `null`. */
export function whatsappNumber(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (/^55\d{10,11}$/.test(digits)) return digits;
  return /^\d{10,11}$/.test(digits) ? `55${digits}` : null;
}

/**
 * One spelling for each number: WhatsApp still tells some Brazilian mobiles
 * without the ninth digit, and the same person must not become two conversations.
 */
export const canonicalContact = (contact: string): string => contact.replace(/^55(\d{2})([6-9]\d{7})$/, "55$19$2");

/** The two ways Brazilian mobile numbers are written: with and without the ninth digit. WhatsApp may answer with either. */
const variants = (contact: string): string[] => {
  const found = /^55(\d{2})(9?)(\d{8})$/.exec(contact);
  return found ? [`55${found[1]}9${found[3]}`, `55${found[1]}${found[3]}`] : [contact];
};

/**
 * The opportunity a number speaks for: the one whose phone (its own, or its
 * customer's) is that number, the one in progress first, the most recent
 * otherwise.
 */
const OWNER_OF = `SELECT o.id, o.title, o.owner_email, o.owner_name FROM opportunities o JOIN pipeline_stages s ON s.id = o.stage_id LEFT JOIN customers c ON c.id = o.customer_id
  WHERE regexp_replace(regexp_replace(COALESCE(NULLIF(btrim(o.phone), ''), c.phone, ''), '[^0-9]', '', 'g'), '^(0+|55(?=[0-9]{10,11}$))', '') = ANY($1::text[])
  ORDER BY (s.kind = 'aberta') DESC, o.updated_at DESC, o.id DESC LIMIT 1`;

const local = (contact: string) => variants(contact).map((number) => number.replace(/^55/, ""));

/**
 * Takes in what a notice of Meta said. A message of a customer is kept once;
 * when the number is of an opportunity, its cadence stops and the seller gets
 * the task of answering. A status moves the message it is about, never
 * backwards (a "delivered" arriving after a "read" changes nothing).
 */
export async function receiveWhatsapp(events: WhatsappEvent[], now: Date, conn: Queryable): Promise<{ kept: number }> {
  let kept = 0;
  for (const event of events) {
    if (event.kind === "status") {
      await conn.query(
        `UPDATE whatsapp_messages SET status = $2, detail = COALESCE($3, detail) WHERE wa_id = $1 AND direction = 'saida'
            AND array_position(ARRAY['enviada', 'entregue', 'lida'], status) IS NOT NULL
            AND ($2 = 'falhou' OR array_position(ARRAY['enviada', 'entregue', 'lida'], $2) > array_position(ARRAY['enviada', 'entregue', 'lida'], status))`,
        [event.id, event.status, event.detail],
      );
      continue;
    }
    const stored = await conn.query(
      "INSERT INTO whatsapp_messages (contact, contact_name, direction, body, status, wa_id, created_at) VALUES ($1, $2, 'entrada', $3, 'recebida', $4, $5) ON CONFLICT (wa_id) DO NOTHING RETURNING id",
      [canonicalContact(event.from), event.name?.slice(0, 200) ?? null, event.text.trim() || "(mensagem vazia)", event.id, event.at],
    );
    if (stored.rows.length === 0) continue;
    kept += 1;
    const owner = (await conn.query(OWNER_OF, [local(event.from)])).rows[0];
    if (!owner) continue;
    await conn.query("UPDATE opportunity_cadences SET status = 'parada', stopped_reason = 'O cliente respondeu.', finished_at = now() WHERE opportunity_id = $1 AND status = 'ativa'", [owner.id]);
    // One open task per opportunity is enough: a customer who writes ten lines does not leave ten tasks.
    await conn.query(
      `INSERT INTO opportunity_activities (opportunity_id, kind, title, due_on, owner_email, created_by)
       SELECT $1, 'tarefa', $2, ($3::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date, $4, 'whatsapp'
        WHERE NOT EXISTS (SELECT 1 FROM opportunity_activities a WHERE a.opportunity_id = $1 AND a.created_by = 'whatsapp' AND a.done_at IS NULL)`,
      [owner.id, `Responder o WhatsApp de ${event.name ?? event.from}`.slice(0, 300), now, owner.owner_email],
    );
    await conn.query("UPDATE opportunities SET updated_at = now(), updated_by = 'whatsapp' WHERE id = $1", [owner.id]);
  }
  return { kept };
}

export type WhatsappMessage = { id: number; direction: "entrada" | "saida"; body: string; status: string; detail: string | null; sentBy: string | null; at: Date };

/** The conversation with one number, the oldest first, the last 100 messages. */
export async function listConversation(contact: string, conn: Queryable): Promise<WhatsappMessage[]> {
  const { rows } = await conn.query(
    "SELECT id, direction, body, status, detail, sent_by, created_at FROM (SELECT * FROM whatsapp_messages WHERE contact = ANY($1::text[]) ORDER BY id DESC LIMIT 100) m ORDER BY id",
    [variants(contact)],
  );
  return rows.map((row) => ({ id: Number(row.id), direction: row.direction as "entrada" | "saida", body: String(row.body), status: String(row.status), detail: row.detail === null ? null : String(row.detail), sentBy: row.sent_by === null ? null : String(row.sent_by), at: row.created_at as Date }));
}

/** How long after the customer's last message a free text may still be sent. After it, only an approved template. */
export const WINDOW_HOURS = 24;

/** Whether the customer wrote to the company in the last 24 hours: only then WhatsApp takes a free text. */
export async function windowOpen(contact: string, now: Date, conn: Queryable): Promise<boolean> {
  const { rows } = await conn.query("SELECT 1 FROM whatsapp_messages WHERE contact = ANY($1::text[]) AND direction = 'entrada' AND created_at > $2::timestamptz - interval '24 hours' LIMIT 1", [variants(contact), now]);
  return rows.length > 0;
}

export type Conversation = { contact: string; name: string | null; last: string; lastAt: Date; waiting: boolean; opportunityId: number | null; opportunityTitle: string | null; ownerName: string | null };

/**
 * The conversations, the most recent first, each with the opportunity its
 * number speaks for. A seller gets only the ones of their own opportunities;
 * who follows the whole team also gets the numbers that are of nobody yet.
 */
export async function listConversations(scope: FunnelScope, conn: Queryable): Promise<Conversation[]> {
  const { rows } = await conn.query(
    `SELECT DISTINCT ON (m.contact) m.contact, m.body, m.direction, m.created_at,
            (SELECT n.contact_name FROM whatsapp_messages n WHERE n.contact = m.contact AND n.contact_name IS NOT NULL ORDER BY n.id DESC LIMIT 1) AS name
       FROM whatsapp_messages m ORDER BY m.contact, m.id DESC`,
  );
  const conversations: Conversation[] = [];
  for (const row of rows) {
    const owner = (await conn.query(OWNER_OF, [local(String(row.contact))])).rows[0];
    if (scope.ownerEmail !== null && owner?.owner_email !== scope.ownerEmail) continue;
    conversations.push({
      contact: String(row.contact), name: row.name === null ? null : String(row.name), last: String(row.body), lastAt: row.created_at as Date, waiting: row.direction === "entrada",
      opportunityId: owner ? Number(owner.id) : null, opportunityTitle: owner ? String(owner.title) : null, ownerName: owner ? String(owner.owner_name) : null,
    });
  }
  return conversations.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

export type WhatsappWay = { key: () => Buffer; send: WhatsappSender; now: Date };

/**
 * Sends a message to the contact of an opportunity within reach, by the
 * company's account: a free text while the 24 hours after the customer's last
 * message last, an approved template otherwise. It is kept with its result;
 * what WhatsApp refuses is kept as failed, with what it said.
 */
export async function sendWhatsapp(opportunityId: number, input: { text: string; templateId: number | null }, who: string, scope: FunnelScope, way: WhatsappWay, conn: Queryable): Promise<{ status: "enviada" | "falhou"; detail: string | null }> {
  const found = await conn.query(
    "SELECT COALESCE(NULLIF(btrim(o.phone), ''), c.phone) AS phone FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 AND ($2::text IS NULL OR o.owner_email = $2)",
    [opportunityId, scope.ownerEmail],
  );
  if (!found.rows[0]) throw new WhatsappError("Oportunidade não encontrada. Recarregue a página.");
  const contact = whatsappNumber(found.rows[0].phone === null ? null : String(found.rows[0].phone));
  if (!contact) throw new WhatsappError("Esta oportunidade não tem um celular com DDD. Preencha em Dados.");
  const account = await whatsappAccount(conn, way.key);
  if (!account) throw new WhatsappError("A conta de WhatsApp da empresa ainda não foi cadastrada (Parâmetros → WhatsApp).");
  let body: string;
  let message: Parameters<WhatsappSender>[1];
  if (input.templateId !== null) {
    const template = (await listWhatsappTemplates(conn)).find((row) => row.id === input.templateId);
    if (!template) throw new WhatsappError("Modelo não encontrado. Recarregue a página.");
    body = template.preview;
    message = { to: contact, template: { name: template.name, language: template.language } };
  } else {
    body = input.text.replace(/\r\n?/g, "\n").trim();
    if (body.length < 1 || body.length > 4000) throw new WhatsappError("Escreva a mensagem (até 4.000 letras).");
    if (!(await windowOpen(contact, way.now, conn))) throw new WhatsappError("Faz mais de 24 horas que o cliente escreveu: o WhatsApp só aceita um modelo aprovado. Escolha um modelo.");
    message = { to: contact, text: body };
  }
  let status: "enviada" | "falhou" = "enviada";
  let detail: string | null = null;
  let waId: string | null = null;
  try {
    waId = (await way.send({ phoneNumberId: account.phoneNumberId, token: account.token }, message)).id;
  } catch (error) {
    if (!(error instanceof WhatsappError)) throw error;
    status = "falhou";
    detail = error.message.slice(0, 300);
  }
  await conn.query("INSERT INTO whatsapp_messages (contact, direction, body, status, detail, wa_id, sent_by, created_at) VALUES ($1, 'saida', $2, $3, $4, $5, $6, $7)", [contact, body, status, detail, waId, who, way.now]);
  if (status === "enviada") await conn.query("UPDATE opportunities SET updated_at = now(), updated_by = $2 WHERE id = $1", [opportunityId, who]);
  return { status, detail };
}

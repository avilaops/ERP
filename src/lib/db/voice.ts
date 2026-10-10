import type { FunnelScope } from "@/lib/db/funnel";
import type { Queryable } from "@/lib/db/pool";
import { VoiceError } from "@/lib/voice/call";
import type { CallStarter, VoiceConfig } from "@/lib/voice/call";

export type VoiceSettings = { enabled: boolean; monthlyLimit: number };

export async function loadVoiceSettings(conn: Queryable): Promise<VoiceSettings> {
  const { rows } = await conn.query("SELECT enabled, monthly_limit FROM voice_settings");
  return { enabled: Boolean(rows[0]?.enabled), monthlyLimit: Number(rows[0]?.monthly_limit ?? 300) };
}

export async function saveVoiceSettings(input: VoiceSettings, who: string, conn: Queryable): Promise<void> {
  if (!Number.isInteger(input.monthlyLimit) || input.monthlyLimit < 1 || input.monthlyLimit > 20_000) throw new VoiceError("Limite por mês: de 1 a 20.000 ligações.");
  await conn.query("UPDATE voice_settings SET enabled = $1, monthly_limit = $2, updated_at = now(), updated_by = $3", [input.enabled, input.monthlyLimit, who]);
}

/** How many calls the company asked for in the month of `now` (São Paulo). */
export async function callsThisMonth(now: Date, conn: Queryable): Promise<number> {
  const { rows } = await conn.query(
    "SELECT count(*) AS total FROM voice_calls WHERE date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo') = date_trunc('month', $1::timestamptz AT TIME ZONE 'America/Sao_Paulo')",
    [now],
  );
  return Number(rows[0].total);
}

/** `5517999990000` from what was typed, or `null` when it is not a Brazilian number with area code. */
export function callNumber(typed: string | null): string | null {
  const digits = (typed ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (/^55\d{10,11}$/.test(digits)) return digits;
  return /^\d{10,11}$/.test(digits) ? `55${digits}` : null;
}

/** The phone a person of the team answers the system's calls on, as they last informed it. */
export async function callPhoneOf(email: string, conn: Queryable): Promise<string | null> {
  const { rows } = await conn.query("SELECT call_phone FROM users WHERE email = $1", [email.trim().toLowerCase()]);
  return rows[0]?.call_phone ? String(rows[0].call_phone) : null;
}

export type VoiceWay = { config: VoiceConfig | null; start: CallStarter; now: Date };

/**
 * Makes the system call: the provider rings the phone of who asks and, when
 * they answer, connects to the contact of an opportunity within their reach.
 * Refused before any call when the server has no provider, the company has it
 * off, the month's limit was reached or a number is missing. The phone typed
 * is remembered for the next time, and the call is written down as an activity.
 */
export async function callOpportunity(opportunityId: number, typedPhone: string, who: { email: string; name: string }, scope: FunnelScope, way: VoiceWay, conn: Queryable): Promise<void> {
  if (!way.config) throw new VoiceError("A telefonia não está configurada neste servidor.");
  const settings = await loadVoiceSettings(conn);
  if (!settings.enabled) throw new VoiceError("A ligação pelo sistema está desligada para esta empresa. Quem liga é a diretoria, em Parâmetros → Telefonia.");
  if ((await callsThisMonth(way.now, conn)) >= settings.monthlyLimit) throw new VoiceError("O limite de ligações pelo sistema deste mês foi atingido. A diretoria pode aumentar em Parâmetros → Telefonia.");
  const seller = callNumber(typedPhone);
  if (!seller) throw new VoiceError("Informe o seu telefone com DDD: é nele que o sistema liga primeiro.");
  const found = await conn.query(
    "SELECT COALESCE(NULLIF(btrim(o.phone), ''), c.phone) AS phone, COALESCE(NULLIF(btrim(o.contact_name), ''), c.name, o.company) AS contact, o.owner_email FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 AND ($2::text IS NULL OR o.owner_email = $2)",
    [opportunityId, scope.ownerEmail],
  );
  if (!found.rows[0]) throw new VoiceError("Oportunidade não encontrada. Recarregue a página.");
  const customer = callNumber(found.rows[0].phone === null ? null : String(found.rows[0].phone));
  if (!customer) throw new VoiceError("Esta oportunidade não tem um telefone com DDD. Preencha em Dados.");
  if (customer === seller) throw new VoiceError("O seu telefone e o do cliente são o mesmo número.");
  const call = await way.start(way.config, { seller, customer });
  await conn.query("UPDATE users SET call_phone = $2 WHERE email = $1", [who.email.trim().toLowerCase(), seller]);
  await conn.query("INSERT INTO voice_calls (opportunity_id, provider_id, created_by, created_at) VALUES ($1, $2, $3, $4)", [opportunityId, call.id.slice(0, 100), who.email, way.now]);
  await conn.query(
    "INSERT INTO opportunity_activities (opportunity_id, kind, title, done_at, done_by, owner_email, created_by) VALUES ($1, 'ligacao', $2, $3, $4, $5, $4)",
    [opportunityId, `Ligação pelo sistema para ${String(found.rows[0].contact ?? "o cliente")}`.slice(0, 300), way.now, who.email, found.rows[0].owner_email],
  );
  await conn.query("UPDATE opportunities SET updated_at = now(), updated_by = $2 WHERE id = $1", [opportunityId, who.email]);
}

import { randomBytes } from "node:crypto";
import type { Queryable } from "@/lib/db/pool";
import { isMailAddress } from "@/lib/mail/message";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class OptoutError extends Error {}

/** The shape of the end of an unsubscribe address: 32 random bytes in base64url. */
export const UNSUBSCRIBE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Whether this address asked to get no more automatic e-mail from the company. */
export async function isOptedOut(email: string, conn: Queryable): Promise<boolean> {
  const { rows } = await conn.query("SELECT 1 FROM mail_optouts WHERE email = $1", [email.trim().toLowerCase()]);
  return rows.length > 0;
}

/**
 * The unsubscribe address of one recipient in one company: made the first time
 * an automatic e-mail goes to them and the same ever after, so the link of an
 * old message keeps working.
 */
export async function unsubscribeUrl(email: string, appUrl: string, tenantSlug: string, conn: Queryable): Promise<string> {
  const { rows } = await conn.query(
    "INSERT INTO mail_unsubscribe_links (email, token) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING token",
    [email.trim().toLowerCase(), randomBytes(32).toString("base64url")],
  );
  return `${appUrl}/descadastro/${tenantSlug}/${String(rows[0].token)}`;
}

/** The text with the way out at the foot, as every automatic e-mail carries. */
export const withUnsubscribe = (text: string, company: string, url: string): string => `${text}\n\n--\nPara não receber mais e-mails de ${company}, acesse: ${url}`;

/** The address a link stands for, or `null` when the link opens nothing. */
export async function emailOfUnsubscribe(token: string, conn: Queryable): Promise<string | null> {
  if (!UNSUBSCRIBE_TOKEN.test(token)) return null;
  const { rows } = await conn.query("SELECT email FROM mail_unsubscribe_links WHERE token = $1", [token]);
  return rows[0] ? String(rows[0].email) : null;
}

/** Takes the address of a link off every automatic e-mail. Doing it twice is the same as once. */
export async function unsubscribeByToken(token: string, conn: Queryable): Promise<string | null> {
  const email = await emailOfUnsubscribe(token, conn);
  if (email === null) return null;
  await conn.query("INSERT INTO mail_optouts (email, origin, created_by) VALUES ($1, 'descadastro', $1) ON CONFLICT (email) DO NOTHING", [email]);
  return email;
}

export type Optout = { email: string; origin: "descadastro" | "manual"; createdAt: Date; createdBy: string };

export async function listOptouts(conn: Queryable): Promise<Optout[]> {
  const { rows } = await conn.query("SELECT email, origin, created_at, created_by FROM mail_optouts ORDER BY created_at DESC, email");
  return rows.map((row) => ({ email: String(row.email), origin: row.origin as Optout["origin"], createdAt: row.created_at as Date, createdBy: String(row.created_by) }));
}

/** Somebody of the team takes an address off, at the person's request. */
export async function addOptout(email: string, who: string, conn: Queryable): Promise<void> {
  const address = email.trim().toLowerCase();
  if (!isMailAddress(address)) throw new OptoutError("E-mail inválido.");
  const { rows } = await conn.query("INSERT INTO mail_optouts (email, origin, created_by) VALUES ($1, 'manual', $2) ON CONFLICT (email) DO NOTHING RETURNING email", [address, who]);
  if (rows.length === 0) throw new OptoutError("Este e-mail já está na lista.");
}

/** Puts an address back among those who receive. Only on the person's own request: the screen says so. */
export async function removeOptout(email: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("DELETE FROM mail_optouts WHERE email = $1 RETURNING email", [email.trim().toLowerCase()]);
  if (rows.length === 0) throw new OptoutError("E-mail não encontrado na lista. Recarregue a página.");
}

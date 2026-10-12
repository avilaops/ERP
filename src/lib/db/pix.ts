import type { Queryable } from "@/lib/db/pool";
import { pixKey, pixText } from "@/lib/pix";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class PixError extends Error {}

/** The key of the company and how the receiver shows in the bank of who pays. */
export type PixSettings = { key: string; name: string; city: string };

export async function loadPixSettings(conn: Queryable): Promise<PixSettings | null> {
  const { rows } = await conn.query("SELECT pix_key, pix_name, pix_city FROM company_settings");
  const row = rows[0];
  return row && row.pix_key !== null ? { key: String(row.pix_key), name: String(row.pix_name), city: String(row.pix_city) } : null;
}

/** Writes the key as the banks expect it and the name and the city as the code accepts them (no accents, 25 and 15 letters). */
export async function savePixSettings(input: { key: string; name: string; city: string }, updatedBy: string, conn: Queryable): Promise<PixSettings> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está alterando a cobrança por PIX.");
  const key = pixKey(input.key);
  if (!key) throw new PixError("Chave PIX: informe CNPJ, CPF, e-mail, celular com DDD ou a chave aleatória inteira.");
  const [name, city] = [pixText(input.name, 25), pixText(input.city, 15)];
  if (name === "") throw new PixError("Informe o nome de quem recebe, como está na conta do banco.");
  if (city === "") throw new PixError("Informe a cidade da conta.");
  const { rows } = await conn.query("UPDATE company_settings SET pix_key = $1, pix_name = $2, pix_city = $3, updated_at = now(), updated_by = $4 RETURNING id", [key.key, name, city, updatedBy]);
  if (!rows[0]) throw new Error("Dados da empresa não cadastrados no banco. Rode `npm run db:migrate`.");
  return { key: key.key, name, city };
}

export async function removePixSettings(updatedBy: string, conn: Queryable): Promise<void> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está alterando a cobrança por PIX.");
  await conn.query("UPDATE company_settings SET pix_key = NULL, pix_name = NULL, pix_city = NULL, updated_at = now(), updated_by = $1", [updatedBy]);
}

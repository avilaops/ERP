import type { Queryable } from "@/lib/db/pool";
import { detectLogoType, logoProblem } from "@/lib/logo";
import type { LogoType } from "@/lib/logo";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class CompanyError extends Error {}

export type CompanyLogo = { bytes: Buffer; type: LogoType; updatedAt: Date };

/**
 * When the company's logo was last changed, or `null` when it has none. Cheap:
 * the menu asks this on every page, and the image itself is only read by its own route.
 */
export async function loadLogoVersion(conn: Queryable): Promise<Date | null> {
  const { rows } = await conn.query("SELECT logo_updated_at FROM company_settings WHERE logo IS NOT NULL");
  return (rows[0]?.logo_updated_at as Date | undefined) ?? null;
}

export async function loadLogo(conn: Queryable): Promise<CompanyLogo | null> {
  const { rows } = await conn.query("SELECT logo, logo_type, logo_updated_at FROM company_settings WHERE logo IS NOT NULL");
  const row = rows[0];
  if (!row) return null;
  return { bytes: row.logo as Buffer, type: row.logo_type as LogoType, updatedAt: row.logo_updated_at as Date };
}

/** Stores the logo. The type is the one found in the bytes, never the one declared. */
export async function saveLogo(bytes: Uint8Array, updatedBy: string, conn: Queryable): Promise<void> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está trocando a logo.");
  const problem = logoProblem(bytes);
  if (problem) throw new CompanyError(problem);

  const { rows } = await conn.query(
    `UPDATE company_settings
        SET logo = $1, logo_type = $2, logo_updated_at = now(), updated_at = now(), updated_by = $3
      RETURNING id`,
    [Buffer.from(bytes), detectLogoType(bytes), updatedBy],
  );
  if (rows.length === 0) throw new Error("Dados da empresa não cadastrados no banco. Rode `npm run db:migrate`.");
}

/** Takes the logo out: the menu goes back to showing the company's name. */
export async function removeLogo(updatedBy: string, conn: Queryable): Promise<void> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está removendo a logo.");
  await conn.query(
    "UPDATE company_settings SET logo = NULL, logo_type = NULL, logo_updated_at = NULL, updated_at = now(), updated_by = $1",
    [updatedBy],
  );
}

/** The day of the month the commissions of the previous month are paid on. */
export async function loadCommissionDay(conn: Queryable): Promise<number> {
  const { rows } = await conn.query("SELECT commission_payment_day FROM company_settings");
  if (rows.length === 0) throw new Error("Dados da empresa não cadastrados no banco. Rode `npm run db:migrate`.");
  return Number(rows[0].commission_payment_day);
}

/** Changes the day for the commissions born from now on; the ones already written keep their date. */
export async function saveCommissionDay(day: number, updatedBy: string, conn: Queryable): Promise<void> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está alterando o dia da comissão.");
  if (!Number.isInteger(day) || day < 1 || day > 28) throw new CompanyError("Dia do pagamento: informe um número inteiro de 1 a 28.");
  const { rows } = await conn.query(
    "UPDATE company_settings SET commission_payment_day = $1, updated_at = now(), updated_by = $2 RETURNING id",
    [day, updatedBy],
  );
  if (rows.length === 0) throw new Error("Dados da empresa não cadastrados no banco. Rode `npm run db:migrate`.");
}

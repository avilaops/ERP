import type { Queryable } from "@/lib/db/pool";
import type { MenuItemKey } from "@/lib/auth/permissions";

/** Whether the company uses the production module: orders that become work on a factory floor. */
export async function productionEnabled(conn: Queryable): Promise<boolean> {
  const { rows } = await conn.query("SELECT production_enabled FROM company_settings");
  return rows[0]?.production_enabled === true;
}

/** Turns the production module on or off for the whole company. Nothing recorded is erased. */
export async function setProductionEnabled(enabled: boolean, updatedBy: string, conn: Queryable): Promise<void> {
  if (updatedBy.trim() === "") throw new Error("Falta dizer quem está alterando o módulo de produção.");
  await conn.query("UPDATE company_settings SET production_enabled = $1, updated_at = now(), updated_by = $2", [enabled, updatedBy]);
}

/** The items of the menu the company turned off for everyone. */
export async function modulesOff(conn: Queryable): Promise<MenuItemKey[]> {
  return (await productionEnabled(conn)) ? [] : ["producao"];
}

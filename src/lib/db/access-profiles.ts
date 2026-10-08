import { COST_SCREENS, menuFor, powersOf } from "@/lib/auth/permissions";
import type { MenuItemKey } from "@/lib/auth/permissions";
import { isRole } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";
import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class ProfileError extends Error {}

/** A profile of the company: a type of origin, the screens left of it and the powers given up. */
export type AccessProfile = {
  id: number;
  name: string;
  baseRole: Role;
  /** In the order of the menu. */
  items: MenuItemKey[];
  denied: string[];
  /** How many people have it. */
  people: number;
};

export type ProfileInput = { name: string; baseRole: Role; items: string[]; denied: string[] };

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const SAME_NAME = "Já existe um perfil com esse nome.";

const profile = (row: Record<string, unknown>): AccessProfile => {
  if (!isRole(row.base_role)) throw new Error(`Tipo de origem inválido no banco para o perfil ${String(row.name)}.`);
  return { id: Number(row.id), name: String(row.name), baseRole: row.base_role, items: row.items as MenuItemKey[], denied: row.denied as string[], people: Number(row.people ?? 0) };
};

/**
 * What goes to the database, checked: the screens and the powers are the ones
 * the type of origin has, nothing beyond it; at least one screen; and no
 * screen that shows cost for a profile that gave up seeing costs.
 */
export function cleanProfile(input: ProfileInput): ProfileInput {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) throw new ProfileError("Nome do perfil: de 2 a 40 letras.");
  if (!isRole(input.baseRole)) throw new ProfileError("Escolha de qual tipo de acesso o perfil parte.");
  const own = menuFor(input.baseRole).map((item) => item.key);
  const items = own.filter((key) => input.items.includes(key));
  if (items.length === 0) throw new ProfileError("Marque pelo menos uma tela: sem nenhuma a pessoa não abre nada.");
  const denied = powersOf(input.baseRole).map((power) => power.key as string).filter((key) => input.denied.includes(key));
  if (denied.includes("custos")) {
    const showing = menuFor(input.baseRole).filter((item) => items.includes(item.key) && COST_SCREENS.includes(item.key));
    if (showing.length > 0) throw new ProfileError(`${showing.map((item) => item.label).join(" e ")} mostram custo: desmarque essas telas ou deixe o perfil ver custo, margem e lucro.`);
  }
  return { name, baseRole: input.baseRole, items, denied };
}

/** Every profile of the company, by name, with how many people have each. */
export async function listProfiles(conn: Queryable): Promise<AccessProfile[]> {
  const { rows } = await conn.query(
    `SELECT p.id, p.name, p.base_role, p.items, p.denied, (SELECT count(*) FROM users u WHERE u.profile_id = p.id) AS people
       FROM access_profiles p ORDER BY lower(p.name), p.id`,
  );
  return rows.map(profile);
}

export async function createProfile(input: ProfileInput, who: string, conn: Queryable): Promise<AccessProfile> {
  if (who.trim() === "") throw new Error("Falta dizer quem está criando o perfil.");
  const clean = cleanProfile(input);
  try {
    const { rows } = await conn.query(
      "INSERT INTO access_profiles (name, base_role, items, denied, updated_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, base_role, items, denied",
      [clean.name, clean.baseRole, clean.items, clean.denied, who],
    );
    return profile(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new ProfileError(SAME_NAME);
    throw error;
  }
}

/**
 * Changes the name, the screens and the powers of a profile; whoever has it
 * gets the change at the next page. The type of origin does not change: it is
 * what the people with the profile were given. Nobody changes the profile they
 * have themselves: that is how a company locks its own directors out.
 */
export async function updateProfile(id: number, input: Omit<ProfileInput, "baseRole">, who: string, conn: Queryable): Promise<AccessProfile> {
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando o perfil.");
  const current = (await listProfiles(conn)).find((item) => item.id === id);
  if (!current) throw new ProfileError("Perfil não encontrado. Recarregue a página.");
  const clean = cleanProfile({ ...input, baseRole: current.baseRole });
  try {
    const { rows } = await conn.query(
      `UPDATE access_profiles SET name = $2, items = $3, denied = $4, updated_at = now(), updated_by = $5
        WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM users u WHERE u.profile_id = access_profiles.id AND u.email = $6)
        RETURNING id, name, base_role, items, denied`,
      [id, clean.name, clean.items, clean.denied, who, who.trim().toLowerCase()],
    );
    if (!rows[0]) throw new ProfileError("Este é o seu próprio perfil: peça a outra pessoa da diretoria para alterá-lo.");
    return profile(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new ProfileError(SAME_NAME);
    throw error;
  }
}

/** Removes a profile nobody has. With people in it, they are moved to another access first. */
export async function deleteProfile(id: number, conn: Queryable): Promise<{ name: string }> {
  try {
    const { rows } = await conn.query("DELETE FROM access_profiles WHERE id = $1 RETURNING name", [id]);
    if (!rows[0]) throw new ProfileError("Perfil não encontrado. Recarregue a página.");
    return { name: String(rows[0].name) };
  } catch (error) {
    if (pgErrorCode(error) === FOREIGN_KEY_VIOLATION) throw new ProfileError("Há pessoas com este perfil: mude o acesso delas em Equipe antes de remover.");
    throw error;
  }
}

import { pgErrorCode } from "@/lib/db/pool";
import type { Queryable } from "@/lib/db/pool";
import { narrowedItems } from "@/lib/auth/permissions";
import { isRole } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class UserError extends Error {}

/** One person of the company, as the directors registered them. */
export type AppUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  /** The screens left to the person inside the profile; `null` is all of the profile's. */
  items: string[] | null;
  /** The profile of the company the person has, or `null` for one of the four types as they are. */
  profileId: number | null;
  profileName: string | null;
  /** The powers of the type the profile gave up; empty without a profile. */
  denied: string[];
  updatedAt: Date;
  /** What happened to the last invitation by e-mail, or `null` when none was tried. */
  invite: { status: "enviado" | "falhou" | "pendente"; detail: string | null; at: Date } | null;
};

export type UserInput = { email: string; name: string; role: Role; items?: string[] | null; /** A profile of the company: then the type and the screens are the profile's. */ profileId?: number | null };

const UNIQUE_VIOLATION = "23505";
/** With a profile of the company, the screens and what was given up come from it; the type is its type of origin. */
const COLUMNS = `users.id, users.email, users.name, users.role, users.active, users.updated_at, users.profile_id, users.invite_status, users.invite_detail, users.invite_at,
  COALESCE((SELECT p.items FROM access_profiles p WHERE p.id = users.profile_id), users.allowed_items) AS allowed_items,
  (SELECT p.name FROM access_profiles p WHERE p.id = users.profile_id) AS profile_name,
  COALESCE((SELECT p.denied FROM access_profiles p WHERE p.id = users.profile_id), '{}') AS denied`;
const EMAIL_SHAPE = /^[^\s@:;,]+@[^\s@:;,]+\.[^\s@:;,]+$/;

const user = (row: Record<string, unknown>): AppUser => {
  if (!isRole(row.role)) throw new Error(`Perfil inválido no banco para ${String(row.email)}.`);
  return {
    id: Number(row.id),
    email: String(row.email),
    name: String(row.name),
    role: row.role,
    active: row.active === true,
    items: (row.allowed_items as string[] | null) ?? null,
    profileId: row.profile_id == null ? null : Number(row.profile_id),
    profileName: row.profile_name == null ? null : String(row.profile_name),
    denied: (row.denied as string[] | null) ?? [],
    updatedAt: row.updated_at as Date,
    invite: row.invite_status == null ? null : { status: row.invite_status as "enviado" | "falhou" | "pendente", detail: row.invite_detail == null ? null : String(row.invite_detail), at: row.invite_at as Date },
  };
};

const normalize = (email: string) => email.trim().toLowerCase();

function check(input: { name: string; role: Role }, who: string): void {
  if (who.trim() === "") throw new Error("Falta dizer quem está alterando o usuário.");
  if (input.name.trim() === "") throw new UserError("Informe o nome.");
  if (!isRole(input.role)) throw new UserError("Escolha um perfil da lista.");
}

/**
 * What goes to the column: `null` when nothing was said or the person keeps
 * every screen of the profile; otherwise the chosen ones the profile has.
 */
function screens(role: Role, items: string[] | null | undefined): string[] | null {
  if (items == null) return null;
  const kept = narrowedItems(role, items);
  if (kept !== null && kept.length === 0) throw new UserError("Marque pelo menos uma tela: sem nenhuma a pessoa não abre nada.");
  return kept;
}

/**
 * The type and the screens to store for a person. With a profile of the
 * company, the type is the profile's type of origin and no screen list is kept
 * on the person: the profile says. Without one, the type chosen and the
 * person's own narrowing of it.
 */
async function accessOf(input: { role: Role; items?: string[] | null; profileId?: number | null }, conn: Queryable): Promise<{ role: Role; items: string[] | null; profileId: number | null }> {
  if (input.profileId == null) return { role: input.role, items: screens(input.role, input.items), profileId: null };
  const { rows } = await conn.query("SELECT base_role FROM access_profiles WHERE id = $1", [input.profileId]);
  if (!rows[0] || !isRole(rows[0].base_role)) throw new UserError("Perfil não encontrado. Recarregue a página.");
  return { role: rows[0].base_role, items: null, profileId: input.profileId };
}

/** Everyone registered in the company, active first, by name. */
export async function listUsers(conn: Queryable): Promise<AppUser[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM users ORDER BY users.active DESC, lower(users.name), users.id`);
  return rows.map(user);
}

/** Who the login asks about: the active user with this e-mail, or `null`. */
export async function findActiveUser(email: string, conn: Queryable): Promise<AppUser | null> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM users WHERE users.email = $1 AND users.active`, [normalize(email)]);
  return rows.length === 0 ? null : user(rows[0]);
}

export async function createUser(input: UserInput, who: string, conn: Queryable): Promise<AppUser> {
  check(input, who);
  const email = normalize(input.email);
  const access = await accessOf(input, conn);
  if (!EMAIL_SHAPE.test(email)) throw new UserError("Informe um e-mail válido (ex.: nome@empresa.com.br).");
  try {
    const { rows } = await conn.query(
      `INSERT INTO users (email, name, role, allowed_items, updated_by, profile_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
      [email, input.name.trim(), access.role, access.items, who, access.profileId],
    );
    return user(rows[0]);
  } catch (error) {
    if (pgErrorCode(error) === UNIQUE_VIOLATION) throw new UserError("Já existe usuário com este e-mail. Altere o que está na lista.");
    throw error;
  }
}

/**
 * Changes name, profile and whether the person still gets in. The e-mail is
 * who the person is and does not change. Nobody takes their own access away:
 * that is how a company ends up with no director able to enter.
 */
export async function updateUser(
  id: number,
  change: { name: string; role: Role; active: boolean; items?: string[] | null; profileId?: number | null },
  who: string,
  conn: Queryable,
): Promise<AppUser> {
  check(change, who);
  const access = await accessOf(change, conn);
  // One statement: the row only changes when it is not the own access being cut.
  const { rows } = await conn.query(
    `WITH target AS (SELECT id, email, role, profile_id FROM users WHERE id = $1),
          changed AS (
            UPDATE users u
               SET name = $2, role = $3, active = $4, allowed_items = $7, profile_id = $8, updated_at = now(), updated_by = $5
              FROM target
             WHERE u.id = target.id
               AND NOT (target.email = $6 AND (NOT $4 OR target.role <> $3 OR $7::text[] IS NOT NULL OR target.profile_id IS DISTINCT FROM $8::integer))
             RETURNING u.id
          )
     SELECT (SELECT count(*)::int FROM target) AS found, (SELECT id FROM changed) AS id`,
    [id, change.name.trim(), access.role, change.active, who, normalize(who), access.items, access.profileId],
  );
  if (Number(rows[0].found) === 0) throw new UserError("Usuário não encontrado.");
  if (rows[0].id === null) throw new UserError("Você não pode mudar o próprio perfil nem desativar o próprio acesso, nem tirar telas de si. Peça a outra pessoa da diretoria.");
  const saved = await conn.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return user(saved.rows[0]);
}

/**
 * Removes a person from the company's register: they no longer get in. Orders
 * and records keep the e-mail they were written with. Nobody removes themselves.
 */
export async function deleteUser(id: number, who: string, conn: Queryable): Promise<{ email: string }> {
  if (who.trim() === "") throw new Error("Falta dizer quem está removendo o usuário.");
  const { rows } = await conn.query(
    `WITH target AS (SELECT id, email FROM users WHERE id = $1),
          removed AS (DELETE FROM users u USING target WHERE u.id = target.id AND target.email <> $2 RETURNING u.email)
     SELECT (SELECT count(*)::int FROM target) AS found, (SELECT email FROM removed) AS email`,
    [id, normalize(who)],
  );
  if (Number(rows[0].found) === 0) throw new UserError("Usuário não encontrado.");
  if (rows[0].email === null) throw new UserError("Você não pode remover o próprio cadastro. Peça a outra pessoa da diretoria.");
  return { email: String(rows[0].email) };
}

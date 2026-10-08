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
  updatedAt: Date;
};

export type UserInput = { email: string; name: string; role: Role; items?: string[] | null };

const UNIQUE_VIOLATION = "23505";
const COLUMNS = "id, email, name, role, active, allowed_items, updated_at";
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
    updatedAt: row.updated_at as Date,
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

/** Everyone registered in the company, active first, by name. */
export async function listUsers(conn: Queryable): Promise<AppUser[]> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM users ORDER BY active DESC, lower(name), id`);
  return rows.map(user);
}

/** Who the login asks about: the active user with this e-mail, or `null`. */
export async function findActiveUser(email: string, conn: Queryable): Promise<AppUser | null> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM users WHERE email = $1 AND active`, [normalize(email)]);
  return rows.length === 0 ? null : user(rows[0]);
}

export async function createUser(input: UserInput, who: string, conn: Queryable): Promise<AppUser> {
  check(input, who);
  const email = normalize(input.email);
  if (!EMAIL_SHAPE.test(email)) throw new UserError("Informe um e-mail válido (ex.: nome@empresa.com.br).");
  try {
    const { rows } = await conn.query(
      `INSERT INTO users (email, name, role, allowed_items, updated_by) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [email, input.name.trim(), input.role, screens(input.role, input.items), who],
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
  change: { name: string; role: Role; active: boolean; items?: string[] | null },
  who: string,
  conn: Queryable,
): Promise<AppUser> {
  check(change, who);
  // One statement: the row only changes when it is not the own access being cut.
  const { rows } = await conn.query(
    `WITH target AS (SELECT id, email, role FROM users WHERE id = $1),
          changed AS (
            UPDATE users u
               SET name = $2, role = $3, active = $4, allowed_items = $7, updated_at = now(), updated_by = $5
              FROM target
             WHERE u.id = target.id AND NOT (target.email = $6 AND (NOT $4 OR target.role <> $3 OR $7::text[] IS NOT NULL))
             RETURNING u.id, u.email, u.name, u.role, u.active, u.allowed_items, u.updated_at
          )
     SELECT (SELECT count(*)::int FROM target) AS found, changed.* FROM (SELECT 1) one LEFT JOIN changed ON true`,
    [id, change.name.trim(), change.role, change.active, who, normalize(who), screens(change.role, change.items)],
  );
  if (Number(rows[0].found) === 0) throw new UserError("Usuário não encontrado.");
  if (rows[0].id === null) throw new UserError("Você não pode mudar o próprio perfil nem desativar o próprio acesso, nem tirar telas de si. Peça a outra pessoa da diretoria.");
  return user(rows[0]);
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

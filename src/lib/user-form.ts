import { isRole, ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";

export type UserField = "email" | "name" | "role" | "active";

export type ParsedUser =
  | { ok: true; user: { email: string; name: string; role: Role; active: boolean } }
  | { ok: false; errors: string[] };

const EMAIL_SHAPE = /^[^\s@:;,]+@[^\s@:;,]+\.[^\s@:;,]+$/;

/**
 * Reads the user form. With `withEmail` false (changing someone already
 * registered) the e-mail is not read: it does not change. An unchecked box
 * does not come in the form, so absent `active` is "inactive".
 */
export function parseUserForm(read: (key: UserField) => string | null, { withEmail }: { withEmail: boolean }): ParsedUser {
  const errors: string[] = [];
  const text = (key: UserField) => (read(key) ?? "").trim();

  const email = text("email").toLowerCase();
  if (withEmail && !EMAIL_SHAPE.test(email)) errors.push('"E-mail": informe um e-mail válido (ex.: nome@empresa.com.br).');
  const name = text("name");
  if (name === "") errors.push('"Nome": informe o nome da pessoa.');
  const role = text("role");
  if (!isRole(role)) errors.push(`"Perfil": escolha um da lista (${ROLES.length} perfis).`);

  if (errors.length > 0 || !isRole(role)) return { ok: false, errors };
  return { ok: true, user: { email, name, role, active: text("active") !== "" } };
}

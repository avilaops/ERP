import { isRole, ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";

export type DirectoryUser = {
  email: string;
  name: string;
  role: Role;
};

/**
 * Who may use the ERP and with which profile. Today it is read from `ERP_USERS`;
 * the `User` table replaces this implementation when the database arrives.
 */
export interface UserDirectory {
  findByEmail(email: string): Promise<DirectoryUser | null>;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** One `@`, and none of the characters ERP_USERS itself uses as separators. */
const EMAIL_SHAPE = /^[^\s@:;,]+@[^\s@:;,]+$/;

/**
 * Parses `email:ROLE,email:ROLE`. A malformed entry, unknown profile or
 * repeated e-mail throws: silently dropping a line would silently lock someone
 * out, or worse, leave a typo unnoticed.
 */
export function parseErpUsers(raw: string | undefined): DirectoryUser[] {
  const users: DirectoryUser[] = [];
  const seen = new Set<string>();

  for (const entry of (raw ?? "").split(",")) {
    if (entry.trim() === "") continue;

    const separator = entry.lastIndexOf(":");
    const email = separator === -1 ? "" : normalizeEmail(entry.slice(0, separator));
    const role = separator === -1 ? "" : entry.slice(separator + 1).trim();

    if (!EMAIL_SHAPE.test(email)) {
      throw new Error(`ERP_USERS: entrada inválida "${entry.trim()}" (esperado email:PERFIL)`);
    }
    if (!isRole(role)) {
      throw new Error(
        `ERP_USERS: perfil desconhecido "${role}" para ${email} (use ${ROLES.join(", ")})`,
      );
    }
    if (seen.has(email)) {
      throw new Error(`ERP_USERS: e-mail repetido ${email}`);
    }

    seen.add(email);
    // ERP_USERS carries no display name; the session prefers the SSO name.
    users.push({ email, name: email, role });
  }

  return users;
}

export function createEnvDirectory(raw: string | undefined): UserDirectory {
  const byEmail = new Map(parseErpUsers(raw).map((user) => [user.email, user]));
  return {
    async findByEmail(email) {
      return byEmail.get(normalizeEmail(email)) ?? null;
    },
  };
}

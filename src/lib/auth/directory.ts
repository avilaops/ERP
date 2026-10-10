import { isRole, ROLES } from "@/lib/auth/roles";
import type { Role } from "@/lib/auth/roles";
import type { Tenant } from "@/lib/auth/tenants";

/** One person in one company, with the profile they have there. */
export type DirectoryUser = {
  email: string;
  name: string;
  role: Role;
  tenant: Tenant;
  /** The screens left to this person inside the profile, when the company narrowed them. */
  items?: string[] | null;
  /** From the profile of the company, when the person has one: the powers given up and its name. */
  denied?: string[];
  profile?: string | null;
  /** The modules the company turned off for everyone: nobody of it opens their screens. */
  off?: readonly string[];
};

/**
 * Who may use the ERP and with which profile. Today it is read from `ERP_USERS`;
 * the `User` table replaces this implementation when the database arrives.
 */
export interface UserDirectory {
  /** Every company the e-mail belongs to, in the order of the configuration. */
  findMemberships(email: string): Promise<DirectoryUser[]>;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** One `@`, and none of the characters ERP_USERS itself uses as separators. */
const EMAIL_SHAPE = /^[^\s@:;,]+@[^\s@:;,]+$/;

/**
 * Parses `email:ROLE@empresa,email:ROLE@empresa`. With a single company
 * configured the `@empresa` may be left out. The same e-mail may be in several
 * companies, once in each. A malformed entry, unknown profile, unknown company
 * or repeated entry throws: silently dropping a line would silently lock someone
 * out, or worse, leave a typo unnoticed.
 */
export function parseErpUsers(raw: string | undefined, tenants: Tenant[]): DirectoryUser[] {
  const users: DirectoryUser[] = [];
  const seen = new Set<string>();

  for (const entry of (raw ?? "").split(",")) {
    if (entry.trim() === "") continue;

    const separator = entry.lastIndexOf(":");
    const email = separator === -1 ? "" : normalizeEmail(entry.slice(0, separator));
    const [role = "", slug, ...extra] = separator === -1 ? [] : entry.slice(separator + 1).trim().split("@");

    if (!EMAIL_SHAPE.test(email) || extra.length > 0) {
      throw new Error(`ERP_USERS: entrada inválida "${entry.trim()}" (esperado email:PERFIL@empresa)`);
    }
    if (!isRole(role)) {
      throw new Error(
        `ERP_USERS: perfil desconhecido "${role}" para ${email} (use ${ROLES.join(", ")})`,
      );
    }
    if (slug === undefined && tenants.length !== 1) {
      throw new Error(`ERP_USERS: falta a empresa de ${email} (use email:PERFIL@empresa)`);
    }
    const tenant = slug === undefined ? tenants[0] : tenants.find((candidate) => candidate.slug === slug.trim());
    if (!tenant) throw new Error(`ERP_USERS: empresa desconhecida "${slug}" para ${email}`);

    const key = `${email}@${tenant.slug}`;
    if (seen.has(key)) throw new Error(`ERP_USERS: e-mail repetido ${email} em ${tenant.slug}`);
    seen.add(key);
    // ERP_USERS carries no display name; the session prefers the SSO name.
    users.push({ email, name: email, role, tenant });
  }

  return users;
}

/** What the company's own register says about an e-mail: the active user, or `null`. */
export type RegisteredLookup = (tenant: Tenant, email: string) => Promise<{ name: string; role: Role; items?: string[] | null; denied?: string[]; profileName?: string | null } | null>;

/**
 * The configuration and the register of each company, together. `ERP_USERS` is
 * the access of who installs and supports the system and comes first; everyone
 * else is who the directors of the company registered on the screen. A company
 * whose register cannot be read lets nobody in through it: the failure is
 * reported and the rest goes on.
 */
export function createCombinedDirectory(
  configured: UserDirectory,
  tenants: Tenant[],
  lookup: RegisteredLookup,
  report: (tenant: Tenant, error: unknown) => void = () => {},
): UserDirectory {
  return {
    async findMemberships(email) {
      const wanted = normalizeEmail(email);
      const fixed = await configured.findMemberships(wanted);
      const memberships: DirectoryUser[] = [];
      for (const tenant of tenants) {
        const own = fixed.find((user) => user.tenant.slug === tenant.slug);
        if (own) {
          memberships.push(own);
          continue;
        }
        try {
          const registered = await lookup(tenant, wanted);
          if (registered) memberships.push({ email: wanted, name: registered.name, role: registered.role, tenant, items: registered.items ?? null, denied: registered.denied ?? [], profile: registered.profileName ?? null });
        } catch (error) {
          report(tenant, error);
        }
      }
      return memberships;
    },
  };
}

export function createEnvDirectory(raw: string | undefined, tenants: Tenant[]): UserDirectory {
  const users = parseErpUsers(raw, tenants);
  return {
    async findMemberships(email) {
      const wanted = normalizeEmail(email);
      return users.filter((user) => user.email === wanted);
    },
  };
}

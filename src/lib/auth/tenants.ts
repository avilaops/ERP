/**
 * The companies that use this ERP, all on the same address. Each one has its own
 * schema in the database and its own users. Today they are read from
 * `ERP_TENANTS`; a table replaces this when companies are managed on screen.
 */
export type Tenant = {
  /** Short name used in the configuration and in the schema of the database (`tenant_<slug>`). */
  slug: string;
  /** Name shown on screen. */
  name: string;
};

/** Lower-case letters, digits and underscore, starting with a letter: it becomes part of a schema name. */
export const TENANT_SLUG = /^[a-z][a-z0-9_]{1,30}$/;

/**
 * Parses `slug:Nome;slug:Nome`. A malformed entry or a repeated slug throws:
 * guessing here would send someone to another company's data.
 */
export function parseTenants(raw: string | undefined): Tenant[] {
  const tenants: Tenant[] = [];
  for (const entry of (raw ?? "").split(";")) {
    if (entry.trim() === "") continue;
    const [slug = "", name = "", ...extra] = entry.split(":").map((part) => part.trim());
    if (extra.length > 0 || name === "") {
      throw new Error(`ERP_TENANTS: entrada inválida "${entry.trim()}" (esperado identificador:Nome)`);
    }
    if (!TENANT_SLUG.test(slug)) {
      throw new Error(`ERP_TENANTS: identificador inválido "${slug}" (minúsculas, dígitos e _, começando por letra)`);
    }
    if (tenants.some((tenant) => tenant.slug === slug)) throw new Error(`ERP_TENANTS: empresa repetida ${slug}`);
    tenants.push({ slug, name });
  }
  return tenants;
}

/**
 * Which of a person's companies a request is for: the one last chosen
 * (`preferred`), when the person still belongs to it, or else the first. The
 * choice never gives access to a company the person is not in.
 */
export function chooseMembership<Member extends { tenant: Tenant }>(memberships: Member[], preferred?: string): Member | null {
  return memberships.find((member) => member.tenant.slug === preferred) ?? memberships[0] ?? null;
}

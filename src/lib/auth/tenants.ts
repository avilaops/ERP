/**
 * The companies that use this ERP. Each one has its own schema in the database,
 * its own users and, optionally, its own domain. Today they are read from
 * `ERP_TENANTS`; a table replaces this when companies are managed on screen.
 */
export type Tenant = {
  /** Short name used in the configuration and in the schema of the database (`tenant_<slug>`). */
  slug: string;
  /** Name shown on screen. */
  name: string;
  /** The company's own domains. On one of them only this company is reachable. */
  hosts: string[];
};

/** Lower-case letters, digits and underscore, starting with a letter: it becomes part of a schema name. */
export const TENANT_SLUG = /^[a-z][a-z0-9_]{1,30}$/;
const HOST_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** `"Erp.Exemplo.com.br:443"` → `"erp.exemplo.com.br"`. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
}

/**
 * Parses `slug:Nome[:host,host];slug:Nome`. A malformed entry, a repeated slug
 * or a host claimed by two companies throws: guessing here would send someone
 * to another company's data.
 */
export function parseTenants(raw: string | undefined): Tenant[] {
  const tenants: Tenant[] = [];
  const hosts = new Set<string>();

  for (const entry of (raw ?? "").split(";")) {
    if (entry.trim() === "") continue;
    const [slug = "", name = "", hostList = "", ...extra] = entry.split(":").map((part) => part.trim());
    if (extra.length > 0 || name === "") {
      throw new Error(`ERP_TENANTS: entrada inválida "${entry.trim()}" (esperado slug:Nome ou slug:Nome:dominio1,dominio2)`);
    }
    if (!TENANT_SLUG.test(slug)) {
      throw new Error(`ERP_TENANTS: identificador inválido "${slug}" (minúsculas, dígitos e _, começando por letra)`);
    }
    if (tenants.some((tenant) => tenant.slug === slug)) throw new Error(`ERP_TENANTS: empresa repetida ${slug}`);

    const own = hostList === "" ? [] : hostList.split(",").map((host) => normalizeHost(host));
    for (const host of own) {
      if (!HOST_SHAPE.test(host)) throw new Error(`ERP_TENANTS: domínio inválido "${host}" em ${slug}`);
      if (hosts.has(host)) throw new Error(`ERP_TENANTS: domínio ${host} em mais de uma empresa`);
      hosts.add(host);
    }
    tenants.push({ slug, name, hosts: own });
  }
  return tenants;
}

/** The company that owns this domain, or `null` on the shared address. */
export function tenantForHost(tenants: Tenant[], host: string | null | undefined): Tenant | null {
  const wanted = normalizeHost(host);
  return wanted === "" ? null : (tenants.find((tenant) => tenant.hosts.includes(wanted)) ?? null);
}

/**
 * Which of a person's companies a request is for. On a company's own domain it
 * is that company or nothing: being a user of another one gives no access
 * there. On the shared address it is the one last chosen (`preferred`), when
 * the person still belongs to it, or else the first.
 */
export function chooseMembership<Member extends { tenant: Tenant }>(
  memberships: Member[],
  { hostTenant, preferred }: { hostTenant: Tenant | null; preferred?: string },
): Member | null {
  if (hostTenant) return memberships.find((member) => member.tenant.slug === hostTenant.slug) ?? null;
  return memberships.find((member) => member.tenant.slug === preferred) ?? memberships[0] ?? null;
}

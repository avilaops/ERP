import pg from "pg";
import type { Tenant } from "@/lib/auth/tenants";
import { TENANT_SLUG } from "@/lib/auth/tenants";
import { databaseUrl, schemaStatements, tenantSchema } from "@/lib/db/config";
import { migrate } from "@/lib/db/migrate";
import type { MigrationClient } from "@/lib/db/migrate";
import type { Queryable } from "@/lib/db/pool";
import { CONTROL_SCHEMA } from "@/lib/db/control-schema";

/**
 * The register of the companies that signed up on the site. It belongs to the
 * system, not to a company: it says who exists, whose it is and how the
 * subscription stands. Everything a company does stays in its own schema.
 *
 * The companies of `ERP_TENANTS` are not here: they keep coming from the
 * configuration, and nothing in this file can take access away from them.
 */
export { CONTROL_SCHEMA } from "@/lib/db/control-schema";

export const COMPANY_STATUSES = ["AGUARDANDO_CARTAO", "EM_TESTE", "ATIVA", "INADIMPLENTE", "CANCELADA"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

/** With these the company's people get in. The others exist but are closed. */
export const OPEN_STATUSES: readonly CompanyStatus[] = ["EM_TESTE", "ATIVA"];

export type Company = {
  slug: string;
  name: string;
  ownerEmail: string;
  ownerName: string;
  status: CompanyStatus;
  monthlyCents: number;
  trialEndsAt: Date | null;
  mpPreapprovalId: string | null;
  mpInitPoint: string | null;
  lastPaymentAt: Date | null;
  provisionedAt: Date | null;
};

export class CompanyError extends Error {}

declare global {
  var __ERP_CONTROL_POOL__: pg.Pool | undefined;
}

/** The connection of the register. Created on the first query, like the companies' pools. */
export function controlDb(): Queryable {
  return (globalThis.__ERP_CONTROL_POOL__ ??= new pg.Pool({
    connectionString: databaseUrl(process.env),
    max: 3,
    options: `-c search_path=${CONTROL_SCHEMA}`,
  }));
}

export async function closeControlPool(): Promise<void> {
  const pool = globalThis.__ERP_CONTROL_POOL__;
  globalThis.__ERP_CONTROL_POOL__ = undefined;
  await pool?.end();
}

const COLUMNS = `slug, name, owner_email, owner_name, status, monthly_cents, trial_ends_at, mp_preapproval_id, mp_init_point, last_payment_at, provisioned_at`;

function company(row: Record<string, unknown>): Company {
  return {
    slug: String(row.slug),
    name: String(row.name),
    ownerEmail: String(row.owner_email),
    ownerName: String(row.owner_name),
    status: row.status as CompanyStatus,
    monthlyCents: Number(row.monthly_cents),
    trialEndsAt: (row.trial_ends_at as Date | null) ?? null,
    mpPreapprovalId: (row.mp_preapproval_id as string | null) ?? null,
    mpInitPoint: (row.mp_init_point as string | null) ?? null,
    lastPaymentAt: (row.last_payment_at as Date | null) ?? null,
    provisionedAt: (row.provisioned_at as Date | null) ?? null,
  };
}

const normalize = (email: string) => email.trim().toLowerCase();

export async function findCompany(slug: string, conn: Queryable): Promise<Company | null> {
  const { rows } = await conn.query(`SELECT ${COLUMNS} FROM companies WHERE slug = $1`, [slug]);
  return rows.length === 0 ? null : company(rows[0]);
}

/**
 * The signed-up companies an e-mail gets into: open (in trial or paid up) and
 * with their schema already created. One query, whatever the number of
 * companies in the system.
 */
export async function openCompaniesOf(email: string, conn: Queryable): Promise<Tenant[]> {
  const { rows } = await conn.query(
    `SELECT c.slug, c.name FROM members m JOIN companies c ON c.slug = m.slug
      WHERE m.email = $1 AND c.status = ANY($2::text[]) AND c.provisioned_at IS NOT NULL
      ORDER BY c.created_at, c.slug`,
    [normalize(email), OPEN_STATUSES],
  );
  return rows.map((row) => ({ slug: String(row.slug), name: String(row.name) }));
}

/** Every signed-up company whose schema exists: what the migrations have to reach. */
export async function provisionedCompanies(conn: Queryable): Promise<Tenant[]> {
  const { rows } = await conn.query("SELECT slug, name FROM companies WHERE provisioned_at IS NOT NULL ORDER BY created_at, slug");
  return rows.map((row) => ({ slug: String(row.slug), name: String(row.name) }));
}

export type NewCompany = { slug: string; name: string; ownerEmail: string; ownerName: string; monthlyCents: number };

/**
 * Records a company that has just signed up, still closed: it opens when the
 * card is registered. `reserved` are the identifiers of `ERP_TENANTS`, which a
 * signed-up company can never take (it would land on that company's schema).
 */
export async function createCompany(input: NewCompany, reserved: readonly string[], conn: Queryable): Promise<Company> {
  const slug = input.slug.trim();
  if (!TENANT_SLUG.test(slug)) throw new CompanyError("Identificador inválido: use minúsculas, dígitos e _, começando por letra.");
  if (reserved.includes(slug)) throw new CompanyError("Este identificador já está em uso.");
  if (input.name.trim() === "" || input.ownerName.trim() === "") throw new CompanyError("Informe o nome da empresa e o seu nome.");
  if (!Number.isInteger(input.monthlyCents) || input.monthlyCents <= 0) throw new CompanyError("Mensalidade inválida.");
  try {
    const { rows } = await conn.query(
      `INSERT INTO companies (slug, name, owner_email, owner_name, status, monthly_cents)
       VALUES ($1, $2, $3, $4, 'AGUARDANDO_CARTAO', $5) RETURNING ${COLUMNS}`,
      [slug, input.name.trim(), normalize(input.ownerEmail), input.ownerName.trim(), input.monthlyCents],
    );
    return company(rows[0]);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new CompanyError("Este identificador já está em uso.");
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23514") {
      throw new CompanyError("Informe um e-mail válido (ex.: nome@empresa.com.br).");
    }
    throw error;
  }
}

/** What provisioning needs: one connection, because the migrations run in transactions and move the search_path. */
export type ProvisionClient = MigrationClient & Queryable;

/**
 * Creates the schema of a signed-up company, applies every migration to it and
 * registers the owner as its first user, a director. Safe to run again: a
 * second run finds everything in place and changes nothing.
 *
 * `control` is the schema of the register (a parameter so the tests use one of
 * their own). The connection is left looking at it.
 */
export async function provisionCompany(slug: string, client: ProvisionClient, migrationsDir: string, control: string = CONTROL_SCHEMA): Promise<Company> {
  const register = schemaStatements(control);
  await client.query(register.use);
  const found = await findCompany(slug, client);
  if (!found) throw new CompanyError(`Empresa "${slug}" não está cadastrada.`);

  // The schema name comes from a checked identifier (tenantSchema), and becomes SQL only in schemaStatements.
  const own = schemaStatements(tenantSchema(found.slug));
  try {
    await client.query(own.create);
    await client.query(own.use);
    await migrate(client, migrationsDir);
    await client.query(
      "INSERT INTO users (email, name, role, updated_by) VALUES ($1, $2, 'DIRETORIA', $3) ON CONFLICT (email) DO NOTHING",
      [found.ownerEmail, found.ownerName, "cadastro pelo site"],
    );
  } finally {
    await client.query(register.use);
  }
  await client.query("INSERT INTO members (email, slug) VALUES ($1, $2) ON CONFLICT DO NOTHING", [found.ownerEmail, found.slug]);
  const { rows } = await client.query(
    `UPDATE companies SET provisioned_at = coalesce(provisioned_at, now()), updated_at = now() WHERE slug = $1 RETURNING ${COLUMNS}`,
    [found.slug],
  );
  return company(rows[0]);
}

/**
 * Keeps the login index in step with a company's own register of users: called
 * when a signed-up company adds, reactivates, deactivates or removes someone.
 */
export async function syncMember(slug: string, email: string, active: boolean, conn: Queryable): Promise<void> {
  if (active) {
    await conn.query(
      "INSERT INTO members (email, slug) SELECT $1, slug FROM companies WHERE slug = $2 ON CONFLICT DO NOTHING",
      [normalize(email), slug],
    );
  } else {
    await conn.query("DELETE FROM members WHERE email = $1 AND slug = $2", [normalize(email), slug]);
  }
}

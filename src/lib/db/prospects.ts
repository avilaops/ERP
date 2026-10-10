import { CnpjError } from "@/lib/cnpj";
import type { CompanyRecord } from "@/lib/cnpj";
import { isValidCnpj, normalizeDocument } from "@/lib/customer";
import { createOpportunity } from "@/lib/db/funnel";
import type { Queryable } from "@/lib/db/pool";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class ProspectError extends Error {}

export type Prospect = {
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  registryStatus: string;
  activity: string | null;
  size: string | null;
  openedOn: string | null;
  city: string | null;
  uf: string | null;
  phone: string | null;
  email: string | null;
  status: "novo" | "descartado" | "virou";
  opportunityId: number | null;
  /** Already in the register of customers: it is not a prospect any more. */
  isCustomer: boolean;
};

const COLUMNS = `p.cnpj, p.legal_name, p.trade_name, p.registry_status, p.activity, p.size, p.opened_on::text AS opened_on, p.city, p.uf, p.phone, p.email, p.status, p.opportunity_id,
  EXISTS (SELECT 1 FROM customers c WHERE c.document = p.cnpj) AS is_customer`;

const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
const toProspect = (row: Record<string, unknown>): Prospect => ({
  cnpj: String(row.cnpj), legalName: String(row.legal_name), tradeName: text(row.trade_name), registryStatus: String(row.registry_status), activity: text(row.activity), size: text(row.size),
  openedOn: text(row.opened_on), city: text(row.city), uf: text(row.uf), phone: text(row.phone), email: text(row.email), status: row.status as Prospect["status"],
  opportunityId: row.opportunity_id === null ? null : Number(row.opportunity_id), isCustomer: row.is_customer === true,
});

export type ProspectFilter = { status: Prospect["status"]; search: string; uf: string | null; city: string };

/** The companies of one state of work, filtered by what was typed, the newest first. At most 500: beyond that, narrow the search. */
export async function listProspects(filter: ProspectFilter, conn: Queryable): Promise<Prospect[]> {
  const search = filter.search.trim().toLowerCase();
  const city = filter.city.trim().toLowerCase();
  const { rows } = await conn.query(
    `SELECT ${COLUMNS} FROM prospects p
      WHERE p.status = $1 AND ($2 = '' OR lower(p.legal_name) LIKE '%' || $2 || '%' OR lower(COALESCE(p.trade_name, '')) LIKE '%' || $2 || '%' OR lower(COALESCE(p.activity, '')) LIKE '%' || $2 || '%' OR p.cnpj LIKE $2 || '%')
        AND ($3::text IS NULL OR p.uf = $3) AND ($4 = '' OR lower(COALESCE(p.city, '')) LIKE '%' || $4 || '%')
      ORDER BY p.loaded_at DESC, p.cnpj LIMIT 500`,
    [filter.status, search.replace(/[%_\\]/g, ""), filter.uf, city.replace(/[%_\\]/g, "")],
  );
  return rows.map(toProspect);
}

/** How many companies are in each state of work, and the states (UF) there are to filter by. */
export async function prospectTotals(conn: Queryable): Promise<{ novo: number; descartado: number; virou: number; ufs: string[] }> {
  const { rows } = await conn.query("SELECT status, count(*) AS total FROM prospects GROUP BY status");
  const of = (status: string) => Number(rows.find((row) => row.status === status)?.total ?? 0);
  const ufs = await conn.query("SELECT DISTINCT uf FROM prospects WHERE uf IS NOT NULL ORDER BY uf");
  return { novo: of("novo"), descartado: of("descartado"), virou: of("virou"), ufs: ufs.rows.map((row) => String(row.uf)) };
}

/** How many CNPJs one import takes: each is one question to the public register. */
export const IMPORT_LIMIT = 20;

export type ImportResult = { cnpj: string; outcome: "novo" | "atualizado" | "recusado"; detail: string };

/**
 * Brings companies in by their CNPJ: each is looked up in the public register
 * of the Receita and kept as it answered. One already here has its data
 * refreshed and keeps its state of work. A CNPJ that is wrong, unknown or that
 * the register did not answer for is told apart, and the others go on.
 */
export async function importProspects(typed: string, who: string, lookup: (cnpj: string) => Promise<CompanyRecord>, conn: Queryable): Promise<ImportResult[]> {
  const cnpjs = [...new Set(typed.split(/[\s,;]+/).map((part) => normalizeDocument(part)).filter((part) => part !== ""))];
  if (cnpjs.length === 0) throw new ProspectError("Cole ao menos um CNPJ.");
  if (cnpjs.length > IMPORT_LIMIT) throw new ProspectError(`No máximo ${IMPORT_LIMIT} CNPJs por vez. Você colou ${cnpjs.length}.`);
  const results: ImportResult[] = [];
  for (const cnpj of cnpjs) {
    if (cnpj.length !== 14 || !isValidCnpj(cnpj)) {
      results.push({ cnpj, outcome: "recusado", detail: "CNPJ inválido." });
      continue;
    }
    let record: CompanyRecord;
    try {
      record = await lookup(cnpj);
    } catch (error) {
      if (!(error instanceof CnpjError)) throw error;
      results.push({ cnpj, outcome: "recusado", detail: error.message });
      continue;
    }
    const { rows } = await conn.query(
      `INSERT INTO prospects (cnpj, legal_name, trade_name, registry_status, activity, size, opened_on, street, street_number, district, city, uf, cep, phone, email, loaded_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
       ON CONFLICT (cnpj) DO UPDATE SET legal_name = EXCLUDED.legal_name, trade_name = EXCLUDED.trade_name, registry_status = EXCLUDED.registry_status, activity = EXCLUDED.activity, size = EXCLUDED.size,
         opened_on = EXCLUDED.opened_on, street = EXCLUDED.street, street_number = EXCLUDED.street_number, district = EXCLUDED.district, city = EXCLUDED.city, uf = EXCLUDED.uf, cep = EXCLUDED.cep,
         phone = EXCLUDED.phone, email = EXCLUDED.email, updated_at = now(), updated_by = EXCLUDED.updated_by
       RETURNING (xmax = 0) AS created`,
      [record.cnpj, record.legalName, record.tradeName, record.status, record.activity, record.size, record.openedOn, record.street, record.number, record.district, record.city, record.uf, record.cep, record.phone, record.email, who],
    );
    results.push({ cnpj, outcome: rows[0].created ? "novo" : "atualizado", detail: record.tradeName ?? record.legalName });
  }
  return results;
}

const NOT_FOUND = "Empresa não encontrada na lista. Recarregue a página.";

/**
 * Turns a company of the list into an opportunity of who asks, in the first
 * stage of the funnel, with what the register said about it. A company that
 * is already a customer goes in as that customer. One that already became an
 * opportunity does not become a second one.
 */
export async function convertProspect(cnpj: string, owner: { email: string; name: string }, conn: Queryable): Promise<number> {
  const taken = await conn.query(
    `SELECT p.cnpj, p.legal_name, p.trade_name, p.activity, p.city, p.uf, p.phone, p.email, p.registry_status, (SELECT c.id FROM customers c WHERE c.document = p.cnpj) AS customer_id
       FROM prospects p WHERE p.cnpj = $1 AND p.status <> 'virou'`,
    [cnpj],
  );
  const row = taken.rows[0];
  if (!row) {
    const exists = await conn.query("SELECT opportunity_id FROM prospects WHERE cnpj = $1", [cnpj]);
    throw new ProspectError(exists.rows[0] ? "Esta empresa já virou oportunidade." : NOT_FOUND);
  }
  const name = String(row.trade_name ?? row.legal_name);
  const place = [row.city, row.uf].filter(Boolean).join("/");
  const id = await createOpportunity(
    {
      title: `Prospecção: ${name}`.slice(0, 120), customerId: row.customer_id === null ? null : Number(row.customer_id), company: name.slice(0, 120), contactName: null, phone: text(row.phone), email: text(row.email),
      source: "Prospecção", estimatedValue: null,
      notes: [`CNPJ ${String(row.cnpj).replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5")} · ${row.legal_name}`, `Situação na Receita: ${row.registry_status}`, row.activity, place].filter(Boolean).join("\n"),
    },
    owner,
    conn,
  );
  const { rows } = await conn.query("UPDATE prospects SET status = 'virou', opportunity_id = $2, updated_at = now(), updated_by = $3 WHERE cnpj = $1 AND status <> 'virou' RETURNING cnpj", [cnpj, id, owner.email]);
  // Two people at the same moment: the second opportunity is taken back, the first stays.
  if (rows.length === 0) {
    await conn.query("WITH gone AS (DELETE FROM opportunity_moves WHERE opportunity_id = $1) DELETE FROM opportunities WHERE id = $1", [id]);
    throw new ProspectError("Esta empresa já virou oportunidade.");
  }
  return id;
}

/** Sets a company aside as of no interest, or brings it back to the list. One that became an opportunity is not touched. */
export async function setProspectDiscarded(cnpj: string, discarded: boolean, who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("UPDATE prospects SET status = $2, updated_at = now(), updated_by = $3 WHERE cnpj = $1 AND status <> 'virou' RETURNING cnpj", [cnpj, discarded ? "descartado" : "novo", who]);
  if (rows.length === 0) throw new ProspectError(NOT_FOUND);
}

/** Removes a company from the list. The opportunity it may have become stays in the funnel. */
export async function deleteProspect(cnpj: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("DELETE FROM prospects WHERE cnpj = $1 RETURNING cnpj", [cnpj]);
  if (rows.length === 0) throw new ProspectError(NOT_FOUND);
}

import type { Queryable } from "@/lib/db/pool";
import { codeTable, companyOf, establishmentOf, listMonths, RECEITA_SHARE, ReceitaError, zipLines } from "@/lib/prospect/receita";
import type { Establishment } from "@/lib/prospect/receita";
import { UFS } from "@/lib/pricing/states";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class ProspectLoadError extends Error {}

export type ProspectFilters = { cnaes: string[]; ufs: string[] };

export async function loadProspectFilters(conn: Queryable): Promise<ProspectFilters> {
  const { rows } = await conn.query("SELECT cnaes, ufs FROM prospect_filters");
  return { cnaes: (rows[0]?.cnaes as string[] | undefined) ?? [], ufs: (rows[0]?.ufs as string[] | undefined) ?? [] };
}

/** How many activities one cut may name. More than this is no cut any more. */
export const MAX_CNAES = 30;

/** Saves which activities (CNAE, with or without punctuation) and which states the company wants to bring. */
export async function saveProspectFilters(input: { cnaes: string; ufs: string[] }, who: string, conn: Queryable): Promise<ProspectFilters> {
  const typed = input.cnaes.split(/[\s,;]+/).map((code) => code.replace(/[.\-/]/g, "")).filter((code) => code !== "");
  const cnaes = [...new Set(typed)];
  const ufs = [...new Set(input.ufs.map((uf) => uf.trim().toUpperCase()).filter((uf) => uf !== ""))].sort();
  const problems: string[] = [];
  const wrong = cnaes.filter((code) => !/^\d{7}$/.test(code));
  if (wrong.length > 0) problems.push(`CNAE tem 7 dígitos, como 9313-1/00. Não entendi: ${wrong.slice(0, 5).join(", ")}.`);
  if (cnaes.length > MAX_CNAES) problems.push(`No máximo ${MAX_CNAES} atividades.`);
  if (ufs.some((uf) => !(UFS as readonly string[]).includes(uf))) problems.push("Estado inválido.");
  if (problems.length > 0) throw new ProspectLoadError(problems.join(" "));
  await conn.query("UPDATE prospect_filters SET cnaes = $1, ufs = $2, updated_at = now(), updated_by = $3", [cnaes, ufs, who]);
  return { cnaes, ufs };
}

export type ProspectLoad = { id: number; status: "pedida" | "rodando" | "concluida" | "falhou"; cnaes: string[]; ufs: string[]; month: string | null; step: number; readRows: number; keptRows: number; detail: string | null; requestedAt: Date; requestedBy: string; finishedAt: Date | null };

export async function listProspectLoads(conn: Queryable): Promise<ProspectLoad[]> {
  const { rows } = await conn.query("SELECT id, status, cnaes, ufs, month, step, read_rows, kept_rows, detail, requested_at, requested_by, finished_at FROM prospect_loads ORDER BY id DESC LIMIT 5");
  return rows.map((row) => ({
    id: Number(row.id), status: row.status as ProspectLoad["status"], cnaes: row.cnaes as string[], ufs: row.ufs as string[], month: row.month === null ? null : String(row.month), step: Number(row.step), readRows: Number(row.read_rows),
    keptRows: Number(row.kept_rows), detail: row.detail === null ? null : String(row.detail), requestedAt: row.requested_at as Date, requestedBy: String(row.requested_by), finishedAt: (row.finished_at as Date | null) ?? null,
  }));
}

/** Asks for a load with the cut as it is saved now. It runs by itself, in the background; one at a time. */
export async function requestProspectLoad(who: string, conn: Queryable): Promise<void> {
  const filters = await loadProspectFilters(conn);
  if (filters.cnaes.length === 0) throw new ProspectLoadError("Diga ao menos uma atividade (CNAE) antes de trazer as empresas.");
  const { rows } = await conn.query("INSERT INTO prospect_loads (cnaes, ufs, requested_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id", [filters.cnaes, filters.ufs, who]);
  if (rows.length === 0) throw new ProspectLoadError("Já existe uma carga em andamento. Espere ela terminar, ou cancele.");
}

/** Stops the load on its way. What it already brought stays in the list. */
export async function cancelProspectLoad(who: string, conn: Queryable): Promise<void> {
  const { rows } = await conn.query("UPDATE prospect_loads SET status = 'falhou', detail = $1, finished_at = now() WHERE status IN ('pedida', 'rodando') RETURNING id", [`Cancelada por ${who}.`.slice(0, 200)]);
  if (rows.length === 0) throw new ProspectLoadError("Não há carga em andamento.");
}

/** How many establishments of one company register (files 0 to 9), and of the companies register after them. */
const FILES = 10;
/** Beyond this the cut is no cut: the load stops and says so, instead of filling the database. */
export const MAX_KEPT = 300_000;
const PLACEHOLDER = "(razão social ainda não carregada)";

type Reader = (name: string) => Promise<AsyncIterable<Uint8Array>>;

/**
 * Runs the load that is waiting or was interrupted, to the end: the ten
 * establishment files, keeping the active ones of the cut, then the ten
 * company files, for the legal names. Progress is written down file by file,
 * so a server that restarts goes on from the next file. Nothing is kept on
 * disk and nothing but the establishments of the cut reaches the database.
 * A company already in the list keeps its state of work.
 */
export async function runProspectLoad(conn: Queryable, fetcher: typeof fetch = fetch): Promise<"nada" | "concluida" | "falhou" | "cancelada"> {
  const picked = await conn.query("UPDATE prospect_loads SET status = 'rodando', started_at = COALESCE(started_at, now()) WHERE status IN ('pedida', 'rodando') RETURNING id, cnaes, ufs, month, step, read_rows, kept_rows");
  const load = picked.rows[0];
  if (!load) return "nada";
  const id = Number(load.id);
  const cnaes = new Set(load.cnaes as string[]);
  const ufs = new Set(load.ufs as string[]);
  let read = Number(load.read_rows);
  let kept = Number(load.kept_rows);
  // The counts are written down only when a file ends, together with the step: a file read again after an interruption is not counted twice.
  const note = (detail: string, step?: number) =>
    step === undefined
      ? conn.query("UPDATE prospect_loads SET detail = $2 WHERE id = $1", [id, detail])
      : conn.query("UPDATE prospect_loads SET detail = $2, read_rows = $3, kept_rows = $4, step = $5 WHERE id = $1", [id, detail, read, kept, step]);
  const alive = async () => (await conn.query("SELECT 1 FROM prospect_loads WHERE id = $1 AND status = 'rodando'", [id])).rows.length > 0;
  try {
    const month = load.month === null ? (await listMonths(fetcher)).at(-1)! : String(load.month);
    await conn.query("UPDATE prospect_loads SET month = $2 WHERE id = $1", [id, month]);
    const source = `Receita Federal (dados abertos ${month})`;
    const open: Reader = async (name) => {
      const response = await fetcher(`${RECEITA_SHARE}/${month}/${name}`);
      if (response.status !== 200 || !response.body) throw new ReceitaError(`A Receita não entregou o arquivo ${name} (${response.status}).`);
      return response.body as unknown as AsyncIterable<Uint8Array>;
    };
    const cities = await codeTable(await open("Municipios.zip"));
    const activities = await codeTable(await open("Cnaes.zip"));

    const store = async (batch: Establishment[]) => {
      if (batch.length === 0) return;
      const values: unknown[] = [];
      const tuples = batch.map((item, index) => {
        values.push(item.cnpj, item.tradeName ?? PLACEHOLDER, item.tradeName, activities.get(item.cnae) ?? null, item.cnae, item.openedOn, item.street, item.number, item.district, cities.get(item.cityCode) ?? null, item.uf, item.cep, item.phone, item.email);
        const at = index * 14;
        return `($${at + 1}, $${at + 2}, $${at + 3}, 'ATIVA', $${at + 4}, $${at + 5}, $${at + 6}::date, $${at + 7}, $${at + 8}, $${at + 9}, $${at + 10}, $${at + 11}, $${at + 12}, $${at + 13}, $${at + 14}, $${batch.length * 14 + 1}, 'carga', 'carga')`;
      });
      await conn.query(
        "INSERT INTO prospects (cnpj, legal_name, trade_name, registry_status, activity, cnae, opened_on, street, street_number, district, city, uf, cep, phone, email, source, loaded_by, updated_by) VALUES " +
          tuples.join(", ") +
          " ON CONFLICT (cnpj) DO UPDATE SET trade_name = EXCLUDED.trade_name, registry_status = 'ATIVA', activity = EXCLUDED.activity, cnae = EXCLUDED.cnae, opened_on = EXCLUDED.opened_on, street = EXCLUDED.street, street_number = EXCLUDED.street_number, district = EXCLUDED.district, city = EXCLUDED.city, uf = EXCLUDED.uf, cep = EXCLUDED.cep, phone = EXCLUDED.phone, email = EXCLUDED.email, source = EXCLUDED.source, updated_at = now(), updated_by = 'carga'",
        [...values, source],
      );
    };

    for (let file = Number(load.step); file < FILES; file += 1) {
      let batch: Establishment[] = [];
      let sinceNote = 0;
      for await (const line of zipLines(await open(`Estabelecimentos${file}.zip`))) {
        read += 1;
        sinceNote += 1;
        const found = establishmentOf(line, cnaes, ufs);
        if (found) {
          batch.push(found);
          kept += 1;
          if (kept > MAX_KEPT) throw new ProspectLoadError(`O recorte passa de ${MAX_KEPT.toLocaleString("pt-BR")} empresas. Escolha menos atividades ou menos estados.`);
        }
        if (batch.length >= 200) {
          await store(batch);
          batch = [];
        }
        if (sinceNote >= 50_000) {
          sinceNote = 0;
          await note(`Lendo estabelecimentos: arquivo ${file + 1} de ${FILES}, ${read.toLocaleString("pt-BR")} linhas lidas, ${kept.toLocaleString("pt-BR")} empresas no recorte.`);
          if (!(await alive())) return "cancelada";
        }
      }
      await store(batch);
      await note(`Estabelecimentos: arquivo ${file + 1} de ${FILES} lido.`, file + 1);
      if (!(await alive())) return "cancelada";
    }

    // The legal names: only of the companies this base brought. An establishment came in under its trade name, or with none.
    const bases = new Set((await conn.query("SELECT DISTINCT left(cnpj, 8) AS base FROM prospects WHERE source = $1", [source])).rows.map((row) => String(row.base)));
    const start = Math.max(FILES, Number(load.step));
    for (let file = start - FILES; file < FILES && bases.size > 0; file += 1) {
      let names: [string, string, string | null][] = [];
      let sinceNote = 0;
      const flush = async () => {
        if (names.length === 0) return;
        await conn.query(
          "UPDATE prospects p SET legal_name = v.name, size = v.size FROM (SELECT * FROM unnest($1::text[], $2::text[], $3::text[]) AS t(base, name, size)) v WHERE left(p.cnpj, 8) = v.base AND p.source = $4",
          [names.map((row) => row[0]), names.map((row) => row[1]), names.map((row) => row[2]), source],
        );
        names = [];
      };
      for await (const line of zipLines(await open(`Empresas${file}.zip`))) {
        sinceNote += 1;
        // The base of the CNPJ is the first field: the line is only taken apart when it is one of ours.
        if (bases.has(line.slice(1, 9))) {
          const company = companyOf(line);
          if (company) names.push([company.base, company.legalName, company.size]);
        }
        if (names.length >= 200) await flush();
        if (sinceNote >= 200_000) {
          sinceNote = 0;
          await note(`Lendo razões sociais: arquivo ${file + 1} de ${FILES}.`);
          if (!(await alive())) return "cancelada";
        }
      }
      await flush();
      await note(`Razões sociais: arquivo ${file + 1} de ${FILES} lido.`, FILES + file + 1);
    }
    // A company whose legal name did not come keeps the trade name as its name.
    await conn.query("UPDATE prospects SET legal_name = COALESCE(trade_name, 'Empresa ' || cnpj) WHERE source = $1 AND legal_name = $2", [source, PLACEHOLDER]);
    await conn.query("UPDATE prospect_loads SET status = 'concluida', finished_at = now(), detail = $2, read_rows = $3, kept_rows = $4, step = 20 WHERE id = $1 AND status = 'rodando'", [id, `Base de ${month}: ${kept.toLocaleString("pt-BR")} empresas ativas no recorte.`, read, kept]);
    return "concluida";
  } catch (error) {
    const told = error instanceof ProspectLoadError || error instanceof ReceitaError;
    if (!told) console.error("[prospecção] a carga da Receita falhou:", error instanceof Error ? error.message : error);
    // A fault of the network or of the Receita leaves the load to go on from the same file at the next run; a refusal of the cut ends it.
    if (error instanceof ProspectLoadError) {
      await conn.query("UPDATE prospect_loads SET status = 'falhou', finished_at = now(), detail = $2, read_rows = $3, kept_rows = $4 WHERE id = $1", [id, error.message.slice(0, 300), read, kept]);
      return "falhou";
    }
    await note(`Interrompida (${told ? (error as Error).message : "falha de rede ou do servidor"}). Continua sozinha na próxima tentativa.`.slice(0, 300));
    return "falhou";
  }
}

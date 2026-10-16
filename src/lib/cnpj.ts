import { isValidCnpj, normalizeDocument } from "@/lib/customer";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class CnpjError extends Error {}

/** What the public register of the Receita Federal says about a company. Only the company: no partner, no person. */
export type CompanyRecord = {
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  /** `ATIVA`, `BAIXADA`, `INAPTA`… */
  status: string;
  /** The main activity (CNAE), in words. */
  activity: string | null;
  size: string | null;
  /** `AAAA-MM-DD`. */
  openedOn: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  uf: string | null;
  cep: string | null;
  phone: string | null;
  email: string | null;
  fiscal?: {
    source: "BrasilAPI" | "CNPJ.ws";
    updatedAt: string | null;
    simples: boolean | null;
    mei: boolean | null;
    stateRegistration: string | null;
    cityCode: string | null;
  };
};

/** The service refuses a request that does not say who is asking. */
const USER_AGENT = "ERP-Avila-Ops/1 (+https://erp.avilaops.com)";

type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>;

const clean = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim().replace(/\s+/g, " ") : null);

/**
 * Looks a CNPJ up in the public register (BrasilAPI, which serves the open
 * data of the Receita Federal). The CNPJ is checked before anything leaves the
 * server, and it is the only thing sent. What comes back is taken field by
 * field: nothing of the answer is trusted as markup or as more than text.
 */
export async function lookupCnpj(typed: string, fetcher: Fetcher = fetch): Promise<CompanyRecord> {
  const cnpj = normalizeDocument(typed);
  if (cnpj.length !== 14 || !isValidCnpj(cnpj)) throw new CnpjError("CNPJ inválido. Confira os 14 números.");
  let response: Awaited<ReturnType<Fetcher>>;
  try {
    response = await fetcher(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8_000) });
  } catch {
    return lookupAlternative(cnpj, fetcher);
  }
  if (response.status === 404) throw new CnpjError("CNPJ não encontrado na Receita.");
  if (response.status !== 200) return lookupAlternative(cnpj, fetcher);
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return parseCompany(cnpj, body);
}

function parseCompany(cnpj: string, body: Record<string, unknown> | null, fiscal?: CompanyRecord["fiscal"]): CompanyRecord {
  const legalName = clean(body?.razao_social);
  if (!body || !legalName) throw new CnpjError("A consulta à Receita voltou sem os dados da empresa.");
  if (body.cnpj && normalizeDocument(String(body.cnpj)) !== cnpj) throw new CnpjError("A consulta retornou outro CNPJ. Nenhum dado foi aplicado.");
  const street = [clean(body.descricao_tipo_de_logradouro), clean(body.logradouro)].filter(Boolean).join(" ") || null;
  const phone = clean(body.ddd_telefone_1)?.replace(/\D/g, "") ?? null;
  const email = clean(body.email)?.toLowerCase() ?? null;
  const cep = clean(body.cep)?.replace(/\D/g, "") ?? null;
  const opened = clean(body.data_inicio_atividade);
  return {
    cnpj,
    legalName: legalName.slice(0, 150),
    tradeName: clean(body.nome_fantasia)?.slice(0, 150) ?? null,
    status: (clean(body.descricao_situacao_cadastral) ?? "não informada").slice(0, 40),
    activity: clean(body.cnae_fiscal_descricao)?.slice(0, 200) ?? null,
    size: clean(body.porte)?.slice(0, 40) ?? null,
    openedOn: opened && /^\d{4}-\d{2}-\d{2}$/.test(opened) ? opened : null,
    street: street?.slice(0, 120) ?? null,
    number: clean(body.numero)?.slice(0, 20) ?? null,
    complement: clean(body.complemento)?.slice(0, 60) ?? null,
    district: clean(body.bairro)?.slice(0, 80) ?? null,
    city: clean(body.municipio)?.slice(0, 80) ?? null,
    uf: /^[A-Z]{2}$/.test(clean(body.uf) ?? "") ? clean(body.uf) : null,
    cep: cep && /^\d{8}$/.test(cep) ? cep : null,
    phone: phone && /^\d{10,11}$/.test(phone) ? phone : null,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    fiscal: fiscal ?? {
      source: "BrasilAPI", updatedAt: clean(body.atualizado_em),
      simples: typeof body.opcao_pelo_simples === "boolean" ? body.opcao_pelo_simples : null,
      mei: typeof body.opcao_pelo_mei === "boolean" ? body.opcao_pelo_mei : null,
      stateRegistration: null,
      cityCode: /^\d{7}$/.test(String(body.codigo_municipio_ibge ?? "")) ? String(body.codigo_municipio_ibge) : null,
    },
  };
}

/** A second public-data provider when the first is unavailable. No partners are retained. */
async function lookupAlternative(cnpj: string, fetcher: Fetcher): Promise<CompanyRecord> {
  let response: Awaited<ReturnType<Fetcher>>;
  try {
    response = await fetcher(`https://publica.cnpj.ws/cnpj/${cnpj}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new CnpjError("A consulta à Receita não respondeu agora. Preencha à mão ou tente de novo em instantes.");
  }
  if (response.status === 404) throw new CnpjError("CNPJ não encontrado na Receita.");
  if (response.status !== 200) throw new CnpjError("A consulta à Receita está fora do ar agora. Preencha à mão ou tente de novo em instantes.");
  const raw = await response.json().catch(() => null) as Record<string, unknown> | null;
  const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const body = object(raw);
  const site = object(body.estabelecimento);
  const state = object(site.estado);
  const city = object(site.cidade);
  const tax = object(body.simples);
  const flag = (value: unknown): boolean | null => value === "Sim" ? true : value === "Não" ? false : null;
  const registrations = Array.isArray(site.inscricoes_estaduais) ? site.inscricoes_estaduais.map(object).filter((entry) => entry.ativo === true && object(entry.estado).sigla === state.sigla) : [];
  const registration = registrations.length === 1 ? clean(registrations[0].inscricao_estadual)?.replace(/\D/g, "") ?? null : null;
  return parseCompany(cnpj, {
    cnpj: site.cnpj, razao_social: body.razao_social, nome_fantasia: site.nome_fantasia,
    descricao_situacao_cadastral: site.situacao_cadastral, cnae_fiscal_descricao: object(site.atividade_principal).descricao,
    porte: object(body.porte).descricao, data_inicio_atividade: site.data_inicio_atividade,
    descricao_tipo_de_logradouro: site.tipo_logradouro, logradouro: site.logradouro, numero: site.numero,
    complemento: site.complemento, bairro: site.bairro, municipio: city.nome, uf: state.sigla,
    cep: site.cep, ddd_telefone_1: `${clean(site.ddd1) ?? ""}${clean(site.telefone1) ?? ""}`, email: site.email,
  }, {
    source: "CNPJ.ws", updatedAt: clean(tax.atualizado_em) ?? clean(body.atualizado_em),
    simples: flag(tax.simples), mei: flag(tax.mei), stateRegistration: registration,
    cityCode: /^\d{7}$/.test(String(city.ibge_id ?? "")) ? String(city.ibge_id) : null,
  });
}

/** One line about the company, as the screens show it after a lookup. */
export function companySummary(record: CompanyRecord): string {
  const place = [record.city, record.uf].filter(Boolean).join("/");
  return [`Situação na Receita: ${record.status}`, record.activity, place, record.openedOn ? `aberta em ${record.openedOn.split("-").reverse().join("/")}` : null].filter(Boolean).join(" · ");
}

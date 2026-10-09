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
    throw new CnpjError("A consulta à Receita não respondeu agora. Preencha à mão ou tente de novo em instantes.");
  }
  if (response.status === 404) throw new CnpjError("CNPJ não encontrado na Receita.");
  if (response.status !== 200) throw new CnpjError("A consulta à Receita está fora do ar agora. Preencha à mão ou tente de novo em instantes.");
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const legalName = clean(body?.razao_social);
  if (!body || !legalName) throw new CnpjError("A consulta à Receita voltou sem os dados da empresa.");
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
  };
}

/** One line about the company, as the screens show it after a lookup. */
export function companySummary(record: CompanyRecord): string {
  const place = [record.city, record.uf].filter(Boolean).join("/");
  return [`Situação na Receita: ${record.status}`, record.activity, place, record.openedOn ? `aberta em ${record.openedOn.split("-").reverse().join("/")}` : null].filter(Boolean).join(" · ");
}

import type { CompanyRecord } from "@/lib/cnpj";
import { normalizeDocument } from "@/lib/customer";
import type { FiscalSettings } from "@/lib/db/fiscal";
import { cityCode } from "@/lib/fiscal/cities";

/** Public data supplies a suggestion, never a tax treatment for the goods. */
export function suggestedTaxRegime(company: CompanyRecord): 1 | 3 | null {
  if (company.fiscal?.mei !== false) return null;
  return company.fiscal.simples === true ? 1 : company.fiscal.simples === false ? 3 : null;
}

/** Complete blanks only; numbering, environment, certificate and existing choices stay intact. */
export function completeFiscalCompany(current: FiscalSettings, company: CompanyRecord, applyRegime: boolean): FiscalSettings {
  if (current.cnpj && normalizeDocument(current.cnpj) !== company.cnpj) throw new Error("O CNPJ consultado não é o da empresa cadastrada.");
  if (company.status.toUpperCase() !== "ATIVA") throw new Error("A consulta não retornou uma empresa ativa. Confira o cadastro antes de aplicar.");
  return {
    ...current,
    cnpj: current.cnpj || company.cnpj,
    legalName: current.legalName || company.legalName,
    stateRegistration: current.stateRegistration || company.fiscal?.stateRegistration || null,
    street: current.street || company.street,
    streetNumber: current.streetNumber || company.number,
    district: current.district || company.district,
    city: current.city || company.city,
    uf: current.uf || company.uf,
    cep: current.cep || company.cep,
    cityCode: current.cityCode || cityCode(current.city || company.city, current.uf || company.uf),
    taxRegime: current.taxRegime ?? (applyRegime ? suggestedTaxRegime(company) : null),
  };
}

/** Exact built-in names only: unknown or ambiguous methods still need a choice. */
export function standardPaymentCode(label: string): string | null {
  const name = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const codes: Record<string, string> = {
    pix: "17", dinheiro: "01", cheque: "02", boleto: "15", "boleto bancario": "15",
    "cartao de credito": "03", "cartao de debito": "04", transferencia: "18", "transferencia bancaria": "18",
    "deposito bancario": "16",
    "cartao de credito (presencial)": "03",
    "link de pagamento - cartao de credito": "03",
    "link de pagamento - pix": "17",
    "link de pagamento - boleto": "15",
  };
  return codes[name] ?? null;
}

/** CFOP depends on the nature of the goods, never on the company's CNAE alone. */
export function saleOperationCodes(operation: "revenda" | "producao") {
  return operation === "producao"
    ? { operationNature: "Venda de produção do estabelecimento", cfopInternal: "5101", cfopInterstate: "6101", cfopInterstateNonTaxpayer: "6107" }
    : { operationNature: "Venda de mercadoria adquirida ou recebida de terceiros", cfopInternal: "5102", cfopInterstate: "6102", cfopInterstateNonTaxpayer: "6108" };
}

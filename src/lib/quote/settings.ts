import { parseMoney } from "@/lib/format";
import { isMailAddress } from "@/lib/mail/message";

export const PROPOSAL_FIELDS = {
  phone: { label: "Telefone comercial", max: 40 },
  email: { label: "E-mail comercial", max: 150 },
  website: { label: "Site", max: 180 },
  warranty: { label: "Garantia: prazo e cobertura", max: 1000 },
  installation: { label: "Montagem e instalação", max: 1000 },
  latePayment: { label: "Multa, juros e correção por atraso", max: 1000 },
  cancellation: { label: "Cancelamento", max: 1000 },
  delayedDownPayment: { label: "O que acontece se a entrada atrasar", max: 1000 },
  freightMode: { label: "Modalidade de frete", max: 20 },
  freightAmount: { label: "Frete pago diretamente pelo cliente (R$)", max: 20 },
  freightTerms: { label: "Responsável, pagamento e condições do frete", max: 500 },
  deliveryEstimate: { label: "Prazo de transporte após a fabricação", max: 500 },
  deliveryNotes: { label: "Instruções de entrega", max: 500 },
} as const;
export type ProposalField = keyof typeof PROPOSAL_FIELDS;
export type ProposalDetails = Partial<Record<ProposalField, string>>;

/** Empty placeholders do not constitute an agreed commercial condition. */
export function hasProposalValue(value: string | undefined): boolean {
  return Boolean(value?.trim() && !/^(a definir|a cadastrar|a informar|pendente)[.!]?$/i.test(value.trim()));
}

/** Company defaults count; an order may replace them with its own agreed terms. */
export function closingProposalProblems(details: ProposalDetails): string[] {
  return (["warranty", "freightMode", "installation"] as const)
    .filter((field) => !hasProposalValue(details[field]) || (field === "freightMode" && !["CIF", "FOB", "retirada"].includes(details[field]!)))
    .map((field) => `${PROPOSAL_FIELDS[field].label}: preencha em Dados do PDF.`);
}
export type ProposalSection = { title: string; fields: ProposalField[]; hint: string };
export const COMPANY_PROPOSAL_SECTIONS: ProposalSection[] = [
  { title: "Contato da empresa", fields: ["phone", "email"], hint: "CNPJ, inscrição estadual e endereço vêm do cadastro Fiscal." },
  { title: "Site da empresa", fields: ["website"], hint: "Informe o endereço público do site da empresa." },
  { title: "Garantia", fields: ["warranty"], hint: "Informe o prazo, a cobertura e as exclusões aprovadas para seus produtos." },
  { title: "Montagem e instalação", fields: ["installation"], hint: "Diga se estão inclusas, são cobradas à parte ou dependem de contratação." },
  { title: "Pagamento em atraso", fields: ["latePayment"], hint: "Use as condições aprovadas pela empresa e coerentes com o contrato." },
  { title: "Cancelamento", fields: ["cancellation"], hint: "Informe as condições de cancelamento aprovadas pela empresa." },
  { title: "Atraso da entrada", fields: ["delayedDownPayment"], hint: "Explique o efeito sobre a reserva, fabricação e prazos." },
];
export const ORDER_PROPOSAL_SECTIONS: ProposalSection[] = [
  { title: "Frete", fields: ["freightMode", "freightAmount"], hint: "Valor direto à transportadora, fora do total dos equipamentos." },
  { title: "Condições do frete", fields: ["freightTerms"], hint: "Informe o responsável e as condições. Frete cobrado pela vendedora deve ser tratado no faturamento." },
  { title: "Previsão de entrega", fields: ["deliveryEstimate", "deliveryNotes"], hint: "O endereço vem de Entrega da nota ou, na ausência, do cadastro do cliente." },
  ...COMPANY_PROPOSAL_SECTIONS.slice(2),
];
export class ProposalSettingsError extends Error {}

/** Blank order fields inherit the company terms; no business term is invented. */
export function checkedProposalDetails(input: ProposalDetails): ProposalDetails {
  const result: ProposalDetails = {};
  for (const key of Object.keys(PROPOSAL_FIELDS) as ProposalField[]) {
    const value = input[key]?.trim().replace(/\s+/g, " ") ?? "";
    if (!value) continue;
    if (value.length > PROPOSAL_FIELDS[key].max) throw new ProposalSettingsError(`${PROPOSAL_FIELDS[key].label}: até ${PROPOSAL_FIELDS[key].max} caracteres.`);
    if (key === "email" && !isMailAddress(value)) throw new ProposalSettingsError("Confira o e-mail comercial.");
    if (key === "phone" && (!/^[+()0-9 .-]+$/.test(value) || !/^\d{10,15}$/.test(value.replace(/\D/g, "")))) throw new ProposalSettingsError("Telefone comercial: informe DDD e número.");
    if (key === "website") {
      let url: URL;
      try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`); } catch { throw new ProposalSettingsError("Confira o site da empresa."); }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname.includes(".")) throw new ProposalSettingsError("Informe um site http ou https.");
    }
    if (key === "freightMode" && !["CIF", "FOB", "retirada"].includes(value)) throw new ProposalSettingsError("Escolha a modalidade de frete da lista.");
    if (key === "freightAmount" && (parseMoney(value) === null || parseMoney(value)! > 999_999_999.99)) throw new ProposalSettingsError("Frete: informe um valor válido em reais.");
    result[key] = value;
  }
  if (result.freightAmount && result.freightMode !== "FOB") throw new ProposalSettingsError("Valor direto pelo cliente: escolha FOB. Para CIF ou retirada, deixe o valor em branco.");
  return result;
}

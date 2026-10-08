import { showIsoDate, showMoney, showPercent } from "@/lib/format";

export type ProposalText = {
  company: string;
  number: string;
  /** Name of the customer and its CNPJ or CPF, when the order already has one. */
  customer: { name: string; document: string | null } | null;
  /** Name of the state of delivery. */
  delivery: string | null;
  items: { quantity: number; name: string; code: string | null; unit: number }[];
  tableTotal: number;
  /** As a fraction. Zero hides the line of the discount. */
  discount: number;
  total: number;
  /** Down payment and installments, in the order they are paid. */
  receipts: { label: string; dueDate: string; method: string | null; amount: number }[];
  /** `AAAA-MM-DD`. */
  validUntil: string;
  production: string | null;
  notes: string | null;
  /** The commercial manager and the place of issue of the company, when registered. */
  manager?: string | null;
  place?: string | null;
};

/**
 * The proposal as text, to paste in a message to the customer. The asterisks
 * are the bold of WhatsApp. Only what the customer may read: no cost, no
 * margin, no approval.
 */
export function proposalText(proposal: ProposalText): string {
  const lines = [`*Proposta ${proposal.company} #${proposal.number}*`];
  if (proposal.customer) {
    lines.push(`Cliente: ${proposal.customer.name}`);
    if (proposal.customer.document) lines.push(`CNPJ/CPF: ${proposal.customer.document}`);
  }
  if (proposal.delivery) lines.push(`Entrega: ${proposal.delivery}`);
  lines.push("");
  for (const item of proposal.items) {
    lines.push(`${item.quantity}x ${item.name}${item.code ? ` (${item.code})` : ""} — ${showMoney(item.unit)} un.`);
  }
  lines.push("", `Valor de tabela: ${showMoney(proposal.tableTotal)}`);
  if (proposal.discount > 0) {
    lines.push(`Desconto especial (${showPercent(proposal.discount)}): − ${showMoney(proposal.tableTotal * proposal.discount)}`);
  }
  lines.push(`*Total: ${showMoney(proposal.total)}*`);
  if (proposal.receipts.length > 0) {
    lines.push("", "*Pagamento*");
    for (const receipt of proposal.receipts) {
      lines.push(`${receipt.label}: ${showMoney(receipt.amount)}${receipt.method ? ` via ${receipt.method}` : ""} — ${showIsoDate(receipt.dueDate)}`);
    }
  }
  lines.push("", `Validade: ${showIsoDate(proposal.validUntil)}`);
  if (proposal.production) lines.push(`Prazo de fabricação: ${proposal.production}`);
  if (proposal.notes) lines.push(`Obs.: ${proposal.notes}`);
  if (proposal.manager || proposal.place) lines.push("");
  if (proposal.manager) lines.push(`Gerente comercial: ${proposal.manager}`);
  if (proposal.place) lines.push(`Local de emissão: ${proposal.place}`);
  return lines.join("\n");
}

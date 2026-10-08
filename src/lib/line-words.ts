/**
 * How the screens call the cost of a product line. A line bought abroad has an
 * import advisory and pays the factory in China; one bought in the country has
 * a supplier. Only the words change: the account is the same.
 */
export type LineWords = {
  /** Label of the field of the cost of one equipment. */
  cost: string;
  costIntro: string;
  pasteButton: string;
  pasteColumn: string;
  /** What the down payment has to cover first. */
  pay: string;
  payShort: string;
  safetyLabel: string;
  safetyHelp: string;
  downPaymentHelp: string;
  ipiHelp: string;
  interstateLabel: string;
  reviseCosts: string;
};

const IMPORTED: LineWords = {
  cost: "Custo assessoria R$",
  costIntro: "Digite o custo que a assessoria passar.",
  pasteButton: "Colar custos da assessoria",
  pasteColumn: "custo assessoria R$",
  pay: "Pagar na China",
  payShort: "a China",
  safetyLabel: "Margem de segurança da importação",
  safetyHelp: "Colchão para dólar, taxas e frete da China. Soma no custo de todos os equipamentos.",
  downPaymentHelp: "Mostrada a toda a equipe. Sugestão ao lado: cobre o pagamento na China + comissão no pior produto.",
  ipiHelp: "Importador equiparado a industrial. Confirme a alíquota do NCM.",
  interstateLabel: "ICMS interestadual (importado com FCI)",
  reviseCosts: "Dólar e frete mudam: revise os custos com a assessoria.",
};

const DOMESTIC: LineWords = {
  cost: "Custo de compra R$",
  costIntro: "Digite o custo de compra de cada equipamento.",
  pasteButton: "Colar custos do fornecedor",
  pasteColumn: "custo de compra R$",
  pay: "Pagar ao fornecedor",
  payShort: "o fornecedor",
  safetyLabel: "Margem de segurança sobre o custo de compra",
  safetyHelp: "Colchão para reajuste do fornecedor e frete de compra. Soma no custo de todos os equipamentos.",
  downPaymentHelp: "Mostrada a toda a equipe. Sugestão ao lado: cobre o pagamento ao fornecedor + comissão no pior produto.",
  ipiHelp: "Confirme com o contador se a venda desta linha destaca IPI e a alíquota do NCM.",
  interstateLabel: "ICMS interestadual padrão (vale para o estado sem ICMS de saída próprio)",
  reviseCosts: "Preço de fornecedor muda: revise os custos de compra.",
};

export const lineWords = (imported: boolean): LineWords => (imported ? IMPORTED : DOMESTIC);

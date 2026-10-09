import { formatCep, formatDocument, formatPhone } from "@/lib/customer";
import type { CustomerInput } from "@/lib/customer";
import type { QuoteDocument } from "@/lib/quote/document";

/**
 * The contract of an order is a text the company writes once, with fields in
 * braces that the order fills in. Nothing here invents a clause: the standard
 * text only names the parties, what is sold, for how much and when, plus the
 * sentence by which the parties accept the electronic signature.
 */
export const DEFAULT_CONTRACT_TITLE = "Contrato de compra e venda";

export const DEFAULT_CONTRACT_BODY = `# Partes

VENDEDORA: {empresa_razao_social}, CNPJ {empresa_cnpj}, com sede em {empresa_endereco}.

COMPRADOR(A): {cliente}, {cliente_documento}, com endereço em {cliente_endereco}.

# Objeto

A VENDEDORA vende ao(à) COMPRADOR(A) os equipamentos abaixo, conforme o pedido nº {pedido}:

{equipamentos}

# Valor e pagamento

Valor total: {total}.

{pagamento}

# Prazo e entrega

Prazo de fabricação: {prazo_fabricacao}.

Entrega em: {entrega}.

# Assinatura eletrônica

As partes aceitam que este contrato seja assinado por meio eletrônico, pelo sistema da VENDEDORA, com confirmação por código enviado ao e-mail do signatário, e reconhecem essa forma de assinatura como válida e suficiente para comprovar a autoria e a integridade deste documento, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001.

{local}, {data}.`;

/** Every field a contract may carry, with what it becomes. The screen of the model lists them from here. */
export const CONTRACT_WORDS = [
  ["empresa", "Nome da sua empresa no sistema"],
  ["empresa_razao_social", "Razão social (Parâmetros → Fiscal); sem ela, o nome da empresa"],
  ["empresa_cnpj", "CNPJ da sua empresa (Parâmetros → Fiscal)"],
  ["empresa_endereco", "Endereço da sua empresa (Parâmetros → Fiscal)"],
  ["cliente", "Nome ou razão social do cliente"],
  ["cliente_fantasia", "Nome fantasia do cliente"],
  ["cliente_documento", "CNPJ ou CPF do cliente, com o nome do documento"],
  ["cliente_endereco", "Endereço do cadastro do cliente"],
  ["cliente_contato", "Pessoa de contato do cliente"],
  ["cliente_telefone", "Telefone do cliente"],
  ["cliente_email", "E-mail do cliente"],
  ["pedido", "Número do pedido"],
  ["equipamentos", "Lista dos equipamentos, com quantidade e valor"],
  ["total", "Valor total do pedido"],
  ["pagamento", "Entrada e parcelas, como combinado no pedido"],
  ["prazo_fabricacao", "Prazo de fabricação do pedido"],
  ["entrega", "Estado de entrega"],
  ["observacoes", "Observações do pedido"],
  ["vendedor", "Nome do vendedor do pedido"],
  ["gerente", "Gerente comercial (Parâmetros)"],
  ["local", "Local de emissão (Parâmetros)"],
  ["data", "Data de emissão, por extenso"],
] as const;

export type ContractWord = (typeof CONTRACT_WORDS)[number][0];
export type ContractValues = Record<ContractWord, string>;

const WORD = new RegExp(`\\{(${CONTRACT_WORDS.map(([word]) => word).join("|")})\\}`, "g");

/** The fields the text uses. A word in braces that is not a field is not one of them. */
export function wordsUsed(text: string): ContractWord[] {
  return [...new Set([...text.matchAll(WORD)].map(([, word]) => word as ContractWord))];
}

/** The text with each field replaced by its value. An unknown word stays as typed; a field without value leaves a blank. */
export function fillContract(text: string, values: ContractValues): string {
  return text.replace(WORD, (_match, word: ContractWord) => values[word]);
}

/** The fields the text uses and this order has nothing for: what the screen warns about before sending. */
export function blankWords(text: string, values: ContractValues): string[] {
  return wordsUsed(text)
    .filter((word) => values[word].trim() === "" && word !== "observacoes" && word !== "cliente_fantasia")
    .map((word) => CONTRACT_WORDS.find(([key]) => key === word)![1]);
}

const joined = (parts: (string | null | undefined)[], separator: string) => parts.filter((part) => part && part.trim() !== "").join(separator);

/** `Rua A, 10, sala 2 - Centro, Votuporanga/SP, CEP 15500-000`, with whatever there is. */
export function addressLine(place: { street: string | null; streetNumber: string | null; complement?: string | null; district: string | null; city: string | null; uf: string | null; cep: string | null }): string {
  const street = joined([place.street, place.streetNumber, place.complement], ", ");
  return joined([joined([street, place.district], " - "), joined([place.city, place.uf], "/"), place.cep ? `CEP ${formatCep(place.cep)}` : null], ", ");
}

export type ContractInput = {
  /** Name of the company of the session. */
  company: string;
  /** What Parâmetros → Fiscal says about the company. All of it may be blank. */
  issuer: { legalName: string | null; cnpj: string | null; street: string | null; streetNumber: string | null; district: string | null; city: string | null; uf: string | null; cep: string | null };
  customer: CustomerInput;
  orderNumber: string;
  /** The quotation of the same order: items, totals, payment and dates already as the customer reads them. */
  quote: QuoteDocument;
};

/** The value of every field for one order. */
export function contractValues({ company, issuer, customer, orderNumber, quote }: ContractInput): ContractValues {
  const total = quote.totals.find((row) => row.strong)?.value ?? "";
  return {
    empresa: company,
    empresa_razao_social: issuer.legalName?.trim() || company,
    empresa_cnpj: issuer.cnpj ? formatDocument(issuer.cnpj) : "",
    empresa_endereco: addressLine({ ...issuer, complement: null }),
    cliente: customer.name,
    cliente_fantasia: customer.tradeName ?? "",
    cliente_documento: `${customer.kind === "PJ" ? "CNPJ" : "CPF"} ${formatDocument(customer.document)}`,
    cliente_endereco: addressLine(customer),
    cliente_contato: customer.contactName ?? "",
    cliente_telefone: customer.phone ? formatPhone(customer.phone) : "",
    cliente_email: customer.email ?? "",
    pedido: orderNumber,
    equipamentos: quote.items
      .map((item) => `- ${item.quantity} x ${joined([item.code, item.name], " - ")}: ${item.unitWithIpi} cada, total ${item.totalWithIpi}`)
      .join("\n"),
    total,
    pagamento: quote.payment.join("\n"),
    prazo_fabricacao: quote.production ?? "",
    entrega: quote.delivery ?? "",
    observacoes: quote.notes ?? "",
    vendedor: quote.seller.name,
    gerente: quote.manager ?? "",
    local: quote.place ?? "",
    data: quote.signedAt.replace(/^.*, (?=\d)/, ""),
  };
}

/** `Contrato nº 261008-RUZL-1`: the order and which contract of it this is. */
export const contractNumber = (orderNumber: string, sequence: number) => `${orderNumber}-${sequence}`;

/** `jo***@dominio.com.br`: enough for the signer to know where the code went, not enough to copy. */
export function maskedEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(3, user.length - 2))}@${domain}`;
}

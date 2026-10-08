import { roundCents } from "@/lib/pricing/money";

/**
 * The NF-e (model 55, layout 4.00) of a sale, as XML ready to be signed. Pure:
 * no database, no certificate, no network. Every tax code and rate comes in
 * `rules` and in the items, from the tables the company edits; nothing fiscal
 * is decided here beyond the arithmetic the layout prescribes.
 */

/** A problem the company can fix in a register: the message goes to the screen as it is. */
export class NfeError extends Error {}

/** IBGE code of each state: the first two digits of the access key. */
export const UF_CODES: Record<string, string> = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17", MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26",
  AL: "27", SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41", SC: "42", RS: "43", MS: "50", MT: "51", GO: "52", DF: "53",
};

export type NfeAddress = {
  street: string;
  number: string;
  complement?: string | null;
  district: string;
  /** IBGE code of the city, seven digits. */
  cityCode: string;
  city: string;
  uf: string;
  /** Eight digits. */
  cep: string;
  phone?: string | null;
};

export type NfeIssuer = NfeAddress & {
  cnpj: string;
  legalName: string;
  stateRegistration: string;
  /** 1 Simples Nacional, 2 Simples com excesso de sublimite, 3 Regime normal. */
  taxRegime: 1 | 2 | 3;
};

export type NfeRecipient = NfeAddress & {
  kind: "PJ" | "PF";
  /** CNPJ or CPF, digits only. */
  document: string;
  name: string;
  /** Digits, or `null` for who has none or is exempt. */
  stateRegistration: string | null;
  /** Contributor of ICMS: a company with a state registration in numbers. */
  taxpayer: boolean;
  email?: string | null;
};

/** The fiscal rules of the operation: the table the accountant fills in, by product line. */
export type NfeRules = {
  operationNature: string;
  cfopInternal: string;
  cfopInterstate: string;
  /** Sale to another state for who does not pay ICMS (final consumer). */
  cfopInterstateNonTaxpayer: string;
  /** CST of ICMS (regime normal) or CSOSN (Simples), as the regime of the issuer asks. */
  icmsCode: string;
  /** `null`: the invoice has no IPI group. */
  ipiCst: string | null;
  ipiFrameCode: string;
  pisCst: string;
  /** As a fraction. */
  pisRate: number;
  cofinsCst: string;
  cofinsRate: number;
  /** The buyer uses the goods (does not resell): what brings the DIFAL and the IPI into the ICMS base. */
  finalConsumer: boolean;
  /** Whether the IPI is part of the ICMS base in a sale to a final consumer. */
  ipiInIcmsBase: boolean;
  additionalInfo: string | null;
};

export type NfeItem = {
  code: string;
  name: string;
  ncm: string;
  cest: string | null;
  /** Origin of the goods, 0 to 8. */
  origin: number;
  unit: string;
  quantity: number;
  /** Price of one unit after the discount of the order, without IPI. */
  unitPrice: number;
  /** As a fraction: the IPI of the table version of the order. */
  ipiRate: number;
};

export type NfePayment = {
  /** `tPag` of the layout: 01 dinheiro, 03 crédito, 04 débito, 15 boleto, 16 depósito, 17 PIX, 18 transferência, 99 outros. */
  code: string;
  /** Required by the layout when the code is 99. */
  description: string | null;
  amount: number;
};

export type NfeInput = {
  environment: "homologacao" | "producao";
  series: number;
  number: number;
  /** `cNF`: eight random digits, different from the number. */
  randomCode: string;
  /** `AAAA-MM-DDTHH:MM:SS-03:00`. */
  issuedAt: string;
  issuer: NfeIssuer;
  recipient: NfeRecipient;
  rules: NfeRules;
  items: NfeItem[];
  /** ICMS of the operation, as a fraction: the internal rate inside the state, the outbound rate to another. */
  icmsRate: number;
  /** The destination's internal rate and poverty fund, for the DIFAL of a sale to a non taxpayer of another state. */
  destination: { internalIcms: number; fcp: number };
  payments: NfePayment[];
  /** Name and version of this system, as `verProc`. */
  software: string;
};

const HOMOLOGATION_NAME = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
const NAMESPACE = "http://www.portalfiscal.inf.br/nfe";

const onlyDigits = (text: string) => text.replace(/\D/g, "");
const money = (value: number) => roundCents(value).toFixed(2);
const rate = (value: number) => (Math.round(value * 1e6) / 1e4).toFixed(4);

/** Text as the layout takes it: no line breaks, no doubled spaces, no edges, cut at the size of the field. */
function clean(text: string, max: number): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max).trim();
}
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** `<name>value</name>`, or nothing for `null`: an empty tag is refused by the schema. */
function tag(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `<${name}>${escape(String(value))}</${name}>`;
}
const group = (name: string, inner: string, attributes = "") => (inner === "" ? "" : `<${name}${attributes}>${inner}</${name}>`);

/** Check digit of the access key: modulus 11, weights 2 to 9 from the right. */
export function accessKeyDigit(key43: string): string {
  if (!/^\d{43}$/.test(key43)) throw new Error("A chave de acesso tem 43 dígitos antes do verificador.");
  let sum = 0;
  for (let index = 0; index < 43; index += 1) sum += Number(key43[42 - index]) * (2 + (index % 8));
  const digit = 11 - (sum % 11);
  return digit >= 10 ? "0" : String(digit);
}

/** The 44 digits that identify the invoice: state, year and month, CNPJ, model, series, number, way of issuing, random code and check digit. */
export function accessKey(input: Pick<NfeInput, "issuer" | "issuedAt" | "series" | "number" | "randomCode">): string {
  const uf = UF_CODES[input.issuer.uf];
  if (!uf) throw new NfeError(`Estado do emitente inválido: ${input.issuer.uf}.`);
  if (!/^\d{8}$/.test(input.randomCode)) throw new Error("O código aleatório da nota tem oito dígitos.");
  const body = [
    uf,
    input.issuedAt.slice(2, 4) + input.issuedAt.slice(5, 7),
    input.issuer.cnpj,
    "55",
    String(input.series).padStart(3, "0"),
    String(input.number).padStart(9, "0"),
    "1",
    input.randomCode,
  ].join("");
  return body + accessKeyDigit(body);
}

function address(prefix: "enderEmit" | "enderDest", place: NfeAddress): string {
  return group(
    prefix,
    tag("xLgr", clean(place.street, 60)) +
      tag("nro", clean(place.number, 60)) +
      tag("xCpl", place.complement ? clean(place.complement, 60) : null) +
      tag("xBairro", clean(place.district, 60)) +
      tag("cMun", place.cityCode) +
      tag("xMun", clean(place.city, 60)) +
      tag("UF", place.uf) +
      tag("CEP", place.cep) +
      tag("cPais", "1058") +
      tag("xPais", "BRASIL") +
      tag("fone", place.phone ? onlyDigits(place.phone).slice(0, 14) : null),
  );
}

/** What is missing or wrong before any XML is written. Every problem at once, each naming the register that fixes it. */
export function nfeProblems(input: NfeInput): string[] {
  const problems: string[] = [];
  const { issuer, recipient, rules } = input;
  const need = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };
  need(/^\d{14}$/.test(issuer.cnpj), "Empresa: CNPJ com 14 dígitos (Parâmetros → Fiscal).");
  need(/^\d{2,14}$/.test(issuer.stateRegistration), "Empresa: inscrição estadual (Parâmetros → Fiscal).");
  need(issuer.legalName.trim().length >= 2, "Empresa: razão social (Parâmetros → Fiscal).");
  need(/^\d{7}$/.test(issuer.cityCode) && /^\d{8}$/.test(issuer.cep) && Boolean(UF_CODES[issuer.uf]), "Empresa: endereço com código do município no IBGE, UF e CEP (Parâmetros → Fiscal).");
  need(issuer.street.trim() !== "" && issuer.number.trim() !== "" && issuer.district.trim() !== "" && issuer.city.trim() !== "", "Empresa: rua, número, bairro e cidade (Parâmetros → Fiscal).");

  need(recipient.kind === "PJ" ? /^\d{14}$/.test(recipient.document) : /^\d{11}$/.test(recipient.document), "Cliente: CNPJ ou CPF completo.");
  need(recipient.name.trim().length >= 2, "Cliente: nome ou razão social.");
  need(/^\d{7}$/.test(recipient.cityCode), "Cliente: código do município no IBGE (cadastro do cliente).");
  need(/^\d{8}$/.test(recipient.cep) && Boolean(UF_CODES[recipient.uf]), "Cliente: CEP e UF.");
  need(recipient.street.trim() !== "" && recipient.number.trim() !== "" && recipient.district.trim() !== "" && recipient.city.trim() !== "", "Cliente: rua, número, bairro e cidade.");
  need(!recipient.taxpayer || /^\d{2,14}$/.test(recipient.stateRegistration ?? ""), "Cliente contribuinte: inscrição estadual em números.");

  need(rules.operationNature.trim() !== "", "Regras fiscais: natureza da operação.");
  for (const [name, cfop] of [["dentro do estado", rules.cfopInternal], ["para outro estado", rules.cfopInterstate], ["para não contribuinte de outro estado", rules.cfopInterstateNonTaxpayer]] as const) {
    need(/^[56]\d{3}$/.test(cfop), `Regras fiscais: CFOP de venda ${name}.`);
  }
  const simples = issuer.taxRegime === 1;
  need(simples ? ["102", "103", "300", "400"].includes(rules.icmsCode) : ["00", "40", "41", "50"].includes(rules.icmsCode),
    simples ? "Regras fiscais: CSOSN aceito hoje é 102, 103, 300 ou 400." : "Regras fiscais: CST do ICMS aceito hoje é 00, 40, 41 ou 50.");
  need(/^\d{2}$/.test(rules.pisCst) && /^\d{2}$/.test(rules.cofinsCst), "Regras fiscais: CST do PIS e da COFINS com dois dígitos.");
  need(rules.ipiCst === null || /^\d{2}$/.test(rules.ipiCst), "Regras fiscais: CST do IPI com dois dígitos, ou em branco para nota sem IPI.");
  need(rules.ipiCst !== null || input.items.every((item) => item.ipiRate === 0), "Regras fiscais: a linha tem IPI na tabela, falta o CST do IPI.");

  need(input.items.length > 0, "Pedido sem itens.");
  input.items.forEach((item, index) => {
    const which = `Item ${index + 1} (${item.name})`;
    need(/^\d{8}$/.test(item.ncm), `${which}: NCM com oito dígitos (tela do equipamento).`);
    need(Number.isInteger(item.origin) && item.origin >= 0 && item.origin <= 8, `${which}: origem da mercadoria (tela do equipamento).`);
    need(item.quantity > 0 && item.unitPrice > 0, `${which}: quantidade e preço maiores que zero.`);
  });

  const total = nfeTotals(input).invoice;
  const paid = roundCents(input.payments.reduce((sum, payment) => sum + payment.amount, 0));
  need(input.payments.length > 0 && paid === total, `Pagamento: as formas somam ${money(paid)} e a nota ${money(total)}.`);
  need(input.payments.every((payment) => /^\d{2}$/.test(payment.code)), "Pagamento: há forma de pagamento sem o código da nota (Parâmetros → Fiscal → Forma de pagamento na nota).");
  need(input.payments.every((payment) => payment.code !== "99" || Boolean(payment.description?.trim())), 'Pagamento: forma "outros" precisa de descrição.');
  return problems;
}

type ItemFigures = { product: number; ipi: number; icmsBase: number; icms: number; pis: number; cofins: number; difalBase: number; difal: number; fcp: number };

/** The account of one item. The ICMS base takes the IPI only in a sale to a final consumer, when the rules say so. */
function figuresOf(item: NfeItem, input: NfeInput): ItemFigures {
  const { rules, issuer, recipient } = input;
  const product = roundCents(item.quantity * item.unitPrice);
  const ipi = rules.ipiCst === null ? 0 : roundCents(product * item.ipiRate);
  const taxed = issuer.taxRegime !== 1 && rules.icmsCode === "00";
  const icmsBase = taxed ? roundCents(product + (rules.finalConsumer && rules.ipiInIcmsBase ? ipi : 0)) : 0;
  const interstate = issuer.uf !== recipient.uf;
  const owesDifal = taxed && interstate && !recipient.taxpayer && rules.finalConsumer;
  return {
    product,
    ipi,
    icmsBase,
    icms: roundCents(icmsBase * input.icmsRate),
    pis: roundCents(product * rules.pisRate),
    cofins: roundCents(product * rules.cofinsRate),
    difalBase: owesDifal ? icmsBase : 0,
    difal: owesDifal ? roundCents(icmsBase * Math.max(0, input.destination.internalIcms - input.icmsRate)) : 0,
    fcp: owesDifal ? roundCents(icmsBase * input.destination.fcp) : 0,
  };
}

export type NfeTotals = { products: number; ipi: number; icmsBase: number; icms: number; pis: number; cofins: number; difal: number; fcp: number; invoice: number };

/** The totals of the invoice: the sum of the items, each already in cents. The invoice total is products plus IPI. */
export function nfeTotals(input: NfeInput): NfeTotals {
  const sum = (pick: (figures: ItemFigures) => number) => roundCents(input.items.reduce((total, item) => total + pick(figuresOf(item, input)), 0));
  const products = sum((figures) => figures.product);
  const ipi = sum((figures) => figures.ipi);
  return {
    products,
    ipi,
    icmsBase: sum((figures) => figures.icmsBase),
    icms: sum((figures) => figures.icms),
    pis: sum((figures) => figures.pis),
    cofins: sum((figures) => figures.cofins),
    difal: sum((figures) => figures.difal),
    fcp: sum((figures) => figures.fcp),
    invoice: roundCents(products + ipi),
  };
}

/** PIS or COFINS of one item: the group depends on the CST. */
function contribution(name: "PIS" | "COFINS", cst: string, base: number, fraction: number, value: number): string {
  const p = name === "PIS" ? "pPIS" : "pCOFINS";
  const v = name === "PIS" ? "vPIS" : "vCOFINS";
  const figures = tag("vBC", money(base)) + tag(p, rate(fraction)) + tag(v, money(value));
  if (cst === "01" || cst === "02") return group(name, group(`${name}Aliq`, tag("CST", cst) + figures));
  if (["04", "05", "06", "07", "08", "09"].includes(cst)) return group(name, group(`${name}NT`, tag("CST", cst)));
  return group(name, group(`${name}Outr`, tag("CST", cst) + figures));
}

function itemXml(item: NfeItem, index: number, input: NfeInput): string {
  const { rules, issuer, recipient } = input;
  const figures = figuresOf(item, input);
  const interstate = issuer.uf !== recipient.uf;
  const cfop = !interstate ? rules.cfopInternal : recipient.taxpayer ? rules.cfopInterstate : rules.cfopInterstateNonTaxpayer;
  const quantity = item.quantity.toFixed(4);
  const unit = item.unitPrice.toFixed(10);

  const product = group(
    "prod",
    tag("cProd", clean(item.code, 60)) +
      tag("cEAN", "SEM GTIN") +
      tag("xProd", input.environment === "homologacao" && index === 0 ? HOMOLOGATION_NAME : clean(item.name, 120)) +
      tag("NCM", item.ncm) +
      tag("CEST", item.cest) +
      tag("CFOP", cfop) +
      tag("uCom", item.unit) +
      tag("qCom", quantity) +
      tag("vUnCom", unit) +
      tag("vProd", money(figures.product)) +
      tag("cEANTrib", "SEM GTIN") +
      tag("uTrib", item.unit) +
      tag("qTrib", quantity) +
      tag("vUnTrib", unit) +
      tag("indTot", "1"),
  );

  const origin = tag("orig", String(item.origin));
  const icms =
    issuer.taxRegime === 1
      ? group("ICMSSN102", origin + tag("CSOSN", rules.icmsCode))
      : rules.icmsCode === "00"
        ? group("ICMS00", origin + tag("CST", "00") + tag("modBC", "3") + tag("vBC", money(figures.icmsBase)) + tag("pICMS", rate(input.icmsRate)) + tag("vICMS", money(figures.icms)))
        : group("ICMS40", origin + tag("CST", rules.icmsCode));

  const ipi =
    rules.ipiCst === null
      ? ""
      : group(
          "IPI",
          tag("cEnq", rules.ipiFrameCode) +
            (["00", "49", "50", "99"].includes(rules.ipiCst)
              ? group("IPITrib", tag("CST", rules.ipiCst) + tag("vBC", money(figures.product)) + tag("pIPI", rate(item.ipiRate)) + tag("vIPI", money(figures.ipi)))
              : group("IPINT", tag("CST", rules.ipiCst))),
        );

  const difal =
    figures.difalBase === 0
      ? ""
      : group(
          "ICMSUFDest",
          tag("vBCUFDest", money(figures.difalBase)) +
            tag("vBCFCPUFDest", money(figures.difalBase)) +
            tag("pFCPUFDest", rate(input.destination.fcp)) +
            tag("pICMSUFDest", rate(input.destination.internalIcms)) +
            tag("pICMSInter", (input.icmsRate * 100).toFixed(2)) +
            tag("pICMSInterPart", "100.0000") +
            tag("vFCPUFDest", money(figures.fcp)) +
            tag("vICMSUFDest", money(figures.difal)) +
            tag("vICMSUFRemet", "0.00"),
        );

  const taxes = group(
    "imposto",
    group("ICMS", icms) +
      ipi +
      contribution("PIS", rules.pisCst, figures.product, rules.pisRate, figures.pis) +
      contribution("COFINS", rules.cofinsCst, figures.product, rules.cofinsRate, figures.cofins) +
      difal,
  );
  return group("det", product + taxes, ` nItem="${index + 1}"`);
}

/**
 * The XML of the invoice, not signed. Throws `NfeError` with everything that is
 * missing: an invoice with a hole never leaves here.
 */
export function buildNfeXml(input: NfeInput): { key: string; xml: string; totals: NfeTotals } {
  const problems = nfeProblems(input);
  if (problems.length > 0) throw new NfeError(problems.join("\n"));

  const { issuer, recipient, rules } = input;
  const key = accessKey(input);
  const totals = nfeTotals(input);
  const interstate = issuer.uf !== recipient.uf;
  const homologation = input.environment === "homologacao";

  const ide = group(
    "ide",
    tag("cUF", UF_CODES[issuer.uf]) +
      tag("cNF", input.randomCode) +
      tag("natOp", clean(rules.operationNature, 60)) +
      tag("mod", "55") +
      tag("serie", input.series) +
      tag("nNF", input.number) +
      tag("dhEmi", input.issuedAt) +
      tag("tpNF", "1") +
      tag("idDest", interstate ? "2" : "1") +
      tag("cMunFG", issuer.cityCode) +
      tag("tpImp", "1") +
      tag("tpEmis", "1") +
      tag("cDV", key[43]) +
      tag("tpAmb", homologation ? "2" : "1") +
      tag("finNFe", "1") +
      tag("indFinal", rules.finalConsumer ? "1" : "0") +
      tag("indPres", "9") +
      tag("indIntermed", "0") +
      tag("procEmi", "0") +
      tag("verProc", clean(input.software, 20)),
  );

  const emit = group(
    "emit",
    tag("CNPJ", issuer.cnpj) + tag("xNome", clean(issuer.legalName, 60)) + address("enderEmit", issuer) + tag("IE", issuer.stateRegistration) + tag("CRT", issuer.taxRegime),
  );

  const dest = group(
    "dest",
    tag(recipient.kind === "PJ" ? "CNPJ" : "CPF", recipient.document) +
      tag("xNome", homologation ? HOMOLOGATION_NAME : clean(recipient.name, 60)) +
      address("enderDest", recipient) +
      tag("indIEDest", recipient.taxpayer ? "1" : "9") +
      tag("IE", recipient.taxpayer ? recipient.stateRegistration : null) +
      tag("email", recipient.email ? clean(recipient.email, 60) : null),
  );

  const hasDifal = totals.difal > 0 || totals.fcp > 0;
  const total = group(
    "total",
    group(
      "ICMSTot",
      tag("vBC", money(totals.icmsBase)) +
        tag("vICMS", money(totals.icms)) +
        tag("vICMSDeson", "0.00") +
        (hasDifal ? tag("vFCPUFDest", money(totals.fcp)) + tag("vICMSUFDest", money(totals.difal)) + tag("vICMSUFRemet", "0.00") : "") +
        tag("vFCP", "0.00") +
        tag("vBCST", "0.00") +
        tag("vST", "0.00") +
        tag("vFCPST", "0.00") +
        tag("vFCPSTRet", "0.00") +
        tag("vProd", money(totals.products)) +
        tag("vFrete", "0.00") +
        tag("vSeg", "0.00") +
        tag("vDesc", "0.00") +
        tag("vII", "0.00") +
        tag("vIPI", money(totals.ipi)) +
        tag("vIPIDevol", "0.00") +
        tag("vPIS", money(totals.pis)) +
        tag("vCOFINS", money(totals.cofins)) +
        tag("vOutro", "0.00") +
        tag("vNF", money(totals.invoice)),
    ),
  );

  const payment = group(
    "pag",
    input.payments
      .map((item) => group("detPag", tag("tPag", item.code) + tag("xPag", item.code === "99" ? clean(item.description ?? "", 60) : null) + tag("vPag", money(item.amount))))
      .join(""),
  );

  const body =
    ide +
    emit +
    dest +
    input.items.map((item, index) => itemXml(item, index, input)).join("") +
    total +
    group("transp", tag("modFrete", "1")) +
    payment +
    group("infAdic", tag("infCpl", rules.additionalInfo ? clean(rules.additionalInfo, 5000) : null));

  const xml = `<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="${NAMESPACE}"><infNFe versao="4.00" Id="NFe${key}">${body}</infNFe></NFe>`;
  return { key, xml, totals };
}

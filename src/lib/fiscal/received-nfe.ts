import { createHash } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { assertFiscalXml } from "@/lib/fiscal/local-layout";
import { ACCESS_KEY_PATTERN } from "@/lib/fiscal/nfe";

export class ReceivedNfeError extends Error {}

export type ReceivedNfeItem = {
  lineNumber: number; supplierCode: string | null; ean: string | null; description: string; ncm: string; cest: string | null;
  cfop: string; commercialUnit: string; quantity: number; unitValue: number; productValue: number; freightValue: number; discountValue: number; otherValue: number;
  insuranceValue: number; icmsValue: number; icmsStValue: number; ipiValue: number; importTaxValue: number; pisValue: number; cofinsValue: number;
};

export type ReceivedNfe = {
  environment: "homologacao" | "producao";
  accessKey: string; xmlSha256: string; xml: string; protocol: string; statusCode: string; issuerDocument: string; issuerName: string;
  recipientDocument: string; number: number; series: number; issuedAt: Date; totalProducts: number; totalInvoice: number; totalFreight: number; totalDiscount: number;
  totalInsurance: number; totalOther: number; totalIcms: number; totalIcmsSt: number; totalIpi: number; totalImportTax: number; totalPis: number; totalCofins: number;
  items: ReceivedNfeItem[];
};

const MAX_XML_BYTES = 2_097_152;
type XmlElement = NonNullable<ReturnType<DOMParser["parseFromString"]>["documentElement"]>;
const child = (node: XmlElement, name: string): XmlElement | null => {
  for (let current = node.firstChild; current; current = current.nextSibling) if (current.nodeType === 1 && (current as XmlElement).localName === name) return current as XmlElement;
  return null;
};
const required = (node: XmlElement, name: string) => {
  const value = child(node, name)?.textContent?.trim() ?? "";
  if (!value) throw new ReceivedNfeError(`XML completo inválido: campo ${name} ausente.`);
  return value;
};
const optional = (node: XmlElement, name: string) => child(node, name)?.textContent?.trim() || null;
const amount = (node: XmlElement, name: string) => {
  const raw = optional(node, name) ?? "0";
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new ReceivedNfeError(`XML completo inválido: valor ${name}.`);
  return value;
};
const directElements = (node: XmlElement, name: string) => {
  const result: XmlElement[] = [];
  for (let current = node.firstChild; current; current = current.nextSibling) if (current.nodeType === 1 && (current as XmlElement).localName === name) result.push(current as XmlElement);
  return result;
};
const descendantAmount = (node: XmlElement | null, name: string) => {
  if (!node) return 0;
  const raw = node.getElementsByTagNameNS("*", name).item(0)?.textContent?.trim() ?? "0";
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new ReceivedNfeError(`XML completo inválido: valor ${name}.`);
  return value;
};

export function parseReceivedNfe(xml: string): ReceivedNfe {
  if (typeof xml !== "string" || Buffer.byteLength(xml, "utf8") > MAX_XML_BYTES || xml.includes("\0") || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new ReceivedNfeError("XML completo recusado: limite de 2 MiB; DTD, entidades e caracteres nulos não são permitidos.");
  }
  const errors: string[] = [];
  const document = new DOMParser({ onError: (level, message) => { if (level !== "warning") errors.push(message); } }).parseFromString(xml, "application/xml");
  if (errors.length || !document.documentElement || document.documentElement.localName === "parsererror") throw new ReceivedNfeError("O XML completo não está bem formado.");
  const root = document.documentElement;
  if (!root.localName || !(["nfeProc", "procNFe"].includes(root.localName))) throw new ReceivedNfeError("Envie o XML completo autorizado (nfeProc), não o resumo resNFe.");
  const nfe = child(root, "NFe");
  const protocolNode = child(root, "protNFe");
  const infoProtocol = protocolNode && child(protocolNode, "infProt");
  const info = nfe && child(nfe, "infNFe");
  if (!nfe || !info || !infoProtocol || !nfe.getElementsByTagNameNS("*", "Signature").length) throw new ReceivedNfeError("XML completo inválido: nota assinada e protocolo são obrigatórios.");
  const statusCode = required(infoProtocol, "cStat");
  if (statusCode !== "100") throw new ReceivedNfeError(`A NF-e não está autorizada para uso (cStat ${statusCode}).`);
  const accessKey = (info.getAttribute("Id") ?? "").replace(/^NFe/, "");
  if (!ACCESS_KEY_PATTERN.test(accessKey) || required(infoProtocol, "chNFe") !== accessKey) throw new ReceivedNfeError("XML completo inválido: chave de acesso divergente.");
  const ide = child(info, "ide"); const issuer = child(info, "emit"); const recipient = child(info, "dest");
  const totalGroup = child(info, "total");
  const total = totalGroup ? child(totalGroup, "ICMSTot") : null;
  if (!ide || !issuer || !recipient || !total) throw new ReceivedNfeError("XML completo inválido: identificação, partes e totais são obrigatórios.");
  const items = directElements(info, "det").map((detail, index) => {
    const product = child(detail, "prod");
    if (!product) throw new ReceivedNfeError(`XML completo inválido: produto ausente no item ${index + 1}.`);
    const lineNumber = Number(detail.getAttribute("nItem"));
    const quantity = Number(required(product, "qCom")); const unitValue = Number(required(product, "vUnCom"));
    if (!Number.isSafeInteger(lineNumber) || lineNumber < 1 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitValue) || unitValue < 0) throw new ReceivedNfeError(`XML completo inválido: quantidade ou valor no item ${index + 1}.`);
    const taxes = child(detail, "imposto");
    return { lineNumber, supplierCode: optional(product, "cProd"), ean: optional(product, "cEAN"), description: required(product, "xProd"), ncm: required(product, "NCM"), cest: optional(product, "CEST"), cfop: required(product, "CFOP"), commercialUnit: required(product, "uCom"), quantity, unitValue, productValue: amount(product, "vProd"), freightValue: amount(product, "vFrete"), insuranceValue: amount(product, "vSeg"), discountValue: amount(product, "vDesc"), otherValue: amount(product, "vOutro"), icmsValue: descendantAmount(taxes, "vICMS"), icmsStValue: descendantAmount(taxes, "vICMSST"), ipiValue: descendantAmount(taxes, "vIPI"), importTaxValue: descendantAmount(taxes, "vII"), pisValue: descendantAmount(taxes, "vPIS"), cofinsValue: descendantAmount(taxes, "vCOFINS") };
  });
  if (!items.length) throw new ReceivedNfeError("XML completo inválido: a NF-e não possui itens.");
  const issuedAt = new Date(required(ide, "dhEmi"));
  if (Number.isNaN(issuedAt.valueOf())) throw new ReceivedNfeError("XML completo inválido: data de emissão.");
  const ideEnvironment = required(ide, "tpAmb");
  const protocolEnvironment = required(infoProtocol, "tpAmb");
  if (!(["1", "2"].includes(ideEnvironment)) || protocolEnvironment !== ideEnvironment) throw new ReceivedNfeError("XML completo inválido: ambiente fiscal divergente.");
  return {
    environment: ideEnvironment === "1" ? "producao" : "homologacao",
    accessKey, xmlSha256: createHash("sha256").update(xml, "utf8").digest("hex"), xml, protocol: required(infoProtocol, "nProt"), statusCode,
    issuerDocument: required(issuer, "CNPJ"), issuerName: required(issuer, "xNome"), recipientDocument: optional(recipient, "CNPJ") ?? required(recipient, "CPF"),
    number: Number(required(ide, "nNF")), series: Number(required(ide, "serie")), issuedAt,
    totalProducts: amount(total, "vProd"), totalInvoice: amount(total, "vNF"), totalFreight: amount(total, "vFrete"), totalInsurance: amount(total, "vSeg"), totalOther: amount(total, "vOutro"), totalDiscount: amount(total, "vDesc"), totalIcms: amount(total, "vICMS"), totalIcmsSt: amount(total, "vST"), totalIpi: amount(total, "vIPI"), totalImportTax: amount(total, "vII"), totalPis: amount(total, "vPIS"), totalCofins: amount(total, "vCOFINS"), items,
  };
}

type LayoutCheck = (xml: string, kind: "nfe") => Promise<void>;
type SignatureCheck = (xml: string) => void;

export function verifyReceivedNfeSignature(xml: string): void {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const nfe = document.getElementsByTagNameNS("*", "NFe").item(0);
  const signature = document.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature").item(0);
  const certificate = document.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "X509Certificate").item(0)?.textContent?.replace(/\s+/g, "") ?? "";
  if (!nfe || !signature || !/^[A-Za-z0-9+/]+=*$/.test(certificate)) throw new ReceivedNfeError("XML completo inválido: assinatura ou certificado ausente.");
  try {
    const checker = new SignedXml({ publicCert: `-----BEGIN CERTIFICATE-----\n${certificate}\n-----END CERTIFICATE-----` });
    checker.loadSignature(new XMLSerializer().serializeToString(signature));
    if (!checker.checkSignature(new XMLSerializer().serializeToString(nfe))) throw new ReceivedNfeError("XML completo inválido: a assinatura digital não confere.");
  } catch (error) {
    if (error instanceof ReceivedNfeError) throw error;
    throw new ReceivedNfeError("XML completo inválido: não foi possível conferir a assinatura digital.");
  }
}

/** Full gate used by imports: structural extraction, official local layout and XML-DSig. */
export async function validateReceivedNfe(
  xml: string,
  dependencies: { layout?: LayoutCheck; signature?: SignatureCheck } = {},
): Promise<ReceivedNfe> {
  const note = parseReceivedNfe(xml);
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const nfe = document.getElementsByTagNameNS("*", "NFe").item(0);
  if (!nfe) throw new ReceivedNfeError("XML completo inválido: NF-e ausente.");
  await (dependencies.layout ?? assertFiscalXml)(new XMLSerializer().serializeToString(nfe), "nfe");
  (dependencies.signature ?? verifyReceivedNfeSignature)(xml);
  return note;
}


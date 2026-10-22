import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Política PAdES AD-RB vigente, lida dos artefatos oficiais do ITI.
 * Nada aqui é digitado à mão: OID, hash e atributos saem dos bytes.
 *
 * Fontes, baixadas em 2026-10-22:
 * - LPA PAdES: http://politicas.icpbrasil.gov.br/LPA_PAdES.der
 *   (página: https://www.gov.br/iti/pt-br/assuntos/repositorio/lista-de-politicas-de-assinatura)
 * - PA: http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3.der
 *   (página: https://www.gov.br/iti/pt-br/assuntos/repositorio/assinatura-digital-com-referencia-basica-ad-rb)
 * - Resumo publicado ao lado da PA: http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3der-sha256.txt
 * - Resumo publicado ao lado da LPA: http://politicas.icpbrasil.gov.br/LPA_PAdES_der-sha256.txt
 *
 * DOC-ICP-15.03, nota 2 da tabela de atributos: o hash que vai no atributo
 * id-aa-ets-sigPolicyId é o hash interno da PA (o OCTET STRING final do DER),
 * não o hash do arquivo publicado na LPA.
 */

const DIR = dirname(fileURLToPath(import.meta.url));

export const LPA_PADES_URL = "http://politicas.icpbrasil.gov.br/LPA_PAdES.der";
export const PA_PADES_AD_RB_URL = "http://politicas.icpbrasil.gov.br/PA_PAdES_AD_RB_v1_3.der";
export const PA_PADES_AD_RB_FILE = "PA_PAdES_AD_RB_v1_3.der";

/** Perfil que este ERP pede ao assinador. É a PA AD-RB v1.3, não AD-RT. */
export const PADES_PROFILE = "ICP-BRASIL-PADES-AD-RB";

/**
 * id-signingTime. Não está na PA: a PA lista só os atributos obrigatórios.
 * Proibido no CMS das assinaturas PAdES (DOC-ICP-15.03, tabela A.14, valor ND).
 * Definição do OID: RFC 5652, seção 11.3.
 */
export const OID_SIGNING_TIME = "1.2.840.113549.1.9.5";

/**
 * id-aa-signatureTimeStampToken. Não está na PA AD-RB v1.3.
 * Definição: RFC 3161 / atributo não assinado do CAdES (RFC 5126).
 * O texto da própria PA AD-RB v1.3 diz que carimbos do tempo não são usados.
 */
export const OID_SIGNATURE_TIME_STAMP_TOKEN = "1.2.840.113549.1.9.16.2.14";

/**
 * id-spq-ets-uri. Qualificador recomendado por DOC-ICP-15.03, nota 1.
 * Definição: RFC 5126, id-spq-ets-uri.
 */
export const OID_SPQ_ETS_URI = "1.2.840.113549.1.9.16.5.1";

/** id-data, o content-type de uma assinatura destacada. RFC 5652, seção 4. */
export const OID_DATA = "1.2.840.113549.1.7.1";
/** id-signedData. RFC 5652, seção 3. */
export const OID_SIGNED_DATA = "1.2.840.113549.1.7.2";

type Tlv = { tag: number; start: number; content: number; length: number; end: number };

const readLength = (buf: Buffer, off: number): { length: number; header: number } => {
  const first = buf[off];
  if (first < 0x80) return { length: first, header: 1 };
  const bytes = first & 0x7f;
  return { length: Number(buf.readUIntBE(off + 1, bytes)), header: 1 + bytes };
};

const tlvAt = (buf: Buffer, off: number): Tlv => {
  const tag = buf[off];
  const { length, header } = readLength(buf, off + 1);
  const content = off + 1 + header;
  return { tag, start: off, content, length, end: content + length };
};

const oidOf = (buf: Buffer, content: number, length: number): string => {
  const body = buf.subarray(content, content + length);
  const parts = [String(Math.floor(body[0] / 40)), String(body[0] % 40)];
  let value = 0;
  for (const byte of body.subarray(1)) {
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      parts.push(String(value));
      value = 0;
    }
  }
  return parts.join(".");
};

const children = (buf: Buffer, node: Tlv): Tlv[] => {
  const out: Tlv[] = [];
  let at = node.content;
  while (at < node.end) {
    const child = tlvAt(buf, at);
    out.push(child);
    at = child.end;
  }
  return out;
};

const utf8 = (buf: Buffer, node: Tlv) => buf.subarray(node.content, node.end).toString("utf8");

export type PadesAdRbPolicy = {
  /** OID da PA, lido do DER da política e conferido na entrada da LPA. */
  oid: string;
  /** URI da PA, lida da entrada correspondente na LPA. */
  uri: string;
  /** SHA-256 do arquivo da PA, como a LPA publica. Não entra na assinatura. */
  lpaSha256: string;
  /** Hash interno (signPolicyHash) da PA. É este que o sigPolicyId carrega. */
  internalSha256: string;
  /** OID do algoritmo desse hash, lido do cabeçalho da PA. */
  hashAlgorithmOid: string;
  /** OIDs dos atributos assinados obrigatórios, na ordem em que a PA os lista. */
  mandatedAttributeOids: string[];
  /** Entradas do dicionário de assinatura exigidas pela extensão 2.16.76.1.8.1 da PA. */
  pdfDictionary: Record<string, string>;
  /** Texto do campo de aplicação, de onde se lê que AD-RB não usa carimbo. */
  fieldOfApplication: string;
  validFrom: string;
  validTo: string;
};

const parsePolicy = (pa: Buffer, lpa: Buffer): PadesAdRbPolicy => {
  const root = tlvAt(pa, 0);
  const [hashAlg, info, hash] = children(pa, root);
  if (!hashAlg || !info || !hash || hash.tag !== 0x04 || hash.length !== 32) {
    throw new Error("PA PAdES AD-RB: estrutura inesperada.");
  }
  const hashAlgorithmOid = oidOf(pa, children(pa, hashAlg)[0].content, children(pa, hashAlg)[0].length);
  const infoChildren = children(pa, info);
  const oid = oidOf(pa, infoChildren[0].content, infoChildren[0].length);
  const utf8Nodes: Tlv[] = [];
  const sequencesOfOids: string[][] = [];
  const visitInfo = (node: Tlv): void => {
    if (node.tag === 0x0c) utf8Nodes.push(node);
    if (node.tag === 0x04 && node.length > 16 && pa[node.content] === 0x30) {
      // Extensão de dicionário PDF vem num OCTET STRING que é outro DER.
      visitInfo(tlvAt(pa, node.content));
    }
    if ((node.tag & 0x20) !== 0) {
      const kids = children(pa, node);
      if (kids.length >= 4 && kids.every((kid) => kid.tag === 0x06)) {
        sequencesOfOids.push(kids.map((kid) => oidOf(pa, kid.content, kid.length)));
      }
      for (const kid of kids) visitInfo(kid);
    }
  };
  visitInfo(info);
  const fieldOfApplication = utf8Nodes.map((node) => utf8(pa, node)).find((text) => text.includes("carimbo")) ?? "";
  const required = sequencesOfOids.find((oids) => oids.length === 4 && oids.every((value) => value.startsWith("1.2.840.113549.1.9.")));
  if (!required) throw new Error("PA PAdES AD-RB: atributos obrigatórios não encontrados.");

  const pdfDictionary: Record<string, string> = {};
  const collectPairs = (node: Tlv): void => {
    if ((node.tag & 0x20) !== 0) {
      const kids = children(pa, node);
      if (kids.length === 2 && kids[0].tag === 0x0c && kids[1].tag === 0x04) {
        const key = utf8(pa, kids[0]);
        const inner = tlvAt(pa, kids[1].content);
        if (inner.tag === 0x0c) pdfDictionary[key] = utf8(pa, inner);
      }
      for (const kid of kids) collectPairs(kid);
    } else if (node.tag === 0x04 && node.length > 16 && pa[node.content] === 0x30) {
      collectPairs(tlvAt(pa, node.content));
    }
  };
  collectPairs(info);

  const lpaRoot = children(lpa, tlvAt(lpa, 0))[0];
  let uri = "";
  let lpaSha256 = "";
  let validFrom = "";
  let validTo = "";
  for (const entry of children(lpa, lpaRoot)) {
    const texts: string[] = [];
    const oids: string[] = [];
    const hashes: string[] = [];
    const times: string[] = [];
    const visit = (node: Tlv): void => {
      if (node.tag === 0x16) texts.push(lpa.subarray(node.content, node.end).toString("ascii"));
      if (node.tag === 0x06) oids.push(oidOf(lpa, node.content, node.length));
      if (node.tag === 0x04 && node.length === 32) hashes.push(lpa.subarray(node.content, node.end).toString("hex"));
      if (node.tag === 0x18) times.push(lpa.subarray(node.content, node.end).toString("ascii"));
      if ((node.tag & 0x20) !== 0) for (const child of children(lpa, node)) visit(child);
    };
    visit(entry);
    if (texts.some((value) => value.endsWith(PA_PADES_AD_RB_FILE)) && oids.includes(oid)) {
      uri = texts.find((value) => value.endsWith(PA_PADES_AD_RB_FILE)) ?? "";
      lpaSha256 = hashes[0] ?? "";
      validFrom = times[0] ?? "";
      validTo = times[1] ?? "";
    }
  }
  if (uri === "" || lpaSha256.length !== 64) throw new Error("LPA PAdES: entrada da PA AD-RB v1.3 não encontrada.");
  if (!pdfDictionary.Filter || !pdfDictionary.SubFilter) throw new Error("PA PAdES AD-RB: Filter/SubFilter ausentes.");
  return {
    oid, uri, lpaSha256, internalSha256: pa.subarray(hash.content, hash.end).toString("hex"), hashAlgorithmOid,
    mandatedAttributeOids: required, pdfDictionary, fieldOfApplication, validFrom, validTo,
  };
};

let cached: PadesAdRbPolicy | null = null;

/** A política vigente, parseada dos DER versionados ao lado deste arquivo. */
export function padesAdRbPolicy(): PadesAdRbPolicy {
  if (cached) return cached;
  const pa = readFileSync(join(DIR, PA_PADES_AD_RB_FILE));
  const lpa = readFileSync(join(DIR, "LPA_PAdES.der"));
  cached = parsePolicy(pa, lpa);
  return cached;
}

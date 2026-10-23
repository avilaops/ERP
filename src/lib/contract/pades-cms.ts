import { createHash, createPrivateKey } from "node:crypto";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import {
  OID_DATA, OID_SIGNATURE_TIME_STAMP_TOKEN, OID_SIGNED_DATA, OID_SIGNING_TIME, OID_SPQ_ETS_URI, padesAdRbPolicy,
} from "@/lib/contract/icp/lpa";

/**
 * CMS destacado no perfil PAdES AD-RB da ICP-Brasil.
 * A montagem usa PKIjs (CMS/CAdES maduro, RFC 5652) em vez do PKCS#7 do node-forge,
 * que não codifica signingCertificateV2 nem sigPolicyId.
 *
 * Atributos assinados, na ordem exigida pela PA (os OIDs vêm do DER):
 * content-type, message-digest, signingCertificateV2 (RFC 5035) e sigPolicyId.
 * id-signingTime não entra. Carimbo do tempo não entra: o texto da PA AD-RB v1.3
 * diz que este perfil não usa carimbo.
 */

export type PadesCmsMaterial = {
  /** Chave privada PKCS#8 ou PKCS#1, PEM. Não é registrada em log. */
  privateKeyPem: string;
  /** Certificado do signatário, DER. */
  certificateDer: Uint8Array;
  /** Intermediárias e raiz, DER, sem repetir o certificado do signatário. */
  chainDer: Uint8Array[];
  /** Quando verdadeiro, inclui id-signingTime. Só para o teste do atributo proibido. */
  includeSigningTime?: boolean;
  /** Quando verdadeiro, inclui o carimbo. AD-RB vigente não usa. */
  includeTimeStampToken?: boolean;
  /** Substitui o hash da política. Só para o teste de política trocada. */
  policyHashHex?: string;
  /** Tira o signingCertificateV2. Só para o teste do atributo ausente. */
  omitSigningCertificate?: boolean;
};

export type ParsedPadesCms = {
  attributeOids: string[];
  policyOid: string | null;
  policyHashHex: string | null;
  certificateDers: Uint8Array[];
};

const bytesOf = (value: ArrayBuffer | Uint8Array): Uint8Array =>
  value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);

const derBuffer = (value: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
};

const rsaKey = async (pem: string): Promise<CryptoKey> => {
  const jwk = createPrivateKey(pem).export({ format: "jwk" });
  return crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
};

const compareDer = (left: Uint8Array, right: Uint8Array): number => {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) if (left[index] !== right[index]) return left[index] - right[index];
  return left.length - right.length;
};

const algorithm = (oid: string) => new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: oid })] });

const signingCertificateV2 = (certificate: pkijs.Certificate, der: Uint8Array): asn1js.Sequence => {
  const hash = createHash("sha256").update(der).digest();
  const directoryName = new asn1js.Constructed({
    idBlock: { tagClass: 3, tagNumber: 4 },
    value: [certificate.issuer.toSchema()],
  });
  return new asn1js.Sequence({
    value: [
      new asn1js.Sequence({
        value: [
          new asn1js.Sequence({
            value: [
              algorithm(padesAdRbPolicy().hashAlgorithmOid),
              new asn1js.OctetString({ valueHex: hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength) }),
              new asn1js.Sequence({
                value: [new asn1js.Sequence({ value: [directoryName] }), certificate.serialNumber],
              }),
            ],
          }),
        ],
      }),
    ],
  });
};

const signaturePolicy = (hashHex: string): asn1js.Sequence => {
  const policy = padesAdRbPolicy();
  const hash = Buffer.from(hashHex, "hex");
  return new asn1js.Sequence({
    value: [
      new asn1js.ObjectIdentifier({ value: policy.oid }),
      new asn1js.Sequence({
        value: [
          algorithm(policy.hashAlgorithmOid),
          new asn1js.OctetString({ valueHex: hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength) }),
        ],
      }),
      new asn1js.Sequence({
        value: [
          new asn1js.Sequence({
            value: [
              new asn1js.ObjectIdentifier({ value: OID_SPQ_ETS_URI }),
              new asn1js.IA5String({ value: policy.uri }),
            ],
          }),
        ],
      }),
    ],
  });
};

const attribute = (oid: string, value: asn1js.AsnType) => new pkijs.Attribute({ type: oid, values: [value] });

/** CMS destacado (ContentInfo/SignedData) sobre `content`. A cadeia inteira vai no SignedData. */
export async function buildDetachedPades(content: Uint8Array, material: PadesCmsMaterial): Promise<Uint8Array> {
  const policy = padesAdRbPolicy();
  const [contentType, messageDigest, signingCertificateOid, policyOid] = policy.mandatedAttributeOids;
  const certificate = pkijs.Certificate.fromBER(derBuffer(material.certificateDer));
  const chain = material.chainDer.map((der) => pkijs.Certificate.fromBER(derBuffer(der)));
  const digest = createHash("sha256").update(content).digest();
  const attributes = [
    attribute(contentType, new asn1js.ObjectIdentifier({ value: OID_DATA })),
    attribute(messageDigest, new asn1js.OctetString({ valueHex: digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength) })),
  ];
  if (!material.omitSigningCertificate) attributes.push(attribute(signingCertificateOid, signingCertificateV2(certificate, material.certificateDer)));
  attributes.push(attribute(policyOid, signaturePolicy(material.policyHashHex ?? policy.internalSha256)));
  if (material.includeSigningTime) attributes.push(attribute(OID_SIGNING_TIME, new asn1js.UTCTime({ valueDate: new Date() })));
  if (material.includeTimeStampToken) attributes.push(attribute(OID_SIGNATURE_TIME_STAMP_TOKEN, new asn1js.Null()));
  const encoded = attributes.map((item) => ({ item, der: bytesOf(item.toSchema().toBER(false)) }));
  encoded.sort((left, right) => compareDer(left.der, right.der));

  const signed = new pkijs.SignedData({
    version: 3,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: OID_DATA }),
    certificates: [certificate, ...chain],
    signerInfos: [
      new pkijs.SignerInfo({
        version: 1,
        sid: new pkijs.IssuerAndSerialNumber({ issuer: certificate.issuer, serialNumber: certificate.serialNumber }),
        signedAttrs: new pkijs.SignedAndUnsignedAttributes({ type: 0, attributes: encoded.map((entry) => entry.item) }),
      }),
    ],
  });
  await signed.sign(await rsaKey(material.privateKeyPem), 0, "SHA-256", derBuffer(content));
  const info = new pkijs.ContentInfo({ contentType: OID_SIGNED_DATA, content: signed.toSchema(true) });
  return bytesOf(info.toSchema().toBER(false));
}

const contentInfo = (cms: Uint8Array): pkijs.SignedData => {
  const asn1 = asn1js.fromBER(derBuffer(cms));
  if (asn1.offset === -1) throw new Error("CMS inválido.");
  const info = new pkijs.ContentInfo({ schema: asn1.result });
  if (info.contentType !== OID_SIGNED_DATA) throw new Error("CMS sem SignedData.");
  return new pkijs.SignedData({ schema: info.content });
};

/** Lê os atributos e os certificados de um CMS. Não valida a criptografia: isso é o OpenSSL. */
export function parsePadesCms(cms: Uint8Array): ParsedPadesCms {
  const signed = contentInfo(cms);
  const signer = signed.signerInfos[0];
  if (!signer?.signedAttrs) return { attributeOids: [], policyOid: null, policyHashHex: null, certificateDers: [] };
  const attributeOids = [
    ...signer.signedAttrs.attributes.map((item) => item.type),
    ...(signer.unsignedAttrs?.attributes.map((item) => item.type) ?? []),
  ];
  const policyAttribute = signer.signedAttrs.attributes.find((item) => item.type === padesAdRbPolicy().mandatedAttributeOids[3]);
  let policyOid: string | null = null;
  let policyHashHex: string | null = null;
  const policyValue = policyAttribute?.values[0];
  if (policyValue instanceof asn1js.Sequence) {
    const [oid, hashSeq] = policyValue.valueBlock.value;
    if (oid instanceof asn1js.ObjectIdentifier) policyOid = oid.getValue();
    if (hashSeq instanceof asn1js.Sequence) {
      const hash = hashSeq.valueBlock.value[1];
      if (hash instanceof asn1js.OctetString) policyHashHex = Buffer.from(bytesOf(hash.valueBlock.valueHexView)).toString("hex");
    }
  }
  const certificateDers = (signed.certificates ?? []).flatMap((item) => item instanceof pkijs.Certificate ? [bytesOf(item.toSchema().toBER(false))] : []);
  return { attributeOids, policyOid, policyHashHex, certificateDers };
}

/** A cadeia está completa quando o signatário alcança um certificado autoassinado só com o que o CMS traz. */
export function chainComplete(certificateDers: Uint8Array[], signerFingerprint: string): boolean {
  const parsed = certificateDers.map((der) => ({ der, certificate: pkijs.Certificate.fromBER(derBuffer(der)) }));
  const signer = parsed.find((item) => createHash("sha256").update(item.der).digest("hex") === signerFingerprint);
  if (!signer) return false;
  const name = (value: pkijs.RelativeDistinguishedNames) => Buffer.from(bytesOf(value.toSchema().toBER(false))).toString("hex");
  let current = signer.certificate;
  const seen = new Set<string>();
  for (let depth = 0; depth < parsed.length + 1; depth += 1) {
    const issuer = name(current.issuer);
    const subject = name(current.subject);
    if (issuer === subject) return true;
    if (seen.has(subject)) return false;
    seen.add(subject);
    const parent = parsed.find((item) => name(item.certificate.subject) === issuer);
    if (!parent) return false;
    current = parent.certificate;
  }
  return false;
}

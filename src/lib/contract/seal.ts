import forge from "node-forge";
import { PDFArray, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from "pdf-lib";
import { padesAdRbPolicy } from "@/lib/contract/icp/lpa";
import { buildDetachedPades } from "@/lib/contract/pades-cms";
import { appendDss } from "@/lib/contract/pades-dss";
import type { SigningKey } from "@/lib/fiscal/sign";

/**
 * The company's signature on a PDF, in the ICP-Brasil PAdES AD-RB profile
 * (Filter and SubFilter come from the official PA). The CMS is detached.
 * Bytes inside the ByteRange are what was signed. CRL and OCSP, when given,
 * go in a later increment (the PDF DSS), so they do not change those bytes.
 * The signature widget is invisible: the sheets look the same.
 */

/** Room kept for the CMS. The chain, the policy and the signing certificate need more than the old PKCS#7. */
const SIGNATURE_BYTES = 32_768;
const MARK = "**********";

export type SealInfo = {
  /** Who signs: the name on the certificate. */
  name: string;
  reason: string;
  location?: string | null;
  at: Date;
};

/** The name of the holder of a certificate (its CN), as the record of signatures shows it. */
export function certificateHolder(key: SigningKey): string {
  const certificate = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.decode64(key.certificateBase64)));
  return String(certificate.subject.getField("CN")?.value ?? "");
}

export type SealExtras = {
  /** CRL DER da AC de teste ou da cadeia real. Vai para o DSS, fora do ByteRange. */
  crl?: Uint8Array | null;
  /** OCSP basic response DER. Vai para o DSS junto com a CRL. */
  ocsp?: Uint8Array | null;
  /** Troca o CMS de propósito. Os testes de atributo incompatível usam isto. */
  cms?: (content: Uint8Array) => Promise<Uint8Array>;
};

export async function sealPdf(pdf: Uint8Array, key: SigningKey, info: SealInfo, extras: SealExtras = {}): Promise<Uint8Array> {
  const document = await PDFDocument.load(pdf);
  const context = document.context;

  // The signature with its place still empty: the ranges and the content are written after the file has its final size.
  const range = PDFArray.withContext(context);
  range.push(PDFNumber.of(0));
  for (let index = 0; index < 3; index += 1) range.push(PDFName.of(MARK));
  const signature = context.register(
    context.obj({
      Type: "Sig",
      Filter: padesAdRbPolicy().pdfDictionary.Filter,
      SubFilter: padesAdRbPolicy().pdfDictionary.SubFilter,
      ByteRange: range,
      Contents: PDFHexString.of("0".repeat(SIGNATURE_BYTES * 2)),
      Name: PDFString.of(info.name),
      Reason: PDFString.of(info.reason),
      ...(info.location ? { Location: PDFString.of(info.location) } : {}),
      M: PDFString.fromDate(info.at),
    }),
  );
  const [page] = document.getPages();
  const widget = context.register(context.obj({ Type: "Annot", Subtype: "Widget", FT: "Sig", Rect: [0, 0, 0, 0], V: signature, T: PDFString.of("AssinaturaDaEmpresa"), F: 132, P: page.ref }));
  const annotations = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray) ?? PDFArray.withContext(context);
  annotations.push(widget);
  page.node.set(PDFName.of("Annots"), annotations);
  document.catalog.set(PDFName.of("AcroForm"), context.obj({ SigFlags: 3, Fields: [widget] }));

  const bytes = Buffer.from(await document.save({ useObjectStreams: false }));
  const placeholder = `/ByteRange [ 0 /${MARK} /${MARK} /${MARK} ]`;
  const rangeAt = bytes.indexOf(placeholder, 0, "latin1");
  const zeros = `<${"0".repeat(SIGNATURE_BYTES * 2)}>`;
  const start = bytes.indexOf(zeros, 0, "latin1");
  if (rangeAt < 0 || start < 0) throw new Error("O lugar da assinatura não foi encontrado no PDF gerado.");
  const end = start + zeros.length;
  const actual = `/ByteRange [0 ${start} ${end} ${bytes.length - end}]`;
  bytes.write(actual.padEnd(placeholder.length, " "), rangeAt, "latin1");

  // What is signed is everything but the room of the signature itself.
  const signed = Buffer.concat([bytes.subarray(0, start), bytes.subarray(end)]);
  const certificateDer = Buffer.from(key.certificateBase64, "base64");
  const chainDer = (key.certificateChainBase64 ?? []).map((der) => Buffer.from(der, "base64"));
  const der = Buffer.from(extras.cms
    ? await extras.cms(signed)
    : await buildDetachedPades(signed, { privateKeyPem: key.privateKeyPem, certificateDer, chainDer }));
  if (der.length > SIGNATURE_BYTES) throw new Error("A assinatura não coube no lugar reservado para ela.");
  bytes.write(der.toString("hex").padEnd(SIGNATURE_BYTES * 2, "0"), start + 1, "latin1");
  const sealed = new Uint8Array(bytes);
  if (!extras.crl && !extras.ocsp) return sealed;
  return appendDss(sealed, {
    certificates: [certificateDer, ...chainDer],
    crl: extras.crl ?? null,
    ocsp: extras.ocsp ?? null,
    signature: der,
  });
}

/** Where the signature of a sealed PDF is and what it covers. `null` for a file that is not sealed. For tests and conference. */
export function sealOf(pdf: Uint8Array): { range: [number, number, number, number]; signed: Buffer; signature: Buffer } | null {
  const bytes = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  const match = /\/ByteRange \[(\d+) (\d+) (\d+) (\d+)\]/.exec(bytes.toString("latin1"));
  if (!match) return null;
  const range = match.slice(1).map(Number) as [number, number, number, number];
  const hex = bytes.toString("latin1", range[1] + 1, range[2] - 1).replace(/(00)+$/, "");
  return { range, signed: Buffer.concat([bytes.subarray(range[0], range[0] + range[1]), bytes.subarray(range[2], range[2] + range[3])]), signature: Buffer.from(hex, "hex") };
}

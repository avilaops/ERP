import { createHash } from "node:crypto";

/**
 * Dicionário DSS/VRI acrescentado num incremento, fora do ByteRange.
 * DOC-ICP-15.03, tabelas A.19, A.20 e A.22: para AD-RB o DSS é permitido;
 * se existe, o VRI existe, e CRL ou OCSP tem de estar nele.
 * ETSI EN 319 142: o DSS vem depois da assinatura, senão o hash do VRI
 * (SHA-1 do CMS) não fecha.
 */

export type DssMaterial = {
  /** DER dos certificados da cadeia, do signatário até a raiz. */
  certificates: Uint8Array[];
  crl: Uint8Array | null;
  ocsp: Uint8Array | null;
  /** CMS já gravado em /Contents. A chave do VRI é o SHA-1 dele. */
  signature: Uint8Array;
};

const ascii = (value: string) => Buffer.from(value, "latin1");

/** Localiza o trailer da última revisão e devolve Size, Root e o offset do xref. */
const trailerOf = (pdf: Buffer): { size: number; root: number; startxref: number } => {
  const marker = pdf.lastIndexOf(ascii("startxref"));
  if (marker < 0) throw new Error("PDF sem startxref.");
  const startxref = Number(/(\d+)/.exec(pdf.toString("latin1", marker, marker + 40))?.[1]);
  const trailerAt = pdf.indexOf(ascii("trailer"), startxref);
  if (!Number.isInteger(startxref) || trailerAt < 0) throw new Error("PDF sem trailer.");
  const trailer = pdf.toString("latin1", trailerAt, Math.min(pdf.length, trailerAt + 500));
  const size = Number(/\/Size\s+(\d+)/.exec(trailer)?.[1]);
  const root = Number(/\/Root\s+(\d+)\s+0\s+R/.exec(trailer)?.[1]);
  if (!size || !root) throw new Error("Trailer PDF sem /Size ou /Root.");
  return { size, root, startxref };
};

const objectBody = (pdf: Buffer, number: number): string => {
  const token = `${number} 0 obj`;
  const at = pdf.lastIndexOf(ascii(token));
  if (at < 0) throw new Error(`Objeto ${number} não encontrado no PDF.`);
  const end = pdf.indexOf(ascii("endobj"), at);
  return pdf.toString("latin1", at + token.length, end);
};

const streamObject = (number: number, bytes: Uint8Array): Buffer => {
  const header = ascii(`${number} 0 obj\n<< /Length ${bytes.byteLength} >>\nstream\n`);
  const footer = ascii("\nendstream\nendobj\n");
  return Buffer.concat([header, Buffer.from(bytes), footer]);
};

/**
 * Acrescenta o DSS sem mexer nos bytes que a assinatura cobre.
 * O caller conferiu antes que o ByteRange termina exatamente no fim atual do arquivo.
 */
export function appendDss(pdf: Uint8Array, material: DssMaterial): Uint8Array {
  if (!material.crl && !material.ocsp) throw new Error("DSS sem CRL e sem OCSP.");
  const source = Buffer.from(pdf);
  const trailer = trailerOf(source);
  const catalog = objectBody(source, trailer.root);
  const dictionaryEnd = catalog.lastIndexOf(">>");
  if (dictionaryEnd < 0 || !catalog.includes("<<")) throw new Error("Catálogo PDF sem dicionário.");
  let next = trailer.size;
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let cursor = source.length + (source[source.length - 1] === 0x0a ? 0 : 1);
  const push = (object: Buffer) => {
    offsets.push(cursor);
    chunks.push(object);
    cursor += object.length;
  };
  if (source[source.length - 1] !== 0x0a) chunks.push(ascii("\n"));

  const certRefs: string[] = [];
  for (const certificate of material.certificates) {
    const number = next;
    next += 1;
    certRefs.push(`${number} 0 R`);
    push(streamObject(number, certificate));
  }
  const crlRefs: string[] = [];
  if (material.crl) {
    const number = next;
    next += 1;
    crlRefs.push(`${number} 0 R`);
    push(streamObject(number, material.crl));
  }
  const ocspRefs: string[] = [];
  if (material.ocsp) {
    const number = next;
    next += 1;
    ocspRefs.push(`${number} 0 R`);
    push(streamObject(number, material.ocsp));
  }
  const vri = next;
  next += 1;
  const vriBody =
    `<< /Type /VRI` +
    ` /Cert [${certRefs.join(" ")}]` +
    (crlRefs.length ? ` /CRL [${crlRefs.join(" ")}]` : "") +
    (ocspRefs.length ? ` /OCSP [${ocspRefs.join(" ")}]` : "") +
    ` >>`;
  push(ascii(`${vri} 0 obj\n${vriBody}\nendobj\n`));
  const dss = next;
  next += 1;
  const vriKey = createHash("sha1").update(material.signature).digest("hex").toUpperCase();
  const dssBody =
    `<< /Type /DSS /Certs [${certRefs.join(" ")}]` +
    (crlRefs.length ? ` /CRLs [${crlRefs.join(" ")}]` : "") +
    (ocspRefs.length ? ` /OCSPs [${ocspRefs.join(" ")}]` : "") +
    ` /VRI << /${vriKey} ${vri} 0 R >> >>`;
  push(ascii(`${dss} 0 obj\n${dssBody}\nendobj\n`));
  const catalogNumber = next;
  next += 1;
  const catalogBody = `${catalog.slice(0, dictionaryEnd)} /DSS ${dss} 0 R ${catalog.slice(dictionaryEnd)}`;
  push(ascii(`${catalogNumber} 0 obj\n${catalogBody}\nendobj\n`));

  const xrefAt = cursor;
  const rows = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`);
  const xref =
    `xref\n${trailer.size} ${next - trailer.size}\n${rows.join("")}` +
    `trailer\n<< /Size ${next} /Prev ${trailer.startxref} /Root ${catalogNumber} 0 R >>\n` +
    `startxref\n${xrefAt}\n%%EOF\n`;
  push(ascii(xref));
  return new Uint8Array(Buffer.concat([source, ...chunks]));
}

/** O incremento depois do ByteRange ainda tem um DSS com CRL ou OCSP e a chave VRI do CMS. */
export function dssProblems(pdf: Uint8Array, signature: Uint8Array, signedEnd: number): string[] {
  if (signedEnd > pdf.length) return ["ByteRange passa do fim do PDF."];
  const tail = Buffer.from(pdf.subarray(signedEnd)).toString("latin1");
  if (signedEnd < pdf.length && !tail.includes("/Type /DSS")) return ["Revisão posterior sem dicionário DSS."];
  const problems: string[] = [];
  const body = Buffer.from(pdf).toString("latin1");
  if (!body.includes("/Type /DSS")) problems.push("PDF sem dicionário DSS.");
  if (!body.includes("/Type /VRI")) problems.push("PDF sem dicionário VRI.");
  if (!body.includes("/CRL") && !body.includes("/OCSP")) problems.push("DSS sem CRL e sem OCSP.");
  const key = createHash("sha1").update(signature).digest("hex").toUpperCase();
  if (!body.includes(`/${key}`)) problems.push("VRI não aponta para esta assinatura.");
  return problems;
}

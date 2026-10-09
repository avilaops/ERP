import { inflateRawSync } from "node:zlib";

/** A refusal the user can act on. The message goes to the screen as it is. */
export class ContractFileError extends Error {}

/** A model in Word is a few pages of text: anything far from that is not one. */
export const MAX_MODEL_BYTES = 2 * 1024 * 1024;
const MAX_XML_BYTES = 8 * 1024 * 1024;

const NOT_WORD = "Não foi possível ler o arquivo como um documento do Word. Envie o contrato em .docx (Word 2007 ou mais novo) ou em .txt.";

/**
 * One file of a .docx (which is a ZIP), by its name. Reads the directory at
 * the end of the file and inflates only the entry asked for, never more than
 * `MAX_XML_BYTES`: a file made to blow up when opened is refused, not opened.
 */
function zipEntry(bytes: Uint8Array, name: string): Buffer | null {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: its signature, searched from the end (a comment may follow it).
  let end = -1;
  for (let at = data.length - 22; at >= Math.max(0, data.length - 65_557); at -= 1) {
    if (data.readUInt32LE(at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) return null;
  const count = data.readUInt16LE(end + 10);
  let at = data.readUInt32LE(end + 16);
  for (let index = 0; index < count && at + 46 <= data.length; index += 1) {
    if (data.readUInt32LE(at) !== 0x02014b50) return null;
    const method = data.readUInt16LE(at + 10);
    const packed = data.readUInt32LE(at + 20);
    const size = data.readUInt32LE(at + 24);
    const nameLength = data.readUInt16LE(at + 28);
    const extraLength = data.readUInt16LE(at + 30);
    const commentLength = data.readUInt16LE(at + 32);
    const local = data.readUInt32LE(at + 42);
    const entry = data.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (entry !== name) continue;
    if (size > MAX_XML_BYTES || local + 30 > data.length || data.readUInt32LE(local) !== 0x04034b50) return null;
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    const body = data.subarray(start, start + packed);
    if (method === 0) return body.length <= MAX_XML_BYTES ? body : null;
    if (method !== 8) return null;
    try {
      return inflateRawSync(body, { maxOutputLength: MAX_XML_BYTES });
    } catch {
      return null;
    }
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (text: string) =>
  text.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|amp|lt|gt|quot|apos);/g, (_match, code: string) =>
    code.startsWith("#") ? String.fromCodePoint(Math.min(0x10ffff, code[1] === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1)))) : ENTITIES[code],
  );

/**
 * The text of a contract written in Word, as the model of the ERP writes it:
 * one paragraph per line with an empty line between them, a heading as `# `,
 * an item of a list as `- `. Formatting (bold, fonts, tables' borders, images)
 * is left behind: the contract of the ERP is text, drawn by the ERP.
 */
export function docxText(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_MODEL_BYTES) throw new ContractFileError("Arquivo grande demais para um modelo de contrato: o limite é 2 MB.");
  const xml = zipEntry(bytes, "word/document.xml")?.toString("utf8");
  if (!xml) throw new ContractFileError(NOT_WORD);
  const lines: string[] = [];
  for (const [, paragraph] of xml.matchAll(/<w:p[ >]([\s\S]*?)<\/w:p>/g)) {
    // Only what is inside <w:t> is text, plus tabs and line breaks; field codes, deleted text and drawings are left out.
    let raw = "";
    for (const [piece, run] of paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>/g)) {
      raw += run !== undefined ? run : piece.startsWith("<w:tab") ? " " : "\n";
    }
    const text = decode(raw)
      .replace(/[ \t\u00a0]+/g, " ")
      .trim();
    if (text === "") continue;
    const heading = /<w:pStyle w:val="(Heading|Ttulo|Titulo|Title)[^"]*"/i.test(paragraph);
    const item = /<w:numPr>/.test(paragraph);
    for (const line of text.split("\n").map((part) => part.trim()).filter(Boolean)) lines.push(heading ? `# ${line}` : item ? `- ${line}` : line);
  }
  if (lines.length === 0) throw new ContractFileError("O documento não tem texto. Confira se é o arquivo certo.");
  // Items of a list stay together; everything else is a paragraph of its own.
  return lines.reduce((whole, line, index) => whole + (index === 0 ? "" : line.startsWith("- ") && lines[index - 1].startsWith("- ") ? "\n" : "\n\n") + line, "");
}

/** The text of a model sent as a file: Word, or plain text as it is. */
export function modelText(bytes: Uint8Array, fileName: string): string {
  if (bytes.byteLength === 0) throw new ContractFileError("O arquivo está vazio.");
  if (bytes.byteLength > MAX_MODEL_BYTES) throw new ContractFileError("Arquivo grande demais para um modelo de contrato: o limite é 2 MB.");
  if (/\.txt$/i.test(fileName)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
    if (text === "" || text.includes("\u0000")) throw new ContractFileError("O arquivo de texto não pôde ser lido. Salve como texto simples (UTF-8) e envie de novo.");
    return text;
  }
  if (/\.doc$/i.test(fileName)) throw new ContractFileError("Arquivo .doc (Word antigo) não é lido. Abra no Word, use Salvar como → Documento do Word (.docx) e envie de novo.");
  if (/\.pdf$/i.test(fileName)) throw new ContractFileError("PDF não serve de modelo, porque o sistema não consegue preencher os dados nele. Envie o .docx; para mandar um PDF pronto, use o pedido.");
  return docxText(bytes);
}

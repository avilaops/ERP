/**
 * Reads a message as it comes from a mail server (RFC 5322 with MIME) for the
 * little the ERP wants of it: who sent, about what, when, and the text the
 * person wrote. Pure, and forgiving: a message it cannot read comes back with
 * empty fields, never as an error.
 */
export type ParsedMail = {
  /** The address of who sent, in lowercase. */
  from: string | null;
  fromName: string | null;
  subject: string;
  date: Date | null;
  messageId: string | null;
  /** The text the person wrote, without the message quoted under it. */
  text: string;
  /** An automatic answer (out of office, a bounce, a list): nobody wrote it. */
  automatic: boolean;
};

const decoder = (charset: string) => {
  const name = charset.trim().toLowerCase().replace(/^(iso-8859-1|latin1|us-ascii|ascii)$/, "windows-1252");
  try {
    return new TextDecoder(name);
  } catch {
    return new TextDecoder("utf-8");
  }
};

/** The bytes as text in the charset the message declares. One that declares none is UTF-8 when it reads as such, and the old Western one otherwise. */
function readable(bytes: Buffer, charset: string | undefined): string {
  if (charset) return decoder(charset).decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const fromQuotedPrintable = (text: string, header = false): Buffer => {
  const clean = (header ? text.replace(/_/g, " ") : text.replace(/=\r?\n/g, "")).replace(/=([0-9A-Fa-f]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return Buffer.from(clean, "latin1");
};

/** RFC 2047: `=?UTF-8?B?…?=` and `=?ISO-8859-1?Q?…?=` in a header become the text they stand for. */
function decodeWords(value: string): string {
  return value
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, charset: string, kind: string, data: string) => decoder(charset).decode(kind.toUpperCase() === "B" ? Buffer.from(data, "base64") : fromQuotedPrintable(data, true)));
}

function headersOf(block: string): Map<string, string> {
  const headers = new Map<string, string>();
  for (const line of block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    const name = line.slice(0, at).trim().toLowerCase();
    if (!headers.has(name)) headers.set(name, line.slice(at + 1).trim());
  }
  return headers;
}

/** `text/plain; charset="utf-8"; boundary=abc` as the type and its parameters. */
function typeOf(value: string | undefined): { type: string; params: Map<string, string> } {
  const [type, ...rest] = (value ?? "text/plain").split(";");
  const params = new Map<string, string>();
  for (const part of rest) {
    const at = part.indexOf("=");
    if (at > 0) params.set(part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim().replace(/^"(.*)"$/, "$1"));
  }
  return { type: type.trim().toLowerCase(), params };
}

const split = (raw: string): [string, string] => {
  const found = /\r?\n\r?\n/.exec(raw);
  return found ? [raw.slice(0, found.index), raw.slice(found.index + found[0].length)] : [raw, ""];
};

/** The first readable text of a part: plain text first, HTML without its tags when there is nothing else. `raw` is the part as bytes read one to one. */
function textOf(raw: string, depth = 0): { plain: string | null; html: string | null } {
  const [head, body] = split(raw);
  const headers = headersOf(head);
  const { type, params } = typeOf(headers.get("content-type"));
  if (type.startsWith("multipart/")) {
    const boundary = params.get("boundary");
    if (!boundary || depth > 5) return { plain: null, html: null };
    let html: string | null = null;
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith("--")) break;
      const inner = textOf(part.replace(/^\r?\n/, ""), depth + 1);
      if (inner.plain !== null) return inner;
      html ??= inner.html;
    }
    return { plain: null, html };
  }
  if (type !== "text/plain" && type !== "text/html") return { plain: null, html: null };
  if (/attachment/i.test(headers.get("content-disposition") ?? "")) return { plain: null, html: null };
  const encoding = (headers.get("content-transfer-encoding") ?? "").toLowerCase();
  const bytes = encoding === "base64" ? Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ""), "base64") : encoding === "quoted-printable" ? fromQuotedPrintable(body) : Buffer.from(body, "latin1");
  const text = readable(bytes, params.get("charset"));
  return type === "text/plain" ? { plain: text, html: null } : { plain: null, html: text };
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  aacute: "á", agrave: "à", acirc: "â", atilde: "ã", eacute: "é", ecirc: "ê", iacute: "í", oacute: "ó", ocirc: "ô", otilde: "õ", uacute: "ú", ccedil: "ç",
  Aacute: "Á", Agrave: "À", Acirc: "Â", Atilde: "Ã", Eacute: "É", Ecirc: "Ê", Iacute: "Í", Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Uacute: "Ú", Ccedil: "Ç",
};
const withoutTags = (html: string) =>
  html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*$/i, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, code: string) => (code[0] === "#" ? String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1))) : (ENTITIES[code] ?? ENTITIES[code.toLowerCase()] ?? match)));

/** Where the message being answered starts, as the usual mail programs mark it. */
const QUOTE_START = /^(>|Em .{5,120} escreveu:|On .{5,120} wrote:|-{3,} ?(Mensagem original|Original Message) ?-{3,}|De: .+|From: .+|_{10,})/i;

/** What the person wrote: the text up to where the quoted message starts, with the blank lines tidied. */
export function ownText(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const cut = lines.findIndex((line) => QUOTE_START.test(line.trim()));
  return (cut === -1 ? lines : lines.slice(0, cut)).join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseMail(raw: Buffer): ParsedMail {
  const whole = raw.toString("latin1");
  const [head] = split(whole);
  const headers = headersOf(head);
  const sender = decodeWords(headers.get("from") ?? "");
  const address = (/<([^<>\s]+@[^<>\s]+)>/.exec(sender)?.[1] ?? /([^\s<>"(),;:]+@[^\s<>"(),;:]+)/.exec(sender)?.[1] ?? "").toLowerCase() || null;
  const name = sender.replace(/<[^>]*>/, "").replace(/^[\s"']+|[\s"']+$/g, "") || null;
  const when = new Date(headers.get("date") ?? "");
  const { plain, html } = textOf(whole);
  const precedence = (headers.get("precedence") ?? "").toLowerCase();
  const automatic =
    (headers.has("auto-submitted") && headers.get("auto-submitted")!.toLowerCase() !== "no") || headers.has("x-autoreply") || headers.has("x-autorespond") || headers.has("list-id") ||
    ["bulk", "junk", "list", "auto_reply"].includes(precedence) || /^(mailer-daemon|postmaster|no-?reply|nao-?responda)@/.test(address ?? "");
  return {
    from: address, fromName: name === address ? null : name, subject: decodeWords(headers.get("subject") ?? "").replace(/\s+/g, " ").trim(), date: Number.isNaN(when.getTime()) ? null : when,
    messageId: /<([^<>\s]+)>/.exec(headers.get("message-id") ?? "")?.[1] ?? null, text: ownText(plain ?? (html === null ? "" : withoutTags(html))), automatic,
  };
}

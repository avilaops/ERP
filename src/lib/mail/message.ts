import { randomUUID } from "node:crypto";

export type MailAttachment = { filename: string; contentType: string; content: Uint8Array };

export type MailMessage = {
  /** Address of the mailbox that sends. */
  from: string;
  /** The name shown before the address: the company that issued the invoice. */
  fromName: string | null;
  /** One recipient per message. */
  to: string;
  replyTo: string | null;
  subject: string;
  /** Plain text. */
  text: string;
  attachments: MailAttachment[];
  /** The address where the recipient leaves the list: goes in `List-Unsubscribe`, with the one-click form. */
  unsubscribe?: string | null;
};

/** A refusal the user can act on. The message goes to the screen as it is. */
export class MailError extends Error {}

const ADDRESS = /^[^@\s<>"(),;:\\]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export const isMailAddress = (text: string): boolean => text.length <= 254 && ADDRESS.test(text);

/**
 * A header takes no line break: what comes from a register (a company name, a
 * customer) with one would add headers of its own to the message. It is removed,
 * not escaped, together with every other control character.
 */
const oneLine = (text: string) => text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

/** RFC 2047: a header with anything beyond ASCII goes as UTF-8 in base64, in words of at most 75 characters. */
function encodedWord(text: string): string {
  const clean = oneLine(text);
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  const words: string[] = [];
  let chunk = "";
  for (const character of clean) {
    if (Buffer.byteLength(chunk + character, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk !== "") words.push(chunk);
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word, "utf8").toString("base64")}?=`).join("\r\n ");
}

/** A display name in quotes when it is plain, encoded when it is not. */
function mailbox(name: string | null, address: string): string {
  const clean = name === null ? "" : oneLine(name);
  if (clean === "") return address;
  const shown = /^[\x20-\x7e]*$/.test(clean) ? `"${clean.replace(/["\\]/g, "")}"` : encodedWord(clean);
  return `${shown} <${address}>`;
}

/** Base64 in lines of 76 characters, as MIME asks. */
const wrapped = (bytes: Uint8Array) => (Buffer.from(bytes).toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");

/** A file name that goes in a header as it is: letters, digits, dot, hyphen and underscore. */
const safeName = (name: string) => oneLine(name).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 100) || "anexo";

/**
 * The message as it goes on the wire (RFC 5322 with MIME), lines ended by CRLF.
 * Pure: the date, the id and the boundary come in, so the same input is the same
 * bytes. Text and attachments always go in base64: no long line, no line
 * starting with a dot, no broken accent.
 */
export function buildMessage(message: MailMessage, now: Date, id: string = randomUUID()): string {
  for (const [label, address] of [["remetente", message.from], ["destinatário", message.to], ["responder para", message.replyTo]] as const) {
    if (address !== null && !isMailAddress(address)) throw new MailError(`E-mail do ${label} inválido.`);
  }
  if (message.unsubscribe && !/^https?:\/\/[^\s<>"]+$/.test(message.unsubscribe)) throw new MailError("Endereço de descadastro inválido.");
  const boundary = `=_erp_${id.replace(/[^A-Za-z0-9]/g, "")}`;
  const domain = message.from.slice(message.from.indexOf("@") + 1);
  const headers = [
    `From: ${mailbox(message.fromName, message.from)}`,
    `To: ${message.to}`,
    message.replyTo ? `Reply-To: ${message.replyTo}` : null,
    `Subject: ${encodedWord(message.subject)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}@${domain}>`,
    message.unsubscribe ? `List-Unsubscribe: <${message.unsubscribe}/agora>` : null,
    message.unsubscribe ? "List-Unsubscribe-Post: List-Unsubscribe=One-Click" : null,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter((line): line is string => line !== null);
  const parts = [
    ['Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", wrapped(Buffer.from(message.text.replace(/\r?\n/g, "\r\n"), "utf8"))].join("\r\n"),
    ...message.attachments.map((attachment) =>
      [
        `Content-Type: ${attachment.contentType}; name="${safeName(attachment.filename)}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${safeName(attachment.filename)}"`,
        "",
        wrapped(attachment.content),
      ].join("\r\n"),
    ),
  ];
  return `${headers.join("\r\n")}\r\n\r\n${parts.map((part) => `--${boundary}\r\n${part}\r\n`).join("")}--${boundary}--\r\n`;
}

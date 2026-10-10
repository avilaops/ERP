import { connect as tlsConnect } from "node:tls";
import type { TLSSocket } from "node:tls";
import { MailError } from "@/lib/mail/message";

export type ImapConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  /** Only for the tests: the authority that signed the server's certificate. In production the system's are used. */
  ca?: string;
};

/** Where the reading of a mailbox stopped: the mailbox as the server numbers it, and the last message seen. */
export type InboxMark = { uidValidity: number | null; lastUid: number | null };
export type FetchedMail = { uid: number; raw: Buffer };

const TIMEOUT_MS = 20_000;
/** How much of one message is read: the headers and the beginning of the text are enough. */
export const MAX_MESSAGE_BYTES = 200_000;

/** Reads what the server sends as lines and as blocks of a known size (IMAP "literals"). */
function reader(socket: TLSSocket) {
  let buffer = Buffer.alloc(0);
  let waiting: { ready: () => Buffer | null; resolve: (value: Buffer) => void; reject: (error: Error) => void } | null = null;
  let failure: Error | null = null;
  const flush = () => {
    if (!waiting) return;
    const value = waiting.ready();
    if (value === null) return;
    const { resolve } = waiting;
    waiting = null;
    resolve(value);
  };
  const fail = (error: Error) => {
    failure = error;
    if (waiting) {
      const { reject } = waiting;
      waiting = null;
      reject(error);
    }
  };
  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    flush();
  });
  socket.on("error", (error) => fail(error));
  socket.on("close", () => fail(new Error("o servidor de e-mail fechou a conexão")));
  socket.setTimeout(TIMEOUT_MS, () => {
    fail(new Error("o servidor de e-mail não respondeu a tempo"));
    socket.destroy();
  });
  const take = (ready: () => Buffer | null) =>
    new Promise<Buffer>((resolve, reject) => {
      if (failure) return reject(failure);
      waiting = { ready, resolve, reject };
      flush();
    });
  return {
    line: () =>
      take(() => {
        const end = buffer.indexOf("\r\n");
        if (end === -1) return null;
        const line = buffer.subarray(0, end);
        buffer = buffer.subarray(end + 2);
        return line;
      }),
    bytes: (count: number) =>
      take(() => {
        if (buffer.length < count) return null;
        const block = buffer.subarray(0, count);
        buffer = buffer.subarray(count);
        return block;
      }),
  };
}

/** A string as IMAP takes it in quotes. What cannot go in quotes (a line break, a character beyond ASCII) is refused. */
function quoted(value: string, what: string): string {
  if (!/^[\x20-\x7e]*$/.test(value)) throw new MailError(`${what} da caixa de entrada tem um caractere que o servidor não aceita.`);
  return `"${value.replace(/[\\"]/g, "\\$&")}"`;
}

/**
 * Reads the messages that arrived in the INBOX after the mark, the oldest
 * first and at most `limit`, without changing anything on the server: nothing
 * is marked as read, moved or deleted. Always over TLS, with the certificate
 * of the server checked. The first reading of a mailbox (or of one the server
 * renumbered) brings nothing: it only sets the mark, so old mail is never
 * imported. What the server refuses comes back as `MailError`, never with the password.
 */
export async function fetchNewMail(config: ImapConfig, mark: InboxMark, limit: number): Promise<{ mark: { uidValidity: number; lastUid: number }; messages: FetchedMail[] }> {
  let socket: TLSSocket;
  try {
    socket = tlsConnect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true, ...(config.ca ? { ca: config.ca } : {}) });
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", () => resolve());
      socket.once("error", reject);
      socket.setTimeout(TIMEOUT_MS, () => reject(new Error("o servidor de e-mail não respondeu a tempo")));
    });
  } catch (error) {
    throw new MailError(`Não foi possível conectar ao servidor de entrada ${config.host}:${config.port} (${error instanceof Error ? error.message : "erro"}).`);
  }
  const replies = reader(socket);
  let counter = 0;
  /** Sends one command and collects what comes until its own answer: the lines, with the blocks that came inside them. */
  const command = async (text: string, step: string, secret = false) => {
    const tag = `a${(counter += 1)}`;
    socket.write(`${tag} ${text}\r\n`);
    const lines: { text: string; blocks: Buffer[] }[] = [];
    for (;;) {
      let line = (await replies.line()).toString("latin1");
      const blocks: Buffer[] = [];
      for (let literal = /\{(\d+)\}$/.exec(line); literal; literal = /\{(\d+)\}$/.exec(line)) {
        const size = Number(literal[1]);
        if (size > MAX_MESSAGE_BYTES + 4096) throw new MailError("O servidor de entrada enviou uma mensagem maior do que o pedido.");
        blocks.push(await replies.bytes(size));
        line += (await replies.line()).toString("latin1");
      }
      if (line.startsWith(`${tag} `)) {
        if (!/^\S+ OK\b/i.test(line)) throw new MailError(secret ? "O servidor de entrada recusou o usuário ou a senha da caixa." : `O servidor de entrada recusou (${step}): ${line.slice(tag.length + 1)}`.slice(0, 300));
        return lines;
      }
      lines.push({ text: line, blocks });
    }
  };

  try {
    const greeting = (await replies.line()).toString("latin1");
    if (!/^\* (OK|PREAUTH)\b/i.test(greeting)) throw new MailError("O servidor de entrada não aceitou a conexão.");
    await command(`LOGIN ${quoted(config.username, "O usuário")} ${quoted(config.password, "A senha")}`, "entrada", true);
    const selected = await command("EXAMINE INBOX", "abrir a caixa");
    const numberOf = (name: string) => {
      const found = selected.map((line) => new RegExp(`\\[${name} (\\d+)\\]`, "i").exec(line.text)).find(Boolean);
      return found ? Number(found[1]) : null;
    };
    const uidValidity = numberOf("UIDVALIDITY");
    const uidNext = numberOf("UIDNEXT");
    if (uidValidity === null || uidNext === null) throw new MailError("O servidor de entrada não informou a numeração da caixa.");
    if (mark.lastUid === null || mark.uidValidity !== uidValidity) {
      await command("LOGOUT", "saída").catch(() => undefined);
      return { mark: { uidValidity, lastUid: uidNext - 1 }, messages: [] };
    }
    const found = await command(`UID SEARCH UID ${mark.lastUid + 1}:*`, "procurar mensagens");
    // "n:*" always answers with the last message, even an old one: only what is beyond the mark counts.
    const uids = found
      .flatMap((line) => (/^\* SEARCH\b/i.test(line.text) ? line.text.split(/\s+/).slice(2).map(Number) : []))
      .filter((uid) => Number.isInteger(uid) && uid > mark.lastUid!)
      .sort((a, b) => a - b)
      .slice(0, limit);
    const messages: FetchedMail[] = [];
    for (const uid of uids) {
      // PEEK: reading here does not mark the message as read for the person who owns the mailbox.
      const fetched = await command(`UID FETCH ${uid} (BODY.PEEK[]<0.${MAX_MESSAGE_BYTES}>)`, "ler mensagem");
      const raw = fetched.find((line) => /^\* \d+ FETCH\b/i.test(line.text) && line.blocks.length > 0)?.blocks[0];
      if (raw) messages.push({ uid, raw });
    }
    await command("LOGOUT", "saída").catch(() => undefined);
    return { mark: { uidValidity, lastUid: uids.length > 0 ? uids[uids.length - 1] : mark.lastUid }, messages };
  } catch (error) {
    if (error instanceof MailError) throw error;
    throw new MailError(`Falha na conversa com o servidor de entrada: ${error instanceof Error ? error.message : "erro"}.`);
  } finally {
    socket.destroy();
  }
}

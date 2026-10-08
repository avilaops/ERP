import { connect as plainConnect } from "node:net";
import type { Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { MailError } from "@/lib/mail/message";

export type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  /** TLS from the first byte. Without it, the port says: 465 is, the others start plain and upgrade (STARTTLS). */
  secure?: boolean;
  /** Only for the tests: the authority that signed the server's certificate. In production the system's are used. */
  ca?: string;
};

const TIMEOUT_MS = 20_000;

/** Reads the server's replies, one at a time. A reply may take several lines: the last has a space after the code. */
function reader(socket: Socket) {
  let buffer = "";
  let waiting: { resolve: (reply: { code: number; text: string }) => void; reject: (error: Error) => void } | null = null;
  let failure: Error | null = null;
  const flush = () => {
    if (!waiting) return;
    const lines = buffer.split("\r\n");
    const last = lines.findIndex((line) => /^\d{3}( |$)/.test(line));
    if (last === -1 || last === lines.length - 1) return;
    const reply = lines.slice(0, last + 1);
    buffer = lines.slice(last + 1).join("\r\n");
    const { resolve } = waiting;
    waiting = null;
    resolve({ code: Number(reply[last].slice(0, 3)), text: reply.map((line) => line.slice(4)).join(" ") });
  };
  const fail = (error: Error) => {
    failure = error;
    if (waiting) {
      const { reject } = waiting;
      waiting = null;
      reject(error);
    }
  };
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    flush();
  });
  socket.on("error", (error) => fail(error));
  socket.on("close", () => fail(new Error("o servidor de e-mail fechou a conexão")));
  socket.setTimeout(TIMEOUT_MS, () => {
    fail(new Error("o servidor de e-mail não respondeu a tempo"));
    socket.destroy();
  });
  return {
    next: () =>
      new Promise<{ code: number; text: string }>((resolve, reject) => {
        if (failure) return reject(failure);
        waiting = { resolve, reject };
        flush();
      }),
    detach: () => socket.removeAllListeners(),
  };
}

const opened = (socket: Socket, event: "connect" | "secureConnect") =>
  new Promise<void>((resolve, reject) => {
    socket.once(event, () => resolve());
    socket.once("error", reject);
    socket.setTimeout(TIMEOUT_MS, () => reject(new Error("o servidor de e-mail não respondeu a tempo")));
  });

/**
 * Hands one message to a mail server: TLS from the first byte on port 465,
 * STARTTLS on the others (and no sending without it), then AUTH LOGIN and
 * MAIL/RCPT/DATA. The certificate of the server is always checked. What the
 * server refuses comes back as `MailError`, with what it said and never the password.
 */
export async function sendMail(config: SmtpConfig, envelope: { from: string; to: string }, message: string): Promise<void> {
  const tlsOptions = { host: config.host, servername: config.host, rejectUnauthorized: true, ...(config.ca ? { ca: config.ca } : {}) };
  const direct = config.secure ?? config.port === 465;
  let socket: Socket;
  try {
    if (direct) {
      socket = tlsConnect({ ...tlsOptions, port: config.port });
      await opened(socket, "secureConnect");
    } else {
      socket = plainConnect({ host: config.host, port: config.port });
      await opened(socket, "connect");
    }
  } catch (error) {
    throw new MailError(`Não foi possível conectar ao servidor de e-mail ${config.host}:${config.port} (${error instanceof Error ? error.message : "erro"}).`);
  }

  let replies = reader(socket);
  const expect = async (accepted: number[], step: string) => {
    const reply = await replies.next();
    if (!accepted.includes(reply.code)) throw new MailError(`O servidor de e-mail recusou (${step}): ${reply.code} ${reply.text}`.slice(0, 300));
    return reply;
  };
  const command = async (line: string, accepted: number[], step: string) => {
    socket.write(`${line}\r\n`);
    return expect(accepted, step);
  };

  try {
    await expect([220], "conexão");
    let hello = await command("EHLO erp.avilaops.com", [250], "apresentação");
    if (!direct) {
      if (!/\bSTARTTLS\b/i.test(hello.text)) throw new MailError("O servidor de e-mail não oferece conexão segura (STARTTLS): nada foi enviado.");
      await command("STARTTLS", [220], "conexão segura");
      replies.detach();
      const secure = tlsConnect({ ...tlsOptions, socket });
      await opened(secure, "secureConnect");
      socket = secure;
      replies = reader(socket);
      hello = await command("EHLO erp.avilaops.com", [250], "apresentação");
    }
    await command("AUTH LOGIN", [334], "entrada");
    await command(Buffer.from(config.username, "utf8").toString("base64"), [334], "usuário");
    socket.write(`${Buffer.from(config.password, "utf8").toString("base64")}\r\n`);
    const entered = await replies.next();
    if (entered.code !== 235) throw new MailError("O servidor de e-mail recusou o usuário ou a senha da caixa.");
    await command(`MAIL FROM:<${envelope.from}>`, [250], "remetente");
    await command(`RCPT TO:<${envelope.to}>`, [250, 251], "destinatário");
    await command("DATA", [354], "envio");
    // A line that starts with a dot would end the message: it gets one more (RFC 5321, 4.5.2).
    socket.write(`${message.replace(/^\./gm, "..")}${message.endsWith("\r\n") ? "" : "\r\n"}.\r\n`);
    await expect([250], "entrega ao servidor");
    socket.write("QUIT\r\n");
  } catch (error) {
    if (error instanceof MailError) throw error;
    throw new MailError(`Falha na conversa com o servidor de e-mail: ${error instanceof Error ? error.message : "erro"}.`);
  } finally {
    socket.destroy();
  }
}

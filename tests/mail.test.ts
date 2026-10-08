import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer as createPlainServer } from "node:net";
import type { Socket } from "node:net";
import { test } from "node:test";
import { createServer as createTlsServer, TLSSocket } from "node:tls";
import { DEFAULT_NFE_BODY, defaultMailbox, fillMailText, mailboxProblems } from "@/lib/db/mail";
import { buildMessage, isMailAddress, MailError } from "@/lib/mail/message";
import { sendMail } from "@/lib/mail/smtp";
import { openSecret, sealSecret } from "@/lib/mail/vault";
import { serverIdentity } from "./fiscal-helpers.ts";

const NOW = new Date("2026-10-08T14:30:00Z");
const BASE = { from: "notas@avilaops.com", fromName: "Ludus Equipamentos Ltda", to: "compras@academia.test", replyTo: "fiscal@ludus.test", subject: "Nota fiscal nº 42 - Ludus", text: "Olá,\n\nSegue a nota.", attachments: [] };

test("mensagem: cabeçalhos, texto em base64 e anexos, sempre os mesmos bytes para a mesma entrada", () => {
  const xml = Buffer.from("<nfeProc>ação</nfeProc>", "utf8");
  const message = buildMessage({ ...BASE, attachments: [{ filename: "NFe35261011222333000181550010000000421482917360.xml", contentType: "application/xml", content: xml }, { filename: "DANFE 42 (cópia).pdf", contentType: "application/pdf", content: new Uint8Array(200).fill(7) }] }, NOW, "id-1");
  assert.equal(message, buildMessage({ ...BASE, attachments: [{ filename: "NFe35261011222333000181550010000000421482917360.xml", contentType: "application/xml", content: xml }, { filename: "DANFE 42 (cópia).pdf", contentType: "application/pdf", content: new Uint8Array(200).fill(7) }] }, NOW, "id-1"));
  const [head, ...rest] = message.split("\r\n\r\n");
  assert.deepEqual(head.split("\r\n"), [
    'From: "Ludus Equipamentos Ltda" <notas@avilaops.com>',
    "To: compras@academia.test",
    "Reply-To: fiscal@ludus.test",
    "Subject: =?UTF-8?B?Tm90YSBmaXNjYWwgbsK6IDQyIC0gTHVkdXM=?=",
    "Date: Thu, 08 Oct 2026 14:30:00 +0000",
    "Message-ID: <id-1@avilaops.com>",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="=_erp_id1"',
  ]);
  const body = rest.join("\r\n\r\n");
  assert.ok(body.includes(Buffer.from("Olá,\r\n\r\nSegue a nota.", "utf8").toString("base64")));
  assert.ok(body.includes('Content-Disposition: attachment; filename="NFe35261011222333000181550010000000421482917360.xml"'));
  assert.ok(body.includes(xml.toString("base64")));
  // Nome de arquivo com espaço, parêntese e acento vira um nome que cabe no cabeçalho.
  assert.ok(body.includes('filename="DANFE_42_c_pia_.pdf"'));
  assert.ok(message.endsWith("--=_erp_id1--\r\n"));
  // Nenhuma linha passa de 76 caracteres no corpo, e toda quebra é CRLF.
  assert.ok(body.split("\r\n").every((line) => line.length <= 76 || line.startsWith("Content-")));
  assert.doesNotMatch(message.replace(/\r\n/g, ""), /[\r\n]/);
});

test("mensagem: quebra de linha num nome ou assunto não vira cabeçalho novo; endereço inválido é recusado", () => {
  const message = buildMessage({ ...BASE, fromName: "Empresa\r\nBcc: espiao@fora.test", subject: "Nota\r\nBcc: espiao@fora.test" }, NOW, "id-2");
  assert.doesNotMatch(message.split("\r\n\r\n")[0], /^Bcc:/m);
  assert.throws(() => buildMessage({ ...BASE, to: "a@b.test\r\nBcc: x@y.test" }, NOW), MailError);
  assert.throws(() => buildMessage({ ...BASE, from: "sem-arroba" }, NOW), /remetente/);
  for (const [address, ok] of [["a@b.com", true], ["a.b+c@sub.dominio.com.br", true], ["a@b", false], ["a b@c.com", false], ["<a@b.com>", false], ["", false]] as const) {
    assert.equal(isMailAddress(address), ok, address);
  }
});

test("texto da mensagem: as palavras entre chaves viram os dados da nota; as outras ficam", () => {
  const words = { numero: "42", serie: "1", empresa: "Ludus", cliente: "Academia", chave: "3526" };
  assert.equal(fillMailText("NF {numero}/{serie} de {empresa} para {cliente}: {chave} {outra}", words), "NF 42/1 de Ludus para Academia: 3526 {outra}");
  assert.doesNotMatch(fillMailText(DEFAULT_NFE_BODY, words), /\{(numero|serie|empresa|cliente|chave)\}/);
});

test("caixa: senha selada só abre com a chave certa; caixa padrão só existe com o ambiente inteiro; problemas de uma vez", () => {
  const key = randomBytes(32);
  const sealed = sealSecret("s3nha da caixa", key);
  assert.equal(openSecret(sealed, key), "s3nha da caixa");
  assert.ok(!sealed.ciphertext.toString("utf8").includes("s3nha"));
  assert.throws(() => openSecret(sealed, randomBytes(32)), /chave do cofre/);
  assert.throws(() => openSecret({ ...sealed, ciphertext: Buffer.from(sealed.ciphertext).fill(1, 0, 1) }, key), /chave do cofre/);

  const env = { ERP_SMTP_HOST: "mail.avilaops.com", ERP_SMTP_USER: "notas@avilaops.com", ERP_SMTP_PASSWORD: "x", ERP_MAIL_FROM: "Notas@AvilaOps.com" };
  assert.deepEqual(defaultMailbox(env), { channel: "avilaops", smtp: { host: "mail.avilaops.com", port: 465, username: "notas@avilaops.com", password: "x" }, from: "notas@avilaops.com" });
  assert.equal(defaultMailbox({ ...env, ERP_SMTP_PASSWORD: "" }), null);
  assert.equal(defaultMailbox({ ...env, ERP_SMTP_PORT: "abc" }), null);
  assert.equal(defaultMailbox({}), null);
  assert.equal(mailboxProblems({ host: "smtp x", port: 0, username: "", password: "", from: "x" }).length, 5);
  assert.deepEqual(mailboxProblems({ host: "smtp.empresa.com.br", port: 587, username: "fiscal", password: "p", from: "fiscal@empresa.com.br" }), []);
});

/** A mail server that follows the script of a real one and keeps what it was told. `accept` decides the password. */
function fakeSmtp(identity: { key: string; cert: string }, mode: "direto" | "starttls" | "sem-tls", password = "senha-certa") {
  const seen = { commands: [] as string[], data: "", secured: false };
  const talk = (socket: Socket, secure: boolean) => {
    let buffer = "";
    let state: "command" | "user" | "pass" | "data" = "command";
    const say = (line: string) => socket.write(`${line}\r\n`);
    if (!secure || mode === "direto") say("220 falso.test ESMTP");
    socket.setEncoding("utf8");
    socket.on("error", () => {});
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (state === "data") {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          seen.data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          state = "command";
          say("250 2.0.0 aceita");
          continue;
        }
        const at = buffer.indexOf("\r\n");
        if (at === -1) return;
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (state === "user") { state = "pass"; say("334 UGFzc3dvcmQ6"); continue; }
        if (state === "pass") {
          state = "command";
          say(Buffer.from(line, "base64").toString("utf8") === password ? "235 2.7.0 ok" : "535 5.7.8 credenciais invalidas");
          continue;
        }
        seen.commands.push(line);
        if (/^EHLO/.test(line)) { socket.write(`250-falso.test\r\n${mode === "starttls" && !secure ? "250-STARTTLS\r\n" : ""}250 AUTH LOGIN\r\n`); continue; }
        if (line === "STARTTLS") {
          say("220 pronto");
          socket.removeAllListeners("data");
          const upgraded = new TLSSocket(socket, { isServer: true, key: identity.key, cert: identity.cert });
          seen.secured = true;
          talk(upgraded, true);
          return;
        }
        if (line === "AUTH LOGIN") { state = "user"; say("334 VXNlcm5hbWU6"); continue; }
        if (/^MAIL FROM/.test(line)) { say("250 ok"); continue; }
        if (/^RCPT TO:<recusado@/.test(line)) { say("550 5.1.1 caixa inexistente"); continue; }
        if (/^RCPT TO/.test(line)) { say("250 ok"); continue; }
        if (line === "DATA") { state = "data"; say("354 mande"); continue; }
        if (line === "QUIT") { say("221 tchau"); socket.end(); return; }
        say("500 nao entendi");
      }
    });
  };
  const server = mode === "direto" ? createTlsServer({ key: identity.key, cert: identity.cert }, (socket) => { seen.secured = true; talk(socket, true); }) : createPlainServer((socket) => talk(socket, false));
  return { seen, server, listen: () => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port))) };
}

test("envio: TLS direto e STARTTLS com o certificado conferido; senha errada, destinatário recusado e servidor sem TLS não enviam", async () => {
  const identity = serverIdentity();
  const message = buildMessage({ ...BASE, text: "linha\n.ponto no começo\nfim" }, NOW, "id-3");
  const envelope = { from: BASE.from, to: BASE.to };

  for (const mode of ["direto", "starttls"] as const) {
    const fake = fakeSmtp(identity, mode);
    const port = await fake.listen();
    try {
      const config = { host: "localhost", port, username: "notas@avilaops.com", password: "senha-certa", secure: mode === "direto", ca: identity.cert };
      await sendMail(config, envelope, message);
      assert.ok(fake.seen.secured, mode);
      assert.deepEqual(fake.seen.commands.filter((line) => /^(MAIL|RCPT|DATA)/.test(line)), ["MAIL FROM:<notas@avilaops.com>", "RCPT TO:<compras@academia.test>", "DATA"]);
      assert.ok(fake.seen.data.startsWith("From: "), mode);
      assert.ok(fake.seen.data.includes("Message-ID: <id-3@avilaops.com>"));
      // A senha nunca aparece entre os comandos em texto: só em base64, depois do pedido do servidor.
      assert.ok(!fake.seen.commands.join("\n").includes("senha-certa"));

      await assert.rejects(() => sendMail({ ...config, password: "errada" }, envelope, message), (error: unknown) => error instanceof MailError && /usuário ou a senha/.test(error.message) && !error.message.includes("errada"));
      await assert.rejects(() => sendMail(config, { ...envelope, to: "recusado@academia.test" }, message), /recusou \(destinatário\): 550/);
      // Sem a autoridade que assinou o servidor, a identidade dele não é aceita.
      await assert.rejects(() => sendMail({ ...config, ca: undefined }, envelope, message), MailError);
    } finally {
      fake.server.close();
    }
  }

  const plain = fakeSmtp(identity, "sem-tls");
  const port = await plain.listen();
  try {
    await assert.rejects(() => sendMail({ host: "localhost", port, username: "u", password: "senha-certa", ca: identity.cert }, envelope, message), /não oferece conexão segura/);
    assert.ok(!plain.seen.commands.includes("AUTH LOGIN"));
  } finally {
    plain.server.close();
  }
  await assert.rejects(() => sendMail({ host: "localhost", port: 1, username: "u", password: "p" }, envelope, message), /Não foi possível conectar/);
});

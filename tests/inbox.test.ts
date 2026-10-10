import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { createServer as createTlsServer } from "node:tls";
import { addCadenceStep, createCadence, listEnrollments, startCadence } from "@/lib/db/cadences";
import { createOpportunity, deleteOpportunity, listPendingActivities, listStages, moveOpportunity } from "@/lib/db/funnel";
import { listInbox, receiveMail } from "@/lib/db/inbox";
import { inboxChannel, inboxProblems, loadInboxInfo, removeInbox, saveInbox } from "@/lib/db/mail";
import { listTemplates, saveTemplate } from "@/lib/db/messages";
import { fetchNewMail } from "@/lib/mail/imap";
import { MailError } from "@/lib/mail/message";
import { ownText, parseMail } from "@/lib/mail/parse";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";
import { serverIdentity } from "./fiscal-helpers.ts";

const mail = (headers: string[], body: string) => Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "latin1");

test("mensagem recebida: remetente, assunto e texto saem de qualquer formato comum; o trecho citado fica de fora", () => {
  const plain = parseMail(mail(
    ["From: =?UTF-8?B?UGF1bGEgQ29uY2Vpw6fDo28=?= <Paula@FitClub.test>", "Subject: =?ISO-8859-1?Q?Re:_Proposta_para_a_academia_=E9_boa?=", "Date: Fri, 09 Oct 2026 15:00:00 -0300", "Message-ID: <abc123@fitclub.test>", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: quoted-printable"],
    "Ol=C3=A1, pode enviar o or=C3=A7amento.\r\nObrigada!\r\n\r\nEm sex., 9 de out. de 2026 =C3=A0s 10:00, Ana <ana@acme.test> escreveu:\r\n> Olá, Paula.\r\n> Posso enviar o orçamento?",
  ));
  assert.deepEqual(plain, { from: "paula@fitclub.test", fromName: "Paula Conceição", subject: "Re: Proposta para a academia é boa", date: new Date("2026-10-09T18:00:00Z"), messageId: "abc123@fitclub.test", text: "Olá, pode enviar o orçamento.\nObrigada!", automatic: false });

  // Multipart com texto e HTML: vale o texto; base64; assunto dobrado em duas palavras codificadas.
  const multipart = parseMail(mail(
    ["From: leo@ironbox.test", "Subject: =?UTF-8?B?T3LDp2FtZW50bw==?=\r\n =?UTF-8?B?IGFwcm92YWRv?=", 'Content-Type: multipart/alternative; boundary="b1"'],
    `--b1\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from("Fechado, pode mandar o contrato.", "utf8").toString("base64")}\r\n--b1\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<p>Fechado, pode mandar o <b>contrato</b>.</p>\r\n--b1--\r\n`,
  ));
  assert.deepEqual([multipart.from, multipart.fromName, multipart.subject, multipart.text, multipart.messageId, multipart.date], ["leo@ironbox.test", null, "Orçamento aprovado", "Fechado, pode mandar o contrato.", null, null]);

  // Só HTML, em latin1, com a mensagem anterior num blockquote: sobra o que a pessoa escreveu, sem as marcas.
  const html = parseMail(mail(
    ["From: \"Duda\" <duda@studio.test>", "Subject: Re: visita", "Content-Type: text/html; charset=iso-8859-1"],
    "<html><head><style>p{color:red}</style></head><body><p>Pode ser ter\xe7a &agrave; tarde &amp; quarta.</p><div>At&eacute; l&#225;</div><blockquote>Ol\xe1, Duda</blockquote></body></html>",
  ));
  assert.equal(html.text, "Pode ser terça à tarde & quarta.\nAté lá");
  // Sem dizer em que codificação veio: UTF-8 quando é, a ocidental antiga quando não é.
  assert.equal(parseMail(Buffer.from("From: a@b.test\r\n\r\nAção em UTF-8", "utf8")).text, "Ação em UTF-8");
  assert.equal(parseMail(Buffer.from("From: a@b.test\r\n\r\nAção em latin1", "latin1")).text, "Ação em latin1");
  // Anexo em texto não é o corpo; mensagem sem nada legível volta vazia, sem erro.
  const attachment = parseMail(mail(["From: a@b.test", 'Content-Type: multipart/mixed; boundary="x"'], "--x\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename=a.txt\r\n\r\nconteúdo do anexo\r\n--x--"));
  assert.equal(attachment.text, "");
  assert.deepEqual(parseMail(Buffer.from("lixo sem cabeçalho")), { from: null, fromName: null, subject: "", date: null, messageId: null, text: "", automatic: false });

  // Resposta automática, devolução e lista: ninguém escreveu.
  for (const headers of [["From: paula@fitclub.test", "Auto-Submitted: auto-replied"], ["From: MAILER-DAEMON@mail.test"], ["From: paula@fitclub.test", "Precedence: bulk"], ["From: news@loja.test", "List-Id: <news.loja.test>"], ["From: no-reply@servico.test"]]) {
    assert.equal(parseMail(mail(headers, "Estou fora do escritório.")).automatic, true, headers.join(" | "));
  }
  assert.equal(parseMail(mail(["From: paula@fitclub.test", "Auto-Submitted: no"], "Oi")).automatic, false);
  assert.equal(ownText("Sim.\n\n\n\nAté.\n\n-----Original Message-----\nFrom: x"), "Sim.\n\nAté.");
  assert.equal(ownText("Combinado.\n> citado\nmais texto"), "Combinado.");
});

/** A mailbox server for the tests: one mailbox, messages by number, over TLS. It records every command, with the password blanked. */
function fakeImap(identity: { key: string; cert: string }, box: { uidValidity: number; messages: Map<number, Buffer> }, password = "senha-certa") {
  const seen: string[] = [];
  const server = createTlsServer({ key: identity.key, cert: identity.cert }, (socket) => {
    socket.on("error", () => {});
    socket.write("* OK servidor de teste\r\n");
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      for (let end = buffer.indexOf("\r\n"); end !== -1; end = buffer.indexOf("\r\n")) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const [tag, ...rest] = line.split(" ");
        const text = rest.join(" ");
        seen.push(text.replace(/^(LOGIN "[^"]*") .*/, "$1 ***"));
        const uids = [...box.messages.keys()].sort((a, b) => a - b);
        if (text.startsWith("LOGIN")) socket.write(text === `LOGIN "caixa@acme.test" "${password.replace(/[\\"]/g, "\\$&")}"` ? `${tag} OK entrou\r\n` : `${tag} NO [AUTHENTICATIONFAILED] senha errada\r\n`);
        else if (text === "EXAMINE INBOX") socket.write(`* ${uids.length} EXISTS\r\n* OK [UIDVALIDITY ${box.uidValidity}] ok\r\n* OK [UIDNEXT ${(uids.at(-1) ?? 0) + 1}] ok\r\n${tag} OK [READ-ONLY] aberta\r\n`);
        else if (text.startsWith("UID SEARCH UID ")) {
          const from = Number(/UID (\d+):\*/.exec(text)![1]);
          // Como um servidor de verdade: "n:*" sempre devolve a última, mesmo que seja anterior a n.
          const found = uids.filter((uid) => uid >= from);
          socket.write(`* SEARCH ${(found.length > 0 ? found : uids.slice(-1)).join(" ")}\r\n${tag} OK feito\r\n`);
        } else if (text.startsWith("UID FETCH ")) {
          const uid = Number(text.split(" ")[2]);
          const raw = box.messages.get(uid)!;
          socket.write(`* ${uids.indexOf(uid) + 1} FETCH (UID ${uid} BODY[]<0> {${raw.length}}\r\n`);
          socket.write(raw);
          socket.write(`)\r\n${tag} OK lido\r\n`);
        } else if (text === "LOGOUT") {
          socket.write(`* BYE até\r\n${tag} OK saiu\r\n`);
          socket.end();
        } else socket.write(`${tag} BAD comando desconhecido\r\n`);
      }
    });
  });
  return { seen, server, listen: () => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port))) };
}

test("caixa de entrada: a primeira leitura só marca o ponto; depois vem só o que chegou, sem mexer na caixa; senha errada e certificado estranho não leem", async () => {
  const identity = serverIdentity();
  // Uma mensagem com bytes de todo tipo, e uma linha que parece o fim de um bloco: tem de chegar byte a byte.
  const tricky = Buffer.concat([Buffer.from("From: a@b.test\r\nSubject: x {5}\r\n\r\n"), randomBytes(3000), Buffer.from("\r\na9 OK falso\r\n)\r\n")]);
  const box = { uidValidity: 77, messages: new Map<number, Buffer>([[4, Buffer.from("From: velho@x.test\r\n\r\nantiga")], [9, Buffer.from("From: outro@x.test\r\n\r\ntambém antiga")]]) };
  const fake = fakeImap(identity, box);
  const port = await fake.listen();
  const config = { host: "localhost", port, username: "caixa@acme.test", password: "senha-certa", ca: identity.cert };
  try {
    // Primeira vez: nada do que já estava lá.
    const first = await fetchNewMail(config, { uidValidity: null, lastUid: null }, 30);
    assert.deepEqual(first, { mark: { uidValidity: 77, lastUid: 9 }, messages: [] });
    // Nada novo: o servidor devolve a última, e ela não conta.
    assert.deepEqual(await fetchNewMail(config, first.mark, 30), { mark: { uidValidity: 77, lastUid: 9 }, messages: [] });
    box.messages.set(12, tricky).set(15, Buffer.from("From: paula@fitclub.test\r\nSubject: Re: Proposta\r\n\r\nPode enviar."));
    box.messages.set(16, Buffer.from("From: leo@ironbox.test\r\n\r\nTerceira"));
    // Em ordem, e no máximo o pedido: a marca para onde a leitura parou.
    const second = await fetchNewMail(config, first.mark, 2);
    assert.deepEqual([second.mark, second.messages.map((message) => message.uid)], [{ uidValidity: 77, lastUid: 15 }, [12, 15]]);
    assert.ok(second.messages[0].raw.equals(tricky));
    assert.deepEqual((await fetchNewMail(config, second.mark, 30)).messages.map((message) => message.uid), [16]);
    // O servidor renumerou a caixa: recomeça do ponto atual, sem trazer tudo de novo.
    box.uidValidity = 78;
    assert.deepEqual(await fetchNewMail(config, second.mark, 30), { mark: { uidValidity: 78, lastUid: 16 }, messages: [] });
    // Só leitura: a caixa é aberta sem poder alterar, a mensagem é lida sem marcar, e nada é apagado nem movido.
    assert.ok(fake.seen.includes("EXAMINE INBOX") && fake.seen.some((line) => /^UID FETCH 12 \(BODY\.PEEK\[\]<0\.200000>\)$/.test(line)));
    assert.ok(!fake.seen.some((line) => /SELECT|STORE|EXPUNGE|DELETE|COPY|MOVE|APPEND/i.test(line)));
    assert.ok(!fake.seen.join("\n").includes("senha-certa"));

    await assert.rejects(() => fetchNewMail({ ...config, password: 'errada"\\' }, first.mark, 30), (error: unknown) => error instanceof MailError && error.message === "O servidor de entrada recusou o usuário ou a senha da caixa.");
    await assert.rejects(() => fetchNewMail({ ...config, password: "com\r\nquebra" }, first.mark, 30), /caractere que o servidor não aceita/);
    await assert.rejects(() => fetchNewMail({ ...config, ca: undefined }, first.mark, 30), (error: unknown) => error instanceof MailError && /Não foi possível conectar/.test(error.message));
  } finally {
    fake.server.close();
  }
});

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
before(async () => {
  if (!skip) db = await openTestDb("entrada");
});
after(async () => {
  if (!skip) await db.close();
});

test("respostas: só a mensagem de quem é contato entra, na oportunidade em andamento; para a cadência e vira tarefa; falha de leitura fica anotada", { skip }, async () => {
  const SELLER = { email: "ana@empresa.test", name: "Ana Souza" };
  const blank = { customerId: null, contactName: null, phone: null, email: null, source: null, estimatedValue: null, notes: null };
  const key = randomBytes(32);
  const now = new Date("2026-10-09T12:00:00Z");
  assert.deepEqual(inboxProblems({ host: "x", port: 0, username: "", password: "" }).length, 4);
  // Sem caixa cadastrada, nada é lido.
  const never = async () => { throw new Error("não devia ler"); };
  assert.deepEqual(await receiveMail(now, { key: () => key, fetch: never }, db.pool), { read: 0, kept: 0 });
  await saveInbox({ host: "IMAP.acme.test", port: 993, username: " caixa@acme.test ", password: "segredo da caixa" }, { uidValidity: 77, lastUid: 9 }, key, "diretoria@empresa.test", db.pool);
  const info = (await loadInboxInfo(db.pool))!;
  assert.deepEqual([info.host, info.port, info.username, info.problem], ["imap.acme.test", 993, "caixa@acme.test", null]);
  // A senha só existe cifrada, e só a chave certa a abre.
  const stored = await db.pool.query("SELECT imap_password FROM mail_settings");
  assert.ok(!(stored.rows[0].imap_password as Buffer).includes("segredo"));
  assert.deepEqual(await inboxChannel(db.pool, () => key), { imap: { host: "imap.acme.test", port: 993, username: "caixa@acme.test", password: "segredo da caixa" }, mark: { uidValidity: 77, lastUid: 9 } });
  await assert.rejects(() => inboxChannel(db.pool, () => randomBytes(32)));

  const stages = await listStages(db.pool);
  const old = await createOpportunity({ ...blank, title: "Venda antiga", company: "Fit Club", contactName: "Paula", email: "Paula@FitClub.test" }, SELLER, db.pool);
  await moveOpportunity(old, stages.find((stage) => stage.kind === "perdida")!.id, "Preço", SELLER.email, { ownerEmail: null }, db.pool);
  const current = await createOpportunity({ ...blank, title: "Academia nova", company: "Fit Club", contactName: "Paula", email: "paula@fitclub.test" }, SELLER, db.pool);
  await saveTemplate(null, { name: "Primeiro contato", subject: "Proposta para {empresa}", body: "Olá, {contato}. Posso enviar o orçamento?" }, "diretoria@empresa.test", db.pool);
  const cadence = await createCadence("Retomada", "diretoria@empresa.test", db.pool);
  await addCadenceStep(cadence, { kind: "email", waitDays: 3, templateId: (await listTemplates(db.pool))[0].id, taskTitle: null }, db.pool);
  await startCadence(current, cadence, SELLER.email, null, now, db.pool);

  const reply = mail(["From: Paula Dias <paula@fitclub.test>", "Subject: Re: Proposta para Fit Club", "Date: Fri, 09 Oct 2026 08:30:00 -0300", "Message-ID: <r1@fitclub.test>"], "Pode enviar o orçamento.\r\n\r\n> Olá, Paula.");
  const seen: unknown[] = [];
  const fetch = (messages: Buffer[], lastUid: number) => async (config: unknown, mark: unknown, limit: number) => {
    seen.push([config, mark, limit]);
    return { mark: { uidValidity: 77, lastUid }, messages: messages.map((raw, index) => ({ uid: lastUid - messages.length + index + 1, raw })) };
  };
  const batch = [
    reply,
    mail(["From: desconhecido@fora.test", "Subject: Oferta imperdível", "Message-ID: <s1@fora.test>"], "Compre já."),
    mail(["From: paula@fitclub.test", "Subject: Fora do escritório", "Auto-Submitted: auto-replied", "Message-ID: <a1@fitclub.test>"], "Volto na segunda."),
    mail(["From: paula@fitclub.test", "Subject: Mais uma coisa"], "Esqueci de dizer: são 12 estações."),
  ];
  assert.deepEqual(await receiveMail(now, { key: () => key, fetch: fetch(batch, 13) }, db.pool), { read: 4, kept: 2 });
  // A leitura usa a caixa e a marca guardadas.
  assert.deepEqual(seen[0], [{ host: "imap.acme.test", port: 993, username: "caixa@acme.test", password: "segredo da caixa" }, { uidValidity: 77, lastUid: 9 }, 30]);
  // Entrou na oportunidade em andamento, não na perdida; o estranho e a resposta automática não foram guardados em lugar nenhum.
  assert.deepEqual((await listInbox(current, db.pool)).map((message) => [message.sender, message.senderName, message.subject, message.body, message.receivedAt.toISOString()]).sort(), [
    ["paula@fitclub.test", "Paula Dias", "Re: Proposta para Fit Club", "Pode enviar o orçamento.", "2026-10-09T11:30:00.000Z"],
    ["paula@fitclub.test", null, "Mais uma coisa", "Esqueci de dizer: são 12 estações.", now.toISOString()],
  ].sort());
  assert.deepEqual(await listInbox(old, db.pool), []);
  assert.equal((await db.pool.query("SELECT count(*) FROM opportunity_inbox")).rows[0].count, "2");
  // A cadência parou, e o vendedor ficou com a tarefa de responder.
  const [enrollment] = await listEnrollments(current, db.pool);
  assert.deepEqual([enrollment.status, enrollment.stoppedReason], ["parada", "O cliente respondeu."]);
  assert.deepEqual((await listPendingActivities({ ownerEmail: SELLER.email }, db.pool)).map((task) => task.title).sort(), ["Responder o e-mail de Paula Dias: Re: Proposta para Fit Club", "Responder o e-mail de paula@fitclub.test: Mais uma coisa"]);
  assert.deepEqual(await inboxChannel(db.pool, () => key).then((channel) => channel!.mark), { uidValidity: 77, lastUid: 13 });

  // A mesma mensagem lida de novo não entra duas vezes nem cria outra tarefa.
  assert.deepEqual(await receiveMail(now, { key: () => key, fetch: fetch([reply], 14) }, db.pool), { read: 1, kept: 0 });
  assert.equal((await listPendingActivities({ ownerEmail: SELLER.email }, db.pool)).length, 2);
  // Sem oportunidade em andamento, a resposta vai para a mais recente do contato.
  await moveOpportunity(current, stages.find((stage) => stage.kind === "ganha")!.id, null, SELLER.email, { ownerEmail: null }, db.pool);
  await receiveMail(now, { key: () => key, fetch: fetch([mail(["From: paula@fitclub.test", "Subject: Obrigada", "Message-ID: <r2@fitclub.test>"], "Recebi tudo.")], 15) }, db.pool);
  assert.equal((await listInbox(current, db.pool)).length, 3);

  // O servidor recusou: fica anotado para a tela, a marca não anda, e a próxima leitura limpa o aviso.
  assert.deepEqual(await receiveMail(now, { key: () => key, fetch: async () => { throw new MailError("O servidor de entrada recusou o usuário ou a senha da caixa."); } }, db.pool), { read: 0, kept: 0 });
  assert.equal((await loadInboxInfo(db.pool))!.problem, "O servidor de entrada recusou o usuário ou a senha da caixa.");
  assert.deepEqual((await inboxChannel(db.pool, () => key))!.mark, { uidValidity: 77, lastUid: 15 });
  await receiveMail(now, { key: () => key, fetch: fetch([], 15) }, db.pool);
  assert.equal((await loadInboxInfo(db.pool))!.problem, null);

  // Parar de ler tira a caixa e a senha; o que já entrou fica. Excluir a oportunidade leva as respostas.
  await removeInbox("diretoria@empresa.test", db.pool);
  assert.equal(await loadInboxInfo(db.pool), null);
  assert.equal((await db.pool.query("SELECT imap_password FROM mail_settings")).rows[0].imap_password, null);
  assert.equal((await listInbox(current, db.pool)).length, 3);
  for (const id of [old, current]) await deleteOpportunity(id, { ownerEmail: null }, db.pool);
  assert.equal((await db.pool.query("SELECT count(*) FROM opportunity_inbox")).rows[0].count, "0");
});

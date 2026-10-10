import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { addCadenceStep, createCadence, listEnrollments, startCadence } from "@/lib/db/cadences";
import { createOpportunity, deleteOpportunity, listPendingActivities } from "@/lib/db/funnel";
import { deleteWhatsappTemplate, listConversation, listConversations, listWhatsappTemplates, loadWhatsappInfo, receiveWhatsapp, removeWhatsapp, saveWhatsapp, saveWhatsappTemplate, sendWhatsapp, whatsappAccount, whatsappNumber, windowOpen } from "@/lib/db/whatsapp";
import { eventsOf, signedByMeta, WhatsappError, whatsappSender } from "@/lib/whatsapp/api";
import type { WhatsappSend } from "@/lib/whatsapp/api";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
before(async () => {
  if (!skip) db = await openTestDb("whatsapp");
});
after(async () => {
  if (!skip) await db.close();
});

const notice = (value: Record<string, unknown>, field = "messages") => ({ object: "whatsapp_business_account", entry: [{ id: "1", changes: [{ field, value: { messaging_product: "whatsapp", metadata: { phone_number_id: "111222333" }, ...value } }] }] });

test("aviso da Meta: só vale assinado com o segredo da empresa; mensagens e situações do número certo são lidas, o resto é ignorado", () => {
  const body = JSON.stringify({ a: 1 });
  const signature = `sha256=${createHmac("sha256", "segredo-do-app").update(body).digest("hex")}`;
  assert.equal(signedByMeta(body, signature, "segredo-do-app"), true);
  for (const [text, header, secret] of [[body, signature, "outro-segredo"], [`${body} `, signature, "segredo-do-app"], [body, null, "segredo-do-app"], [body, "sha256=abc", "segredo-do-app"], [body, signature.replace("sha256=", "sha1="), "segredo-do-app"], [body, signature, ""]] as const) {
    assert.equal(signedByMeta(text, header, secret), false);
  }

  const events = eventsOf(
    notice({
      contacts: [{ wa_id: "5517999990000", profile: { name: "Paula Dias" } }],
      messages: [
        { id: "wamid.1", from: "5517999990000", timestamp: "1791547200", type: "text", text: { body: "Pode enviar o orçamento?" } },
        { id: "wamid.2", from: "5517999990000", timestamp: "x", type: "image", image: { id: "9" } },
        { id: "wamid.3", from: "não é número", type: "text", text: { body: "x" } },
        { from: "5517999990000", type: "text", text: { body: "sem id" } },
      ],
      statuses: [{ id: "wamid.9", status: "delivered" }, { id: "wamid.8", status: "failed", errors: [{ title: "Número sem WhatsApp" }] }, { id: "wamid.7", status: "inventada" }],
    }),
    "111222333",
  );
  assert.deepEqual(events.map((event) => (event.kind === "message" ? [event.id, event.from, event.name, event.text] : [event.id, event.status, event.detail])), [
    ["wamid.1", "5517999990000", "Paula Dias", "Pode enviar o orçamento?"],
    ["wamid.2", "5517999990000", "Paula Dias", "(imagem recebida; abra no aparelho para ver)"],
    ["wamid.9", "entregue", null],
    ["wamid.8", "falhou", "Número sem WhatsApp"],
  ]);
  assert.equal((events[0] as { at: Date }).at.toISOString(), new Date(1791547200 * 1000).toISOString());
  // Aviso de outro número, de outro assunto ou torto: nada.
  assert.deepEqual(eventsOf(notice({ messages: [{ id: "a", from: "5517999990000", type: "text", text: { body: "x" } }] }), "999"), []);
  assert.deepEqual(eventsOf(notice({ messages: [{ id: "a", from: "5517999990000", type: "text", text: { body: "x" } }] }, "account_update"), "111222333"), []);
  for (const junk of [null, "texto", 7, {}, { entry: "x" }, { entry: [null, { changes: [null, { field: "messages" }] }] }]) assert.deepEqual(eventsOf(junk, "111222333"), []);
});

test("envio pelo WhatsApp oficial: endereço fixo, chave só no cabeçalho, texto ou modelo; recusa vira aviso sem a chave", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const answering = (status: number, body: unknown) => (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  const account = { phoneNumberId: "111222333", token: "chave-de-acesso-de-teste" };
  assert.deepEqual(await whatsappSender(answering(200, { messages: [{ id: "wamid.10" }] }))(account, { to: "5517999990000", text: "Olá" }), { id: "wamid.10" });
  assert.equal(calls[0].url, "https://graph.facebook.com/v21.0/111222333/messages");
  assert.deepEqual(calls[0].init.headers, { "content-type": "application/json", authorization: "Bearer chave-de-acesso-de-teste" });
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { messaging_product: "whatsapp", recipient_type: "individual", to: "5517999990000", type: "text", text: { preview_url: false, body: "Olá" } });
  await whatsappSender(answering(200, { messages: [{ id: "wamid.11" }] }))(account, { to: "5517999990000", template: { name: "retomada", language: "pt_BR" } });
  assert.deepEqual(JSON.parse(String(calls[1].init.body)).template, { name: "retomada", language: { code: "pt_BR" } });
  const refused = (status: number, body: unknown, expected: RegExp) => assert.rejects(() => whatsappSender(answering(status, body))(account, { to: "5517999990000", text: "Olá" }), (error: unknown) => error instanceof WhatsappError && expected.test(error.message) && !error.message.includes("chave-de-acesso"));
  await refused(401, { error: { message: "Invalid OAuth access token chave-de-acesso-de-teste", code: 190 } }, /recusou a chave de acesso/);
  await refused(400, { error: { message: "(#131047) Re-engagement message\nmais", code: 131047 } }, /recusou a mensagem: \(#131047\) Re-engagement message mais/);
  await refused(500, null, /erro 500/);
  await refused(200, { messages: [] }, /não confirmou/);
  await assert.rejects(() => whatsappSender((async () => { throw new Error("rede"); }) as typeof fetch)(account, { to: "5517999990000", text: "Olá" }), /não respondeu a tempo/);
});

test("conversas: a conta fica cifrada; a mensagem do cliente entra uma vez, para a cadência e vira tarefa; texto livre só na janela de 24 horas", { skip }, async () => {
  const SELLER = { email: "ana@empresa.test", name: "Ana Souza" };
  const OTHER = { email: "caio@empresa.test", name: "Caio" };
  const BOSS = "diretoria@empresa.test";
  const blank = { customerId: null, contactName: null, phone: null, email: null, source: null, estimatedValue: null, notes: null };
  const key = randomBytes(32);
  const now = new Date("2026-10-09T12:00:00Z");
  const hours = (count: number) => new Date(now.getTime() + count * 3_600_000);
  assert.deepEqual(["(17) 99999-0000", "17 3333 0000", "+55 17 99999-0000", "9999-0000", null].map(whatsappNumber), ["5517999990000", "551733330000", "5517999990000", null, null]);

  assert.equal(await loadWhatsappInfo(db.pool), null);
  await assert.rejects(() => saveWhatsapp({ phoneNumberId: "abc", displayPhone: "1", token: "curta", secret: "x" }, key, BOSS, db.pool), (error: unknown) => error instanceof WhatsappError && /Identificador.*cliente vê.*Chave de acesso.*Segredo/.test(error.message));
  await saveWhatsapp({ phoneNumberId: " 111222333 ", displayPhone: "(17) 3333-0000", token: " chave-de-acesso-de-teste-bem-longa ", secret: "segredo-do-app" }, key, BOSS, db.pool);
  const info = (await loadWhatsappInfo(db.pool))!;
  assert.deepEqual([info.phoneNumberId, info.displayPhone], ["111222333", "(17) 3333-0000"]);
  assert.match(info.verifyToken, /^[A-Za-z0-9_-]{32}$/);
  const raw = await db.pool.query("SELECT token, secret FROM whatsapp_settings");
  assert.ok(!(raw.rows[0].token as Buffer).includes("chave-de-acesso") && !(raw.rows[0].secret as Buffer).includes("segredo"));
  assert.deepEqual(await whatsappAccount(db.pool, () => key), { phoneNumberId: "111222333", token: "chave-de-acesso-de-teste-bem-longa", secret: "segredo-do-app", verifyToken: info.verifyToken });
  await assert.rejects(() => whatsappAccount(db.pool, () => randomBytes(32)));
  // Trocar a conta mantém a palavra de conferência já colada na Meta.
  await saveWhatsapp({ phoneNumberId: "111222333", displayPhone: null, token: "chave-de-acesso-de-teste-bem-longa", secret: "segredo-do-app" }, key, BOSS, db.pool);
  assert.equal((await loadWhatsappInfo(db.pool))!.verifyToken, info.verifyToken);

  await assert.rejects(() => saveWhatsappTemplate(null, { name: "Com Espaço", language: "português", preview: "" }, BOSS, db.pool), /Nome do modelo.*Idioma.*Texto do modelo/);
  await saveWhatsappTemplate(null, { name: " Retomada_de_orcamento ", language: "", preview: "Olá! Ainda podemos ajudar com o seu orçamento?" }, BOSS, db.pool);
  await assert.rejects(() => saveWhatsappTemplate(null, { name: "retomada_de_orcamento", language: "pt_BR", preview: "Outro" }, BOSS, db.pool), /Já existe um modelo/);
  const [template] = await listWhatsappTemplates(db.pool);
  assert.deepEqual([template.name, template.language], ["retomada_de_orcamento", "pt_BR"]);

  const id = await createOpportunity({ ...blank, title: "Academia nova", company: "Fit Club", contactName: "Paula", phone: "(17) 99999-0000" }, SELLER, db.pool);
  const theirs = await createOpportunity({ ...blank, title: "Do Caio", company: "Iron Box", phone: "11 98888-7777" }, OTHER, db.pool);
  const sent: WhatsappSend[] = [];
  const way = (at: Date, fail: string | null = null) => ({
    key: () => key, now: at,
    send: async (account: { phoneNumberId: string; token: string }, message: WhatsappSend) => {
      assert.deepEqual(account, { phoneNumberId: "111222333", token: "chave-de-acesso-de-teste-bem-longa" });
      if (fail) throw new WhatsappError(fail);
      sent.push(message);
      return { id: `wamid.out${sent.length}` };
    },
  });
  const mine = { ownerEmail: SELLER.email };

  // Sem o cliente ter escrito: texto livre não sai; modelo aprovado sai. De outro vendedor: como se não existisse.
  await assert.rejects(() => sendWhatsapp(id, { text: "Olá, Paula", templateId: null }, SELLER.email, mine, way(now), db.pool), /mais de 24 horas.*modelo aprovado/);
  await assert.rejects(() => sendWhatsapp(theirs, { text: "", templateId: template.id }, SELLER.email, mine, way(now), db.pool), /Oportunidade não encontrada/);
  await assert.rejects(() => sendWhatsapp(id, { text: "", templateId: 999 }, SELLER.email, mine, way(now), db.pool), /Modelo não encontrado/);
  assert.equal(sent.length, 0);
  assert.deepEqual(await sendWhatsapp(id, { text: "", templateId: template.id }, SELLER.email, mine, way(now), db.pool), { status: "enviada", detail: null });
  assert.deepEqual(sent[0], { to: "5517999990000", template: { name: "retomada_de_orcamento", language: "pt_BR" } });

  // O cliente responde (a Meta manda o número sem o nono dígito): entra uma vez, para a cadência e deixa uma tarefa só.
  const { saveTemplate, listTemplates } = await import("@/lib/db/messages");
  await saveTemplate(null, { name: "Primeiro contato", subject: "Proposta", body: "Olá, {contato}. Posso enviar?" }, BOSS, db.pool);
  const cadence = await createCadence("Retomada", BOSS, db.pool);
  await addCadenceStep(cadence, { kind: "email", waitDays: 3, templateId: (await listTemplates(db.pool))[0].id, taskTitle: null }, db.pool);
  await startCadence(id, cadence, SELLER.email, null, now, db.pool);
  const incoming = eventsOf(notice({ contacts: [{ wa_id: "551799990000", profile: { name: "Paula Dias" } }], messages: [{ id: "wamid.in1", from: "551799990000", timestamp: String(hours(1).getTime() / 1000), type: "text", text: { body: "Pode enviar!" } }, { id: "wamid.in2", from: "551799990000", timestamp: String(hours(1).getTime() / 1000 + 5), type: "text", text: { body: "São 12 estações." } }] }), "111222333");
  assert.deepEqual(await receiveWhatsapp(incoming, hours(1), db.pool), { kept: 2 });
  assert.deepEqual(await receiveWhatsapp(incoming, hours(1), db.pool), { kept: 0 });
  const [enrollment] = await listEnrollments(id, db.pool);
  assert.deepEqual([enrollment.status, enrollment.stoppedReason], ["parada", "O cliente respondeu."]);
  assert.deepEqual((await listPendingActivities(mine, db.pool)).map((task) => task.title), ["Responder o WhatsApp de Paula Dias"]);
  // Número que não é de nenhuma oportunidade: a conversa fica guardada, sem tarefa.
  await receiveWhatsapp(eventsOf(notice({ messages: [{ id: "wamid.in3", from: "5521977776666", timestamp: String(hours(1).getTime() / 1000), type: "text", text: { body: "Vocês atendem o Rio?" } }] }), "111222333"), hours(1), db.pool);

  // Agora a janela está aberta: texto livre sai, e a conversa junta as duas grafias do número.
  assert.equal(await windowOpen("5517999990000", hours(2), db.pool), true);
  assert.deepEqual(await sendWhatsapp(id, { text: " Enviado, Paula.\r\nQualquer dúvida, chame. ", templateId: null }, SELLER.email, mine, way(hours(2)), db.pool), { status: "enviada", detail: null });
  assert.deepEqual(sent[1], { to: "5517999990000", text: "Enviado, Paula.\nQualquer dúvida, chame." });
  // A Meta recusou: fica registrado como não enviado, com o que ela disse.
  assert.deepEqual(await sendWhatsapp(id, { text: "Outra", templateId: null }, SELLER.email, mine, way(hours(2), "O WhatsApp recusou a mensagem: número bloqueado"), db.pool), { status: "falhou", detail: "O WhatsApp recusou a mensagem: número bloqueado" });
  // Situações: andam para a frente, nunca para trás; falha depois de enviada fica como falha.
  await receiveWhatsapp(eventsOf(notice({ statuses: [{ id: "wamid.out2", status: "read" }, { id: "wamid.out2", status: "delivered" }, { id: "wamid.out1", status: "failed", errors: [{ title: "Número sem WhatsApp" }] }, { id: "wamid.in1", status: "read" }] }), "111222333"), hours(2), db.pool);
  assert.deepEqual((await listConversation("5517999990000", db.pool)).map((message) => [message.direction, message.body, message.status, message.detail]), [
    ["saida", "Olá! Ainda podemos ajudar com o seu orçamento?", "falhou", "Número sem WhatsApp"],
    ["entrada", "Pode enviar!", "recebida", null],
    ["entrada", "São 12 estações.", "recebida", null],
    ["saida", "Enviado, Paula.\nQualquer dúvida, chame.", "lida", null],
    ["saida", "Outra", "falhou", "O WhatsApp recusou a mensagem: número bloqueado"],
  ]);
  // Passadas 24 horas da última mensagem do cliente, a janela fecha de novo.
  assert.equal(await windowOpen("5517999990000", hours(26), db.pool), false);

  // Lista: o vendedor vê só as das suas oportunidades; quem vê a equipe vê também o número sem oportunidade.
  assert.deepEqual((await listConversations(mine, db.pool)).map((row) => [row.contact, row.opportunityTitle, row.name]), [["5517999990000", "Academia nova", "Paula Dias"]]);
  assert.deepEqual((await listConversations({ ownerEmail: OTHER.email }, db.pool)), []);
  assert.ok((await listConversations({ ownerEmail: null }, db.pool)).some((row) => row.contact === "5521977776666" && row.opportunityId === null && row.waiting));

  // Sem a conta, nada sai; as conversas ficam.
  await deleteWhatsappTemplate(template.id, db.pool);
  await removeWhatsapp(db.pool);
  await assert.rejects(() => sendWhatsapp(id, { text: "Oi", templateId: null }, SELLER.email, mine, way(hours(2)), db.pool), /ainda não foi cadastrada/);
  assert.equal((await listConversation("5517999990000", db.pool)).length, 5);
  for (const opportunity of [id, theirs]) await deleteOpportunity(opportunity, { ownerEmail: null }, db.pool);
});

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const read = (file: string) => readFileSync(SRC + file, "utf8");

test("WhatsApp no código: o aviso só é aceito assinado, a conta nunca vai a log nem à tela, e o endereço de envio é fixo", () => {
  const route = read("app/whatsapp/[empresa]/route.ts");
  // Nada do aviso é lido como verdade antes da assinatura.
  assert.ok(route.indexOf("signedByMeta(body,") < route.indexOf("JSON.parse(body)") && route.indexOf("signedByMeta(body,") < route.indexOf("receiveWhatsapp("));
  assert.doesNotMatch(route, /tenantDb|getSession|cookies\(|console\./);
  const door = read("lib/whatsapp/public.ts");
  assert.ok(door.indexOf("if (!tenant) return null;") < door.indexOf("tenantDb("));
  const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx?$/.test(file));
  assert.deepEqual(sources.filter((file) => read(file).includes("openWhatsappHook(") && file !== "lib/whatsapp/public.ts"), ["app/whatsapp/[empresa]/route.ts"]);
  const api = read("lib/whatsapp/api.ts");
  assert.doesNotMatch(api, /console\./);
  assert.equal(api.match(/https?:\/\/[^"`\s]+/g)?.join(), "https://graph.facebook.com/v21.0");
  for (const file of ["app/(app)/parametros/whatsapp/page.tsx", "app/(app)/funil/[id]/whatsapp/page.tsx", "app/(app)/funil/conversas/page.tsx"]) assert.doesNotMatch(read(file), /whatsappAccount|openSecret|ERP_CERT_KEY/, file);
  assert.doesNotMatch(read("app/(app)/parametros/whatsapp/page.tsx"), /type="password"[^>]*defaultValue/);
  for (const line of read("app/(app)/parametros/whatsapp/actions.ts").split("\n").filter((text) => /console\.(info|error|log|warn)/.test(text))) assert.doesNotMatch(line, /accessKey|appSecret|token|secret|formData/i, line.trim());
  // Não é o serviço não oficial: só a API da Meta.
  for (const file of sources.filter((name) => /whatsapp/i.test(name))) assert.doesNotMatch(read(file), /baileys|wppconnect|venom|evolution|z-api|whatsapp-web/i, file);
});

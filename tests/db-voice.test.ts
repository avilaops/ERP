import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createOpportunity, deleteOpportunity, listActivities } from "@/lib/db/funnel";
import { createHmac } from "node:crypto";
import { callNumber, callOpportunity, callPhoneOf, callsThisMonth, loadVoiceSettings, minutesThisMonth, noteCallEnded, saveVoiceSettings } from "@/lib/db/voice";
import { signedByProvider, startCall, voiceConfig, VoiceError } from "@/lib/voice/call";
import { callStatusUrl } from "@/lib/voice/public";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
before(async () => {
  if (!skip) db = await openTestDb("telefonia");
});
after(async () => {
  if (!skip) await db.close();
});

const SID = `AC${"0123456789abcdef".repeat(2)}`;
const ENV = { ERP_TWILIO_ACCOUNT_SID: SID, ERP_TWILIO_AUTH_TOKEN: "segredo-de-teste", ERP_TWILIO_VOICE_FROM: "+551133330000" };

test("telefonia: só existe com a conta e o número de voz; o pedido de ligação leva só os dois números, e a recusa não mostra o segredo", async () => {
  assert.deepEqual(voiceConfig(ENV), { accountSid: SID, authToken: "segredo-de-teste", from: "+551133330000" });
  for (const env of [{}, { ...ENV, ERP_TWILIO_VOICE_FROM: "" }, { ...ENV, ERP_TWILIO_VOICE_FROM: "1133330000" }, { ...ENV, ERP_TWILIO_ACCOUNT_SID: "errado" }, { ...ENV, ERP_TWILIO_AUTH_TOKEN: " " }]) assert.equal(voiceConfig(env), null);
  const calls: { url: string; init: { headers: Record<string, string>; body: string } }[] = [];
  const answering = (status: number, body: unknown) => async (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => {
    calls.push({ url, init });
    return { status, json: async () => body };
  };
  const config = voiceConfig(ENV)!;
  assert.deepEqual(await startCall(config, { seller: "5517999990000", customer: "551733334444" }, answering(201, { sid: "CA123" })), { id: "CA123" });
  assert.equal(calls[0].url, `https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`);
  assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from(`${SID}:segredo-de-teste`).toString("base64")}`);
  const sent = new URLSearchParams(calls[0].init.body);
  assert.deepEqual([sent.get("To"), sent.get("From")], ["+5517999990000", "+551133330000"]);
  assert.equal(sent.get("Twiml"), '<Response><Say language="pt-BR">Conectando com o cliente.</Say><Dial callerId="+551133330000" timeout="30"><Number>+551733334444</Number></Dial></Response>');
  // Nada é gravado.
  assert.doesNotMatch(calls[0].init.body, /record/i);
  // Número que não é só dígitos não chega às instruções da ligação.
  for (const bad of ["5517999990000</Number><Number>+5511", "17999990000", ""]) await assert.rejects(() => startCall(config, { seller: "5517999990000", customer: bad }, answering(201, { sid: "x" })), /Telefone inválido/);
  assert.equal(calls.length, 1);
  await assert.rejects(() => startCall(config, { seller: "5517999990000", customer: "551733334444" }, answering(401, { message: "Authenticate\nsegredo" })), (error: unknown) => error instanceof VoiceError && /recusou a ligação \(401\): Authenticate segredo/.test(error.message) && !error.message.includes("segredo-de-teste"));
  await assert.rejects(() => startCall(config, { seller: "5517999990000", customer: "551733334444" }, answering(201, {})), /não confirmou/);
  await assert.rejects(() => startCall(config, { seller: "5517999990000", customer: "551733334444" }, async () => { throw new Error("rede"); }), /não respondeu/);
  // Com endereço público, o provedor é pedido para avisar o fim da ligação; sem https, não.
  await startCall(config, { seller: "5517999990000", customer: "551733334444", statusUrl: "https://erp.exemplo.test/telefonia/acme" }, answering(201, { sid: "CA124" }));
  const asked = new URLSearchParams(calls.at(-1)!.init.body);
  assert.deepEqual([asked.get("StatusCallback"), asked.get("StatusCallbackEvent"), asked.get("StatusCallbackMethod")], ["https://erp.exemplo.test/telefonia/acme", "completed", "POST"]);
  assert.equal(new URLSearchParams(calls[0].init.body).get("StatusCallback"), null);
  assert.deepEqual([callStatusUrl("acme", { APP_URL: "https://erp.exemplo.test/" }), callStatusUrl("acme", { APP_URL: "http://localhost:3020" }), callStatusUrl("acme", {})], ["https://erp.exemplo.test/telefonia/acme", null, null]);
  // O aviso só vale assinado com o segredo da conta, para aquele endereço e aqueles campos.
  const url = "https://erp.exemplo.test/telefonia/acme";
  const notice = { CallSid: "CA124", CallStatus: "completed", CallDuration: "187" };
  const signature = createHmac("sha1", "segredo-de-teste").update(`${url}CallDuration187CallSidCA124CallStatuscompleted`).digest("base64");
  assert.equal(signedByProvider(url, notice, signature, "segredo-de-teste"), true);
  for (const [address, fields, header, secret] of [[`${url}x`, notice, signature, "segredo-de-teste"], [url, { ...notice, CallDuration: "9999" }, signature, "segredo-de-teste"], [url, notice, signature, "outro"], [url, notice, null, "segredo-de-teste"], [url, notice, "abc", "segredo-de-teste"], [url, notice, signature, ""]] as const) {
    assert.equal(signedByProvider(address, fields, header, secret), false);
  }
  assert.deepEqual(["(17) 99999-0000", "+55 17 3333-4444", "017999990000", "9999-0000", null].map(callNumber), ["5517999990000", "551733334444", "5517999990000", null, null]);
});

test("ligação pelo sistema: desligada por padrão, dentro do limite do mês, só na oportunidade ao alcance; fica anotada e lembra o telefone de quem ligou", { skip }, async () => {
  const SELLER = { email: "ana@empresa.test", name: "Ana Souza" };
  const OTHER = { email: "caio@empresa.test", name: "Caio" };
  const blank = { customerId: null, contactName: null, phone: null, email: null, source: null, estimatedValue: null, notes: null };
  await db.pool.query("INSERT INTO users (email, name, role, updated_by) VALUES ($1, $2, 'VENDEDOR', 'teste')", [SELLER.email, SELLER.name]);
  const id = await createOpportunity({ ...blank, title: "Academia nova", company: "Fit Club", contactName: "Paula", phone: "(17) 3333-4444" }, SELLER, db.pool);
  const silent = await createOpportunity({ ...blank, title: "Sem telefone", company: "Studio Corpo" }, SELLER, db.pool);
  const now = new Date("2026-10-09T12:00:00Z");
  const started: { seller: string; customer: string }[] = [];
  const way = (configured = true, at = now) => ({ config: configured ? voiceConfig(ENV) : null, now: at, start: async (_config: unknown, call: { seller: string; customer: string }) => { started.push(call); return { id: `CA${started.length}` }; } });
  const mine = { ownerEmail: SELLER.email };

  assert.deepEqual(await loadVoiceSettings(db.pool), { enabled: false, monthlyLimit: 300 });
  await assert.rejects(() => callOpportunity(id, "17999990000", SELLER, mine, way(false), db.pool), /não está configurada neste servidor/);
  await assert.rejects(() => callOpportunity(id, "17999990000", SELLER, mine, way(), db.pool), (error: unknown) => error instanceof VoiceError && /desligada para esta empresa/.test(error.message));
  await assert.rejects(() => saveVoiceSettings({ enabled: true, monthlyLimit: 0 }, "diretoria@empresa.test", db.pool), /de 1 a 20\.000/);
  await saveVoiceSettings({ enabled: true, monthlyLimit: 2 }, "diretoria@empresa.test", db.pool);
  await assert.rejects(() => callOpportunity(id, "9999-0000", SELLER, mine, way(), db.pool), /Informe o seu telefone com DDD/);
  await assert.rejects(() => callOpportunity(silent, "17999990000", SELLER, mine, way(), db.pool), /não tem um telefone com DDD/);
  await assert.rejects(() => callOpportunity(id, "17999990000", OTHER, { ownerEmail: OTHER.email }, way(), db.pool), /Oportunidade não encontrada/);
  await assert.rejects(() => callOpportunity(id, "(17) 3333-4444", SELLER, mine, way(), db.pool), /são o mesmo número/);
  assert.equal(started.length, 0);

  await callOpportunity(id, "(17) 99999-0000", SELLER, mine, way(), db.pool);
  assert.deepEqual(started, [{ seller: "5517999990000", customer: "551733334444", statusUrl: null }]);
  assert.equal(await callPhoneOf(SELLER.email, db.pool), "5517999990000");
  assert.deepEqual((await listActivities(id, db.pool)).map((activity) => [activity.kind, activity.title, activity.doneAt !== null, activity.doneBy]), [["ligacao", "Ligação pelo sistema para Paula", true, SELLER.email]]);
  // O provedor avisa o fim: a duração entra na ligação e na atividade, uma vez; aviso de ligação desconhecida não muda nada.
  assert.equal(await noteCallEnded("CA1", "completed", 187, db.pool), true);
  assert.equal(await noteCallEnded("CA1", "completed", 999, db.pool), false);
  assert.equal(await noteCallEnded("CA-de-outro", "completed", 60, db.pool), false);
  assert.equal(await noteCallEnded("CA1", "inventado", 60, db.pool), false);
  assert.deepEqual((await listActivities(id, db.pool)).map((activity) => activity.title), ["Ligação pelo sistema para Paula (3 min)"]);
  assert.equal(await minutesThisMonth(now, db.pool), 4);
  // Limite do mês: na terceira acabou; no mês seguinte volta.
  await callOpportunity(id, "17999990000", SELLER, mine, way(), db.pool);
  await assert.rejects(() => callOpportunity(id, "17999990000", SELLER, mine, way(), db.pool), /limite de ligações pelo sistema deste mês/);
  assert.equal(await callsThisMonth(now, db.pool), 2);
  assert.equal(await noteCallEnded("CA2", "no-answer", 0, db.pool), true);
  assert.ok((await listActivities(id, db.pool)).some((activity) => activity.title === "Ligação pelo sistema para Paula (não atendida)"));
  await callOpportunity(id, "17999990000", SELLER, mine, way(true, new Date("2026-11-03T12:00:00Z")), db.pool);
  // A falha do provedor não deixa registro de ligação feita.
  await saveVoiceSettings({ enabled: true, monthlyLimit: 300 }, "diretoria@empresa.test", db.pool);
  await assert.rejects(() => callOpportunity(id, "17999990000", SELLER, mine, { ...way(), start: async () => { throw new VoiceError("O serviço de telefonia recusou a ligação (400)."); } }, db.pool), /recusou a ligação/);
  assert.equal(await callsThisMonth(now, db.pool), 2);
  // Excluir a oportunidade mantém o uso contado.
  for (const opportunity of [id, silent]) await deleteOpportunity(opportunity, { ownerEmail: null }, db.pool);
  assert.equal(await callsThisMonth(now, db.pool), 2);
});

import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { apiAccess } from "@/lib/api/access";
import { AddressError, checkPublicUrl, isPrivateAddress } from "@/lib/api/address";
import { hashApiKey, newApiKey, signWebhook, tenantOfKey } from "@/lib/api/keys";
import { createApiKey, createWebhook, deleteWebhook, deliverPending, emitEvent, listApiKeys, listDeliveries, listWebhooks, matchApiKey, MAX_ATTEMPTS, retryDelivery, revokeApiKey, setWebhookActive } from "@/lib/db/integrations";
import { createUser } from "@/lib/db/users";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
before(async () => {
  if (!skip) db = await openTestDb("integracoes");
});
after(async () => {
  if (!skip) await db.close();
});

test("chave da API: leva a empresa, só o resumo é guardado, e o formato errado não é chave", () => {
  const made = newApiKey("ludus");
  assert.match(made.key, /^erp_ludus_[A-Za-z0-9_-]{43}$/);
  assert.equal(tenantOfKey(made.key), "ludus");
  assert.equal(made.hash, hashApiKey(made.key));
  assert.ok(!made.hash.includes(made.key.slice(-20)) && made.key.startsWith(made.prefix) && made.prefix.length < 20);
  assert.notEqual(newApiKey("ludus").key, made.key);
  // Mil chaves: toda uma lê a empresa certa, e nenhuma vira chave com uma letra a mais ou a menos.
  for (let count = 0; count < 1000; count += 1) {
    const { key } = newApiKey("a_b");
    assert.equal(tenantOfKey(key), "a_b", key);
    assert.equal(tenantOfKey(`${key}x`), null, key);
    assert.equal(tenantOfKey(key.slice(0, -1)), null, key);
  }
  for (const junk of ["", "erp_ludus_curta", "erp__" + "a".repeat(43), "erp_LUDUS_" + "a".repeat(43), "outra_ludus_" + "a".repeat(43), `${made.key}x`, "erp_ludus; drop_" + "a".repeat(43)]) assert.equal(tenantOfKey(junk), null, junk);
});

test("destino de aviso: só https, em nome público, que não aponte para rede interna", async () => {
  for (const address of ["10.0.0.5", "127.0.0.1", "172.31.0.11", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) assert.equal(isPrivateAddress(address), true, address);
  for (const address of ["8.8.8.8", "178.105.82.48", "2606:4700::1111"]) assert.equal(isPrivateAddress(address), false, address);
  const publicDns = async () => ["93.184.216.34"];
  assert.equal((await checkPublicUrl(" https://n8n.exemplo.com.br/webhook/erp ", publicDns)).toString(), "https://n8n.exemplo.com.br/webhook/erp");
  const refused = (url: string, message: RegExp, dns: (host: string) => Promise<string[]> = publicDns) => assert.rejects(() => checkPublicUrl(url, dns), (error: unknown) => error instanceof AddressError && message.test(error.message), url);
  await refused("http://n8n.exemplo.com.br/x", /começar com https/);
  await refused("ftp://n8n.exemplo.com.br/x", /começar com https/);
  await refused("nada", /Endereço inválido/);
  await refused("https://usuario:senha@n8n.exemplo.com.br/x", /usuário e senha/);
  await refused("https://n8n.exemplo.com.br:5432/x", /Porta não aceita/);
  for (const url of ["https://10.66.0.10/x", "https://[::1]/x", "https://localhost/x", "https://orchestrator.avilaops/x", "https://servidor/x", "https://db.internal/x"]) await refused(url, /nome público na internet/);
  // Um nome público que resolve para dentro da rede é recusado: é o truque para alcançar os outros sistemas do servidor.
  await refused("https://esperto.exemplo.com/x", /rede interna/, async () => ["93.184.216.34", "10.66.0.10"]);
  await refused("https://esperto.exemplo.com/x", /rede interna/, async () => ["127.0.0.1"]);
  await refused("https://sumiu.exemplo.com/x", /não foi encontrado/, async () => { throw new Error("ENOTFOUND"); });
});

test("assinatura do aviso: HMAC do instante e do corpo, com o segredo do destino", () => {
  const at = new Date("2026-10-09T12:00:00Z");
  const signature = signWebhook("whsec_teste", '{"a":1}', at);
  assert.equal(signature, `t=1791547200,v1=${createHmac("sha256", "whsec_teste").update('1791547200.{"a":1}').digest("hex")}`);
  assert.notEqual(signWebhook("whsec_outro", '{"a":1}', at), signature);
  assert.notEqual(signWebhook("whsec_teste", '{"a":2}', at), signature);
});

test("API: a chave é de uma empresa, pode só ler ou gravar, e revogada para na hora", { skip }, async () => {
  await createUser({ email: "ana@empresa.test", name: "Ana Souza", role: "VENDEDOR" }, "diretoria@empresa.test", db.pool);
  await assert.rejects(() => createApiKey("acme", { name: "x", canWrite: false, ownerEmail: "ana@empresa.test" }, "diretoria@empresa.test", db.pool), /para que serve a chave/);
  await assert.rejects(() => createApiKey("acme", { name: "n8n", canWrite: true, ownerEmail: "ninguem@empresa.test" }, "diretoria@empresa.test", db.pool), /em nome de quem a chave grava/);
  const made = await createApiKey("acme", { name: " n8n  produção ", canWrite: true, ownerEmail: " Ana@Empresa.test " }, "diretoria@empresa.test", db.pool);
  assert.deepEqual([made.record.name, made.record.canWrite, made.record.ownerName, made.record.lastUsedAt, made.record.revokedAt], ["n8n produção", true, "Ana Souza", null, null]);
  // O banco não guarda a chave.
  const stored = await db.pool.query("SELECT row_to_json(k)::text AS dump FROM api_keys k");
  assert.ok(!String(stored.rows[0].dump).includes(made.key) && !String(stored.rows[0].dump).includes(made.key.slice(-30)));
  assert.equal((await matchApiKey(made.key, db.pool))?.id, made.record.id);
  assert.ok((await listApiKeys(db.pool))[0].lastUsedAt !== null);
  assert.equal(await matchApiKey(newApiKey("acme").key, db.pool), null);
  await revokeApiKey(made.record.id, "diretoria@empresa.test", db.pool);
  assert.equal(await matchApiKey(made.key, db.pool), null);
  await assert.rejects(() => revokeApiKey(made.record.id, "diretoria@empresa.test", db.pool), /já revogada/);

  // A porta da API: sem chave, com chave de empresa que não existe ou fora do formato, a resposta é a mesma.
  const call = (authorization: string | null) => apiAccess(new Request("https://erp.teste/api/v1/clientes", { headers: authorization ? { authorization } : {} }), { ERP_TENANTS: "acme:Acme" });
  for (const header of [null, "Bearer nada", `Bearer ${newApiKey("outra").key}`, `Basic ${made.key}`, made.key]) {
    const answer = await call(header);
    assert.ok(answer instanceof Response && answer.status === 401, String(header).slice(0, 20));
    assert.deepEqual(await (answer as Response).json(), { erro: "Chave inválida. Envie o cabeçalho Authorization: Bearer <chave>." });
  }
});

test("avisos: gravados para quem pediu o evento, entregues assinados, com tentativas contadas e sem seguir redirecionamento", { skip }, async () => {
  const vault = randomBytes(32);
  const dns = async () => ["93.184.216.34"];
  await assert.rejects(() => createWebhook({ name: "n8n", url: "https://10.66.0.10/x", events: ["pedido.fechado"] }, vault, "d@e.test", db.pool, dns), /nome público na internet/);
  await assert.rejects(() => createWebhook({ name: "n8n", url: "https://n8n.exemplo.com/x", events: ["evento.que.nao.existe"] }, vault, "d@e.test", db.pool, dns), /Marque ao menos um aviso/);
  const made = await createWebhook({ name: "n8n", url: "https://n8n.exemplo.com/webhook/erp", events: ["pedido.fechado", "oportunidade.criada", "invalido"] }, vault, "d@e.test", db.pool, dns);
  assert.match(made.secret, /^whsec_[A-Za-z0-9_-]{32}$/);
  // O segredo fica cifrado.
  const stored = await db.pool.query("SELECT encode(secret, 'escape') AS secret, events FROM webhooks WHERE id = $1", [made.id]);
  assert.ok(!String(stored.rows[0].secret).includes(made.secret));
  assert.deepEqual(stored.rows[0].events, ["pedido.fechado", "oportunidade.criada"]);

  const now = new Date("2026-10-09T12:00:00Z");
  // Evento que ninguém pediu não gera aviso.
  assert.equal(await emitEvent("contrato.assinado", { pedido: "261009-AAAA" }, now, db.pool), 0);
  assert.equal(await emitEvent("pedido.fechado", { numero: "261009-AAAA", cliente: "Fit Club" }, now, db.pool), 1);
  const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string; redirect: string } }[] = [];
  let answer = 500;
  const post = async (url: string, init: (typeof calls)[number]["init"]) => {
    calls.push({ url, init });
    return { status: answer };
  };
  // O destino respondeu erro: conta a tentativa e fica como falha, para tentar de novo.
  assert.deepEqual(await deliverPending(() => vault, now, db.pool, post, dns), { delivered: 0, failed: 1 });
  assert.deepEqual((await listDeliveries(db.pool)).map((delivery) => [delivery.event, delivery.status, delivery.attempts, delivery.lastResult]), [["pedido.fechado", "falhou", 1, "resposta 500"]]);
  // Um redirecionamento não é seguido nem conta como entrega.
  answer = 302;
  assert.deepEqual(await deliverPending(() => vault, now, db.pool, post, dns), { delivered: 0, failed: 1 });
  assert.equal(calls[1].init.redirect, "manual");
  answer = 200;
  assert.deepEqual(await deliverPending(() => vault, now, db.pool, post, dns), { delivered: 1, failed: 0 });
  // O que chegou: POST, assinado com o segredo do destino, com o evento e os dados.
  const sent = calls[2];
  assert.equal(sent.url, "https://n8n.exemplo.com/webhook/erp");
  assert.equal(sent.init.method, "POST");
  assert.equal(sent.init.headers["X-ERP-Evento"], "pedido.fechado");
  assert.equal(sent.init.headers["X-ERP-Assinatura"], signWebhook(made.secret, sent.init.body, now));
  const body = JSON.parse(sent.init.body);
  assert.deepEqual([body.evento, body.em, body.dados, typeof body.id], ["pedido.fechado", "2026-10-09T12:00:00.000Z", { numero: "261009-AAAA", cliente: "Fit Club" }, "number"]);
  // Entregue não vai de novo.
  assert.deepEqual(await deliverPending(() => vault, now, db.pool, post, dns), { delivered: 0, failed: 0 });
  assert.equal((await listWebhooks(db.pool))[0].delivered, 1);

  // Depois de cinco tentativas o aviso para; "Tentar de novo" devolve as tentativas.
  await emitEvent("oportunidade.criada", { id: 1 }, now, db.pool);
  answer = 503;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) assert.deepEqual(await deliverPending(() => vault, now, db.pool, post, dns), { delivered: 0, failed: 1 });
  assert.deepEqual(await deliverPending(() => vault, now, db.pool, post, dns), { delivered: 0, failed: 0 });
  const [stuck] = await listDeliveries(db.pool);
  assert.deepEqual([stuck.status, stuck.attempts], ["falhou", MAX_ATTEMPTS]);
  await retryDelivery(stuck.id, db.pool);
  // Destino que passou a apontar para dentro da rede, chave do cofre errada ou destino que não responde: falha, sem enviar nada para lá.
  const before = calls.length;
  assert.deepEqual(await deliverPending(() => vault, now, db.pool, post, async () => ["10.66.0.10"]), { delivered: 0, failed: 1 });
  assert.deepEqual(await deliverPending(() => randomBytes(32), now, db.pool, post, dns), { delivered: 0, failed: 1 });
  assert.equal(calls.length, before);
  assert.deepEqual(await deliverPending(() => vault, now, db.pool, async () => { throw new Error("ECONNREFUSED"); }, dns), { delivered: 0, failed: 1 });
  assert.match((await listDeliveries(db.pool))[0].lastResult ?? "", /não respondeu/);
  // Pausado não recebe aviso novo nem tentativa; removido leva o registro das entregas.
  await setWebhookActive(made.id, false, db.pool);
  assert.equal(await emitEvent("pedido.fechado", { numero: "261009-BBBB" }, now, db.pool), 0);
  answer = 200;
  assert.deepEqual(await deliverPending(() => vault, now, db.pool, post, dns), { delivered: 0, failed: 0 });
  await deleteWebhook(made.id, db.pool);
  assert.deepEqual([await listWebhooks(db.pool), await listDeliveries(db.pool)], [[], []]);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { provisionAccess, provisionConfig, ProvisionError } from "@/lib/auth/provision";
import { INVITE_OFF, inviteByMail, inviteText } from "@/lib/db/invite";
import { createUser, listUsers, updateUser } from "@/lib/db/users";
import { MailError } from "@/lib/mail/message";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
before(async () => {
  if (!skip) db = await openTestDb("invite");
});
after(async () => {
  if (!skip) await db.close();
});

const CONFIG = { url: "https://auth.avilaops.com", clientId: "erp", secret: "segredo do erp" };
type Call = { url: string; init: { method: string; headers: Record<string, string>; body: string } };
const central = (status: number, body: unknown, calls: Call[] = []) => async (url: string, init: Call["init"]) => {
  calls.push({ url, init });
  return { status, json: async () => body };
};

test("login central: sem credencial o convite fica desligado; com ela, só por https", () => {
  assert.equal(provisionConfig({}), null);
  assert.equal(provisionConfig({ ERP_AUTH_CLIENT_SECRET: "  " }), null);
  assert.deepEqual(provisionConfig({ ERP_AUTH_CLIENT_SECRET: " s " }), { url: "https://auth.avilaops.com", clientId: "erp", secret: "s" });
  assert.deepEqual(provisionConfig({ ERP_AUTH_CLIENT_SECRET: "s", ERP_AUTH_CLIENT_ID: "erp2", ERP_AUTH_URL: "https://auth.teste/" }), { url: "https://auth.teste", clientId: "erp2", secret: "s" });
  assert.throws(() => provisionConfig({ ERP_AUTH_CLIENT_SECRET: "s", ERP_AUTH_URL: "http://auth.teste" }), ProvisionError);
});

test("login central: a credencial vai em Basic, e só um endereço do próprio login é aceito como convite", async () => {
  const calls: Call[] = [];
  const created = await provisionAccess(CONFIG, { email: "ana@empresa.test", name: "Ana" }, central(201, { email: "ana@empresa.test", criada: true, convite: "https://auth.avilaops.com/recuperar/abc" }, calls));
  assert.deepEqual(created, { created: true, invite: "https://auth.avilaops.com/recuperar/abc" });
  assert.equal(calls[0].url, "https://auth.avilaops.com/api/provisionamento/acessos");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(Buffer.from(calls[0].init.headers.Authorization.slice(6), "base64").toString(), "erp:segredo%20do%20erp");
  assert.deepEqual(JSON.parse(calls[0].init.body), { email: "ana@empresa.test", nome: "Ana" });
  // Conta que já existia: sem convite.
  assert.deepEqual(await provisionAccess(CONFIG, { email: "ana@empresa.test", name: "Ana" }, central(200, { criada: false, convite: null })), { created: false, invite: null });
  // Endereço de outro lugar nunca segue para a pessoa.
  await assert.rejects(() => provisionAccess(CONFIG, { email: "a@b.co", name: "A" }, central(201, { criada: true, convite: "https://auth.avilaops.com.evil.io/recuperar/abc" })), /endereço de convite inesperado/);
  await assert.rejects(() => provisionAccess(CONFIG, { email: "a@b.co", name: "A" }, central(401, { error: "Cliente ou segredo inválidos." })), /recusou a credencial do ERP/);
  await assert.rejects(() => provisionAccess(CONFIG, { email: "a@b.co", name: "A" }, central(409, { error: "Esta conta está desligada no login único. Fale com a equipe Avila Ops." })), /conta está desligada/);
  await assert.rejects(() => provisionAccess(CONFIG, { email: "a@b.co", name: "A" }, async () => { throw new Error("ECONNREFUSED"); }), /não respondeu/);
});

test("mensagem do convite: conta nova recebe o endereço da senha; quem já tem conta, só o do sistema", () => {
  const base = { name: "Ana", company: "Acme", invitedBy: "Rogério", appUrl: "https://erp.avilaops.com" };
  const fresh = inviteText({ ...base, invite: "https://auth.avilaops.com/recuperar/abc" });
  assert.match(fresh, /Rogério liberou o seu acesso ao sistema de Acme/);
  assert.ok(fresh.includes("https://auth.avilaops.com/recuperar/abc") && fresh.includes("https://erp.avilaops.com") && fresh.includes("vale por 7 dias"));
  const known = inviteText({ ...base, invite: null });
  assert.ok(!known.includes("recuperar") && known.includes("https://erp.avilaops.com") && known.includes("senha que já usa"));
});

test("convite por e-mail: pede a conta, escreve para a pessoa e guarda o resultado, nunca o endereço", { skip }, async () => {
  const ana = await createUser({ email: "ana@empresa.test", name: "Ana Souza", role: "VENDEDOR" }, "diretoria@empresa.test", db.pool);
  assert.equal(ana.invite, null);
  const outbox: { to: string; text: string }[] = [];
  const now = new Date("2026-10-09T12:00:00Z");
  const env = { ERP_SMTP_HOST: "mail.avilaops.com", ERP_SMTP_USER: "noreply@avilaops.com", ERP_SMTP_PASSWORD: "x", ERP_MAIL_FROM: "noreply@avilaops.com", ERP_AUTH_CLIENT_SECRET: "segredo" };
  const request = {
    userId: ana.id, company: "Acme", appUrl: "https://erp.avilaops.com", invitedBy: "Rogério", now, env,
    key: () => { throw new Error("sem caixa própria"); },
    send: async (_config: unknown, envelope: { from: string; to: string }, message: string) =>
      void outbox.push({ to: envelope.to, text: Buffer.from(message.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0], "base64").toString("utf8") }),
    fetcher: central(201, { criada: true, convite: "https://auth.avilaops.com/recuperar/segredo-do-convite" }),
  };
  const saved = async () => (await listUsers(db.pool)).find((user) => user.id === ana.id)!.invite;

  // Sem a credencial do login central: nada é enviado, e a tela diz que o convite está desligado.
  assert.deepEqual(await inviteByMail({ ...request, env: { ...env, ERP_AUTH_CLIENT_SECRET: "" } }, db.pool), { status: "pendente", detail: INVITE_OFF });
  assert.equal(outbox.length, 0);
  // Sem caixa de saída, o login central nem é chamado.
  const calls: Call[] = [];
  const noBox = await inviteByMail({ ...request, env: { ERP_AUTH_CLIENT_SECRET: "segredo" }, fetcher: central(201, {}, calls) }, db.pool);
  assert.equal(noBox.status, "falhou");
  assert.match(noBox.detail ?? "", /Envio de e-mail não configurado/);
  assert.equal(calls.length, 0);

  assert.deepEqual(await inviteByMail(request, db.pool), { status: "enviado", detail: "com o endereço para criar a senha" });
  assert.equal(outbox[0].to, "ana@empresa.test");
  assert.ok(outbox[0].text.includes("https://auth.avilaops.com/recuperar/segredo-do-convite") && outbox[0].text.includes("Olá, Ana Souza."));
  assert.deepEqual(await saved(), { status: "enviado", detail: "com o endereço para criar a senha", at: now });
  // O endereço do convite não fica em coluna nenhuma.
  const row = await db.pool.query("SELECT row_to_json(u)::text AS dump FROM users u WHERE id = $1", [ana.id]);
  assert.ok(!String(row.rows[0].dump).includes("recuperar"));

  // Quem já tinha conta: mensagem sem endereço de senha.
  assert.equal((await inviteByMail({ ...request, fetcher: central(200, { criada: false, convite: null }) }, db.pool)).detail, "a pessoa já tinha conta no login: entra com a senha que já usa");
  assert.ok(!outbox[1].text.includes("recuperar"));
  // Recusa do login central ou do servidor de e-mail: fica dito na pessoa.
  assert.deepEqual(await inviteByMail({ ...request, fetcher: central(409, { error: "Esta conta está desligada no login único. Fale com a equipe Avila Ops." }) }, db.pool), { status: "falhou", detail: "Esta conta está desligada no login único. Fale com a equipe Avila Ops." });
  const refused = await inviteByMail({ ...request, send: async () => { throw new MailError("O servidor de e-mail recusou (destinatário): 550 caixa inexistente"); } }, db.pool);
  assert.deepEqual([refused.status, (await saved())?.status], ["falhou", "falhou"]);
  assert.equal(outbox.length, 2);
  // Pessoa sem acesso não é convidada.
  await updateUser(ana.id, { name: "Ana Souza", role: "VENDEDOR", active: false }, "diretoria@empresa.test", db.pool);
  assert.match((await inviteByMail(request, db.pool)).detail ?? "", /Pode entrar/);
});

test("convite: só quem tem Equipe envia, a empresa e quem convida saem da sessão, e o endereço não vai a log nem a tela", () => {
  const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const actions = read("app/(app)/equipe/actions.ts");
  assert.equal(actions.split("inviteByMail({").length - 1, 2);
  assert.equal(actions.split("company: session.tenant.name, appUrl: publicAppUrl(), invitedBy: session.name").length - 1, 2);
  for (const file of ["app/(app)/equipe/actions.ts", "lib/db/invite.ts", "lib/auth/provision.ts"]) {
    for (const line of read(file).split("\n").filter((text) => /console\.(info|error|log|warn)/.test(text))) assert.doesNotMatch(line, /invite\.detail|result\.detail|\$\{invite\}|secret|config\b|basic/i, line.trim());
  }
  // O que a tela recebe do convite é só a situação.
  assert.doesNotMatch(read("lib/db/invite.ts"), /detail: .*\$\{invite\}/);
  for (const page of ["app/(app)/equipe/page.tsx", "app/(app)/equipe/[id]/page.tsx"]) assert.doesNotMatch(read(page), /provisionAccess|ERP_AUTH|recuperar/, page);
});

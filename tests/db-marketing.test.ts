import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runCadences, addCadenceStep, createCadence, startCadence, listEnrollments } from "@/lib/db/cadences";
import { CampaignError, cancelCampaign, countAudience, deleteCampaign, getCampaign, listCampaignFailures, listCampaigns, loadMarketingSettings, runCampaigns, saveCampaign, saveMarketingSettings, sendCampaignTest, startCampaign } from "@/lib/db/campaigns";
import { CAPTURE_PER_ADDRESS_HOUR, CaptureError, deleteCaptureForm, findCaptureForm, listCaptureForms, saveCaptureForm, submitCapture } from "@/lib/db/capture";
import { createOpportunity, deleteOpportunity, getOpportunity, listStages, moveOpportunity } from "@/lib/db/funnel";
import { saveTemplate, listTemplates } from "@/lib/db/messages";
import { addOptout, emailOfUnsubscribe, isOptedOut, listOptouts, removeOptout, unsubscribeByToken, unsubscribeUrl } from "@/lib/db/optout";
import { buildMessage, MailError } from "@/lib/mail/message";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
before(async () => {
  if (!skip) db = await openTestDb("marketing");
});
after(async () => {
  if (!skip) await db.close();
});

const ACME = { slug: "acme", name: "Acme" };
const BOSS = "diretoria@empresa.test";
const SELLER = { email: "ana@empresa.test", name: "Ana Souza" };
const blank = { customerId: null, contactName: null, phone: null, email: null, source: null, estimatedValue: null, notes: null };
const textOf = (message: string) => Buffer.from(message.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0], "base64").toString("utf8");
const mailer = () => {
  const outbox: { to: string; message: string }[] = [];
  return {
    outbox,
    way: {
      env: { ERP_SMTP_HOST: "mail.avilaops.com", ERP_SMTP_USER: "u", ERP_SMTP_PASSWORD: "x", ERP_MAIL_FROM: "noreply@avilaops.com", APP_URL: "https://erp.exemplo.test" },
      key: (): Buffer => { throw new Error("sem caixa própria"); },
      send: async (_config: unknown, envelope: { to: string }, message: string) => void outbox.push({ to: envelope.to, message }),
    },
  };
};

test("e-mail automático: o cabeçalho de descadastro aponta para a rota de um clique, e endereço torto é recusado", () => {
  const base = { from: "a@acme.test", fromName: "Acme", to: "b@cliente.test", replyTo: null, subject: "Oi", text: "Texto", attachments: [] };
  const message = buildMessage({ ...base, unsubscribe: "https://erp.exemplo.test/descadastro/acme/abc" }, new Date(0), "id");
  assert.ok(message.includes("List-Unsubscribe: <https://erp.exemplo.test/descadastro/acme/abc/agora>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n"));
  assert.ok(!buildMessage(base, new Date(0), "id").includes("List-Unsubscribe"));
  assert.throws(() => buildMessage({ ...base, unsubscribe: "https://x.test/a>\r\nBcc: z@z.test" }, new Date(0), "id"), MailError);
});

test("descadastro: o link vale para um e-mail, é o mesmo sempre, e quem sai não recebe cadência", { skip }, async () => {
  const url = await unsubscribeUrl(" Paula@FitClub.test ", "https://erp.exemplo.test", "acme", db.pool);
  assert.match(url, /^https:\/\/erp\.exemplo\.test\/descadastro\/acme\/[A-Za-z0-9_-]{43}$/);
  assert.equal(await unsubscribeUrl("paula@fitclub.test", "https://erp.exemplo.test", "acme", db.pool), url);
  const token = url.split("/").pop()!;
  assert.equal(await emailOfUnsubscribe(token, db.pool), "paula@fitclub.test");
  assert.equal(await emailOfUnsubscribe("x".repeat(43), db.pool), null);
  assert.equal(await unsubscribeByToken("curto", db.pool), null);
  assert.equal(await isOptedOut("paula@fitclub.test", db.pool), false);
  // Abrir duas vezes é o mesmo que uma.
  assert.equal(await unsubscribeByToken(token, db.pool), "paula@fitclub.test");
  assert.equal(await unsubscribeByToken(token, db.pool), "paula@fitclub.test");
  assert.equal(await isOptedOut("PAULA@fitclub.test", db.pool), true);
  await assert.rejects(() => addOptout("torto", BOSS, db.pool), /E-mail inválido/);
  await addOptout("Rui@Outro.test", BOSS, db.pool);
  await assert.rejects(() => addOptout("rui@outro.test", BOSS, db.pool), /já está na lista/);
  assert.deepEqual((await listOptouts(db.pool)).map((row) => [row.email, row.origin]).sort(), [["paula@fitclub.test", "descadastro"], ["rui@outro.test", "manual"]]);

  // Cadência: o e-mail automático para quem saiu não sai, e a cadência para com o motivo.
  await saveTemplate(null, { name: "Primeiro contato", subject: "Proposta para {empresa}", body: "Olá, {contato}. Posso enviar o orçamento?" }, BOSS, db.pool);
  const [template] = await listTemplates(db.pool);
  const cadence = await createCadence("Retomada", BOSS, db.pool);
  await addCadenceStep(cadence, { kind: "email", waitDays: 0, templateId: template.id, taskTitle: null }, db.pool);
  const now = new Date("2026-10-09T12:00:00Z");
  const out = await createOpportunity({ ...blank, title: "Saiu", company: "Fit Club", email: "paula@fitclub.test" }, SELLER, db.pool);
  const stays = await createOpportunity({ ...blank, title: "Fica", company: "Iron Box", email: "leo@ironbox.test" }, SELLER, db.pool);
  await startCadence(out, cadence, SELLER.email, null, now, db.pool);
  await startCadence(stays, cadence, SELLER.email, null, now, db.pool);
  const { outbox, way } = mailer();
  assert.deepEqual(await runCadences(ACME, now, way, db.pool), { sent: 1, tasks: 1, stopped: 1 });
  assert.match((await listEnrollments(out, db.pool))[0].stoppedReason ?? "", /pediu para não receber/);
  // O que sai leva a saída no pé e no cabeçalho.
  assert.equal(outbox.length, 1);
  const link = await unsubscribeUrl("leo@ironbox.test", "https://erp.exemplo.test", "acme", db.pool);
  assert.ok(textOf(outbox[0].message).endsWith(`--\r\nPara não receber mais e-mails de Acme, acesse: ${link}`));
  assert.ok(outbox[0].message.includes(`List-Unsubscribe: <${link}/agora>`));

  await removeOptout("rui@outro.test", db.pool);
  await assert.rejects(() => removeOptout("rui@outro.test", db.pool), /não encontrado/);
  for (const id of [out, stays]) await deleteOpportunity(id, { ownerEmail: null }, db.pool);
});

test("campanha: público sem repetição e sem quem saiu, envio em lotes dentro do limite, uma vez para cada um", { skip }, async () => {
  const customer = (name: string, email: string | null, uf: string, document: string) =>
    db.pool.query("INSERT INTO customers (kind, document, name, email, uf, updated_by) VALUES ('PF', $1, $2, $3, $4, 'teste')", [document, name, email, uf]);
  await customer("Bia Lima", "Bia@Lima.test", "SP", "52998224725");
  await customer("Caio Reis", "caio@reis.test", "MG", "11144477735");
  await customer("Sem E-mail", null, "SP", "39053344705");
  await customer("Paula Saiu", "paula@fitclub.test", "SP", "86288366757");
  await customer("Endereço Torto", "torto@", "SP", "71428793860");
  await customer("Bia Repetida", "bia@lima.test", "SP", "98765432100");
  const stages = await listStages(db.pool);
  const open = await createOpportunity({ ...blank, title: "Em andamento", company: "Studio Corpo", contactName: "Duda", email: "duda@studio.test" }, SELLER, db.pool);
  const lost = await createOpportunity({ ...blank, title: "Perdida", company: "Clube Náutico", email: "eva@clube.test" }, SELLER, db.pool);
  await moveOpportunity(lost, stages.find((stage) => stage.kind === "perdida")!.id, "Preço", SELLER.email, { ownerEmail: null }, db.pool);

  assert.deepEqual([await countAudience("clientes", null, db.pool), await countAudience("clientes", "MG", db.pool), await countAudience("abertas", null, db.pool), await countAudience("perdidas", null, db.pool)], [2, 1, 1, 1]);

  const draft = { name: " Linha  nova ", subject: "Novidade para {empresa}", body: "Olá, {contato}!\r\nA {minha_empresa} lançou a linha nova.", audience: "clientes", uf: null };
  await assert.rejects(() => saveCampaign(null, { ...draft, name: "x", subject: "ab", body: "curto", audience: "todos", uf: "XX" }, BOSS, db.pool), (error: unknown) => error instanceof CampaignError && /Nome da campanha.*Assunto.*Texto.*para quem.*Estado inválido/.test(error.message));
  await assert.rejects(() => saveCampaign(null, { ...draft, body: "Aqui é {vendedor}, tudo bem?" }, BOSS, db.pool), /\{vendedor\} não vale em campanha/);
  const id = await saveCampaign(null, draft, BOSS, db.pool);
  await assert.rejects(() => saveCampaign(null, { ...draft, name: "linha nova" }, BOSS, db.pool), /Já existe uma campanha/);
  // O estado só vale para clientes.
  await saveCampaign(id, { ...draft, audience: "abertas", uf: "SP" }, BOSS, db.pool);
  assert.deepEqual([(await getCampaign(id, db.pool))!.audience, (await getCampaign(id, db.pool))!.uf], ["abertas", null]);
  await saveCampaign(id, draft, BOSS, db.pool);

  const { outbox, way } = mailer();
  const now = new Date("2026-10-09T12:00:00Z");
  // Teste: vai só para quem pediu, marcado no assunto, e não muda nada.
  await sendCampaignTest(id, { email: BOSS, name: "Rogério" }, ACME, now, way, db.pool);
  assert.equal(outbox[0].to, BOSS);
  assert.ok(outbox[0].message.includes("Subject: [Teste] Novidade para Acme") && !outbox[0].message.includes("List-Unsubscribe"));
  await assert.rejects(() => sendCampaignTest(id, { email: BOSS, name: "R" }, ACME, now, { ...way, env: {} }, db.pool), MailError);
  outbox.length = 0;
  // Rascunho não sai sozinho.
  assert.deepEqual(await runCampaigns(ACME, now, way, db.pool), { sent: 0, failed: 0, skipped: 0, finished: 0 });

  // Público vazio: nada começa.
  const empty = await saveCampaign(null, { ...draft, name: "Para o Acre", uf: "AC" }, BOSS, db.pool);
  await assert.rejects(() => startCampaign(empty, BOSS, now, db.pool), /Ninguém deste público/);
  assert.equal((await getCampaign(empty, db.pool))!.status, "rascunho");
  await deleteCampaign(empty, db.pool);

  assert.equal(await startCampaign(id, BOSS, now, db.pool), 2);
  await assert.rejects(() => startCampaign(id, BOSS, now, db.pool), /já foi enviada/);
  await assert.rejects(() => saveCampaign(id, draft, BOSS, db.pool), /não mudam mais/);
  await assert.rejects(() => deleteCampaign(id, db.pool), /fica como registro|removidos/);
  // Quem entra no cadastro depois do início não entra na lista; quem sai depois do início é pulado.
  await customer("Chegou Depois", "depois@novo.test", "SP", "15350946056");
  await addOptout("caio@reis.test", BOSS, db.pool);
  // Limite do dia: com 1, só um sai agora.
  await assert.rejects(() => saveMarketingSettings(0, BOSS, db.pool), /de 1 a 5\.000/);
  await saveMarketingSettings(1, BOSS, db.pool);
  assert.deepEqual(await loadMarketingSettings(db.pool), { dailyLimit: 1 });
  assert.deepEqual(await runCampaigns(ACME, now, way, db.pool), { sent: 1, failed: 0, skipped: 0, finished: 0 });
  assert.deepEqual(await runCampaigns(ACME, now, way, db.pool), { sent: 0, failed: 0, skipped: 0, finished: 0 });
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, "bia@lima.test");
  const link = await unsubscribeUrl("bia@lima.test", "https://erp.exemplo.test", "acme", db.pool);
  assert.equal(textOf(outbox[0].message), `Olá, Bia Lima!\r\nA Acme lançou a linha nova.\r\n\r\n--\r\nPara não receber mais e-mails de Acme, acesse: ${link}`);
  assert.ok(outbox[0].message.includes(`List-Unsubscribe: <${link}/agora>`) && outbox[0].message.includes("Subject: Novidade para Bia Lima"));
  // No dia seguinte o resto sai: quem saiu da lista é pulado e a campanha fecha.
  const next = new Date(now.getTime() + 25 * 3_600_000);
  assert.deepEqual(await runCampaigns(ACME, next, way, db.pool), { sent: 0, failed: 0, skipped: 1, finished: 1 });
  const done = (await getCampaign(id, db.pool))!;
  assert.deepEqual([done.status, done.sent, done.skipped, done.queued, done.failed], ["concluida", 1, 1, 0, 0]);
  assert.deepEqual(await listCampaignFailures(id, db.pool), [{ email: "caio@reis.test", status: "pulado", detail: "Pediu para não receber mais." }]);
  await assert.rejects(() => cancelCampaign(id, BOSS, db.pool), /Só campanha que está enviando/);
  await assert.rejects(() => deleteCampaign(id, db.pool), /fica como registro/);

  // Servidor de e-mail fora: três recusas seguidas e a rodada para, deixando o resto na fila.
  await saveMarketingSettings(5000, BOSS, db.pool);
  await removeOptout("caio@reis.test", db.pool);
  for (const [index, name] of ["Um", "Dois", "Três", "Quatro"].entries()) await customer(name, `n${index}@serie.test`, "RS", `0000000000${index}`.slice(-11));
  const serie = await saveCampaign(null, { ...draft, name: "Sul", uf: "RS" }, BOSS, db.pool);
  assert.equal(await startCampaign(serie, BOSS, next, db.pool), 4);
  const down = { ...way, send: async () => { throw new MailError("O servidor de e-mail não respondeu."); } };
  assert.deepEqual(await runCampaigns(ACME, next, down, db.pool), { sent: 0, failed: 3, skipped: 0, finished: 0 });
  assert.equal((await getCampaign(serie, db.pool))!.queued, 1);
  // Sem caixa de saída nada é pego: a campanha espera.
  assert.deepEqual(await runCampaigns(ACME, next, { ...way, env: {} }, db.pool), { sent: 0, failed: 0, skipped: 0, finished: 0 });
  // Cancelar: quem estava na fila não recebe. Como já houve tentativa, fica como registro.
  await cancelCampaign(serie, BOSS, db.pool);
  assert.deepEqual(await runCampaigns(ACME, next, way, db.pool), { sent: 0, failed: 0, skipped: 0, finished: 0 });
  const cancelled = (await getCampaign(serie, db.pool))!;
  assert.deepEqual([cancelled.status, cancelled.failed, cancelled.skipped, cancelled.queued], ["cancelada", 3, 1, 0]);
  // Cancelada antes do primeiro envio pode ser removida, com a lista.
  const early = await saveCampaign(null, { ...draft, name: "Cedo", uf: "MG" }, BOSS, db.pool);
  await startCampaign(early, BOSS, next, db.pool);
  await cancelCampaign(early, BOSS, db.pool);
  await deleteCampaign(early, db.pool);
  assert.deepEqual((await listCampaigns(db.pool)).map((campaign) => campaign.name), ["Sul", "Linha nova"]);
  for (const opportunity of [open, lost]) await deleteOpportunity(opportunity, { ownerEmail: null }, db.pool);
});

test("formulário de captura: vira oportunidade de quem o formulário nomeia, guarda o aceite e segura repetição e abuso", { skip }, async () => {
  await db.pool.query("INSERT INTO users (email, name, role, updated_by) VALUES ($1, $2, 'VENDEDOR', 'teste'), ('fora@empresa.test', 'Fora', 'VENDEDOR', 'teste')", [SELLER.email, SELLER.name]);
  await db.pool.query("UPDATE users SET active = false WHERE email = 'fora@empresa.test'");
  const input = { name: " Site ", title: "Peça o seu orçamento", intro: "Respondemos em um dia útil.", ownerEmail: "ANA@empresa.test", active: true };
  await assert.rejects(() => saveCaptureForm(null, { ...input, name: "x", title: "", ownerEmail: "fora@empresa.test" }, BOSS, db.pool), (error: unknown) => error instanceof CaptureError && /Nome do formulário.*Título da página.*pessoa ativa/.test(error.message));
  await saveCaptureForm(null, input, BOSS, db.pool);
  await assert.rejects(() => saveCaptureForm(null, { ...input, name: "site" }, BOSS, db.pool), /Já existe um formulário/);
  const [form] = await listCaptureForms(db.pool);
  assert.deepEqual([form.name, form.ownerEmail, form.ownerName, form.active, form.answers], ["Site", SELLER.email, SELLER.name, true, 0]);
  assert.match(form.token, /^[A-Za-z0-9_-]{22}$/);
  assert.equal((await findCaptureForm(form.token, db.pool))!.id, form.id);
  assert.equal(await findCaptureForm("curto", db.pool), null);

  const now = new Date("2026-10-09T12:00:00Z");
  const answer = { name: " Paula  Dias ", company: "Fit Club", email: " Paula@FitClub.test ", phone: "(17) 99999-0000", message: "Quero 12 estações.", agreed: true };
  await assert.rejects(() => submitCapture(form, { ...answer, name: "", email: "torto", phone: "abc", agreed: false }, "Acme", "203.0.113.9", now, db.pool), (error: unknown) => error instanceof CaptureError && /seu nome.*e-mail válido.*Telefone inválido.*concorda/.test(error.message));
  const id = (await submitCapture(form, answer, "Acme", "203.0.113.9", now, db.pool))!;
  const created = (await getOpportunity(id, { ownerEmail: SELLER.email }, db.pool))!;
  assert.deepEqual(
    [created.title, created.company, created.contactName, created.email, created.phone, created.source, created.notes, created.ownerName, created.stageKind],
    ["Contato pelo formulário: Fit Club", "Fit Club", "Paula Dias", "paula@fitclub.test", "(17) 99999-0000", "Formulário: Site", "Quero 12 estações.", SELLER.name, "aberta"],
  );
  const kept = await db.pool.query("SELECT email, consent, ip, opportunity_id FROM capture_submissions");
  assert.deepEqual(kept.rows.map((row) => [row.email, row.consent, row.ip, Number(row.opportunity_id)]), [["paula@fitclub.test", "Concordo que Acme use os dados acima para entrar em contato comigo sobre este pedido.", "203.0.113.9", id]]);
  // A mesma pessoa de novo no mesmo dia: nada novo.
  assert.equal(await submitCapture(form, answer, "Acme", "203.0.113.9", now, db.pool), null);
  // Sem empresa, o nome da pessoa faz as vezes.
  const alone = (await submitCapture(form, { ...answer, company: "", email: "leo@casa.test", phone: "", message: "" }, "Acme", "203.0.113.9", now, db.pool))!;
  assert.deepEqual([(await getOpportunity(alone, { ownerEmail: null }, db.pool))!.company, (await getOpportunity(alone, { ownerEmail: null }, db.pool))!.title], ["Paula Dias", "Contato pelo formulário: Paula Dias"]);
  // O mesmo endereço de rede não passa de um punhado por hora; outro endereço segue passando.
  for (let index = 2; index < CAPTURE_PER_ADDRESS_HOUR; index += 1) await submitCapture(form, { ...answer, email: `p${index}@serie.test` }, "Acme", "203.0.113.9", now, db.pool);
  await assert.rejects(() => submitCapture(form, { ...answer, email: "mais@serie.test" }, "Acme", "203.0.113.9", now, db.pool), /Muitos envios/);
  assert.ok(await submitCapture(form, { ...answer, email: "outro@rede.test" }, "Acme", "198.51.100.7", now, db.pool));
  assert.equal((await listCaptureForms(db.pool))[0].answers, CAPTURE_PER_ADDRESS_HOUR + 1);

  // Fora do ar, o endereço não abre mais nada.
  await saveCaptureForm(form.id, { ...input, name: "Site", active: false }, BOSS, db.pool);
  assert.equal(await findCaptureForm(form.token, db.pool), null);
  // Remover a oportunidade guarda o registro do aceite; remover o formulário leva os registros e deixa as oportunidades.
  await deleteOpportunity(id, { ownerEmail: null }, db.pool);
  assert.equal((await db.pool.query("SELECT count(*) FROM capture_submissions WHERE opportunity_id IS NULL")).rows[0].count, "1");
  await deleteCaptureForm(form.id, db.pool);
  assert.deepEqual(await listCaptureForms(db.pool), []);
  assert.ok(await getOpportunity(alone, { ownerEmail: null }, db.pool));
});

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const read = (file: string) => readFileSync(SRC + file, "utf8");

test("portas públicas do marketing: sem sessão, só o que o endereço nomeia, nunca indexadas; as telas são de quem vê a equipe toda", () => {
  const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx?$/.test(file));
  const open = sources.filter((file) => file.startsWith("app/captura/") || file.startsWith("app/descadastro/"));
  assert.deepEqual(open.sort(), ["app/captura/[empresa]/[token]/actions.ts", "app/captura/[empresa]/[token]/page.tsx", "app/descadastro/[empresa]/[token]/actions.ts", "app/descadastro/[empresa]/[token]/agora/route.ts", "app/descadastro/[empresa]/[token]/page.tsx"]);
  for (const file of open) {
    const code = read(file);
    // A empresa nunca é aberta aqui: só pelas duas portas, que conferem o endereço.
    assert.doesNotMatch(code, /tenantDb|withTenantConnection|controlDb|from "pg"|search_path|tenant_/, file);
    assert.doesNotMatch(code, /@\/lib\/auth|getSession|requirePermission|cookies\(/, file);
    assert.doesNotMatch(code, /@\/lib\/db\/(orders|products|params|price-table|customers|users|company|fiscal|funnel|campaigns|contracts)|@\/lib\/pricing/, file);
    for (const line of code.split("\n").filter((text) => /console\.(info|error|log|warn)/.test(text))) assert.doesNotMatch(line, /token|formData|email/i, line.trim());
    assert.match(code, /await open(Capture|Unsubscribe)\(/, file);
  }
  for (const page of ["app/captura/[empresa]/[token]/page.tsx", "app/descadastro/[empresa]/[token]/page.tsx"]) {
    assert.ok(read(page).includes('export const dynamic = "force-dynamic"') && read(page).includes("robots: { index: false, follow: false }"), page);
  }
  // Abrir a página de descadastro não descadastra: só o botão (ação) e o POST de um clique.
  assert.doesNotMatch(read("app/descadastro/[empresa]/[token]/page.tsx"), /unsubscribeByToken/);
  assert.doesNotMatch(read("app/descadastro/[empresa]/[token]/agora/route.ts"), /export async function GET/);
  // Só as portas escolhem a empresa pelo endereço, e conferem o formato antes de abrir o banco.
  const doors = read("lib/marketing/public.ts");
  for (const part of doors.split("export async function").slice(1)) {
    assert.ok(part.indexOf("_TOKEN.test(token)) return null;") < part.indexOf("tenantDb(") && part.indexOf("await knownTenant(company, env)") < part.indexOf("tenantDb(") && part.indexOf("if (!tenant) return null;") < part.indexOf("tenantDb("));
  }
  const users = sources.filter((file) => /open(Capture|Unsubscribe)\(/.test(read(file)) && file !== "lib/marketing/public.ts");
  assert.deepEqual(users.sort(), open.sort());

  // As telas e ações de campanha e formulário: do item Funil, e só para quem acompanha a equipe toda.
  const actions = read("app/(app)/funil/marketing-actions.ts");
  const bodies = actions.split(/export async function \w+\([^)]*\)[^{]*\{/).slice(1);
  assert.equal(bodies.length, 5);
  for (const body of bodies) assert.match(body.trimStart(), /^const session = await requirePermission\("funil"\);\s+if \(!seesAllOrders\(session\)\) return \{ error: ONLY_TEAM_LEAD \};/);
  for (const page of ["campanhas/page.tsx", "campanhas/nova/page.tsx", "campanhas/[id]/page.tsx", "captura/page.tsx"]) {
    assert.match(read(`app/(app)/funil/${page}`), /const session = await requirePermission\("funil", [^)]+\);\s+if \(!seesAllOrders\(session\)\) notFound\(\);/, page);
  }
  // A rotina de fundo envia as campanhas.
  assert.ok(read("lib/background.ts").includes("runCampaigns(tenant, now,"));
});

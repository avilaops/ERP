import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { addCadenceStep, CadenceError, createCadence, deleteCadence, deleteCadenceStep, listCadences, listEnrollments, runCadences, saveCadence, startCadence, stopCadence } from "@/lib/db/cadences";
import { createOpportunity, deleteOpportunity, listPendingActivities, listStages, moveOpportunity } from "@/lib/db/funnel";
import { deleteTemplate, fillMessage, listOpportunityMessages, listTemplates, MessageError, saveTemplate, sendOpportunityMail } from "@/lib/db/messages";
import { MailError } from "@/lib/mail/message";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
before(async () => {
  if (!skip) db = await openTestDb("cadencias");
});
after(async () => {
  if (!skip) await db.close();
});

const SELLER = { email: "ana@empresa.test", name: "Ana Souza" };
const OTHER = { email: "caio@empresa.test", name: "Caio" };
const BOSS = "diretoria@empresa.test";
const ACME = { slug: "acme", name: "Acme" };
const blank = { customerId: null, contactName: null, phone: null, email: null, source: null, estimatedValue: null, notes: null };
const textOf = (message: string) => Buffer.from(message.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0], "base64").toString("utf8");

test("modelo de mensagem: as palavras entre chaves viram os dados; palavra desconhecida fica", () => {
  const values = { contato: "Paula", empresa: "Fit Club", vendedor: "Ana", minha_empresa: "Acme" };
  assert.equal(fillMessage("Olá, {contato} da {empresa}! Aqui é {vendedor}, da {minha_empresa}. {outra}", values), "Olá, Paula da Fit Club! Aqui é Ana, da Acme. {outra}");
});

test("mensagens: e-mail sai da oportunidade pela caixa da empresa, fica registrado, e cada vendedor só envia das suas", { skip }, async () => {
  await assert.rejects(() => saveTemplate(null, { name: "x", subject: "ab", body: "curto" }, BOSS, db.pool), (error: unknown) => error instanceof MessageError && /de 2 a 60 letras.*de 3 a 150 letras.*de 10 a 4\.000 letras/.test(error.message));
  await saveTemplate(null, { name: " Primeiro  contato ", subject: "Proposta para {empresa}", body: "Olá, {contato}.\r\n\r\nAqui é {vendedor}, da {minha_empresa}." }, BOSS, db.pool);
  await assert.rejects(() => saveTemplate(null, { name: "Primeiro contato", subject: "Outro", body: "Texto qualquer aqui." }, BOSS, db.pool), /Já existe um modelo/);
  const [template] = await listTemplates(db.pool);
  assert.deepEqual([template.name, template.body], ["Primeiro contato", "Olá, {contato}.\n\nAqui é {vendedor}, da {minha_empresa}."]);

  const id = await createOpportunity({ ...blank, title: "Academia nova", company: "Fit Club", contactName: "Paula", email: "paula@fitclub.test" }, SELLER, db.pool);
  const silent = await createOpportunity({ ...blank, title: "Sem e-mail", company: "Studio Corpo" }, SELLER, db.pool);
  const outbox: { to: string; message: string }[] = [];
  const way = {
    env: { ERP_SMTP_HOST: "mail.avilaops.com", ERP_SMTP_USER: "u", ERP_SMTP_PASSWORD: "x", ERP_MAIL_FROM: "noreply@avilaops.com" },
    key: () => { throw new Error("sem caixa própria"); },
    send: async (_config: unknown, envelope: { to: string }, message: string) => void outbox.push({ to: envelope.to, message }),
  };
  const mail = { opportunityId: id, ownerEmail: SELLER.email, subject: template.subject, body: template.body, company: "Acme", sentBy: SELLER.email, now: new Date(), way };
  // Outro vendedor não envia desta oportunidade; sem e-mail do contato ou sem caixa de saída nada sai nem é registrado.
  await assert.rejects(() => sendOpportunityMail({ ...mail, ownerEmail: OTHER.email }, db.pool), /não encontrada/);
  await assert.rejects(() => sendOpportunityMail({ ...mail, opportunityId: silent }, db.pool), /não tem e-mail do contato/);
  await assert.rejects(() => sendOpportunityMail({ ...mail, way: { ...way, env: {} } }, db.pool), (error: unknown) => error instanceof MailError);
  await assert.rejects(() => sendOpportunityMail({ ...mail, subject: "x" }, db.pool), /Assunto: de 3 a 150/);
  assert.deepEqual([outbox.length, (await listOpportunityMessages(id, db.pool)).length], [0, 0]);

  assert.deepEqual(await sendOpportunityMail(mail, db.pool), { status: "enviado", recipient: "paula@fitclub.test", detail: null });
  assert.equal(outbox[0].to, "paula@fitclub.test");
  assert.equal(textOf(outbox[0].message), "Olá, Paula.\r\n\r\nAqui é Ana Souza, da Acme.");
  const failed = await sendOpportunityMail({ ...mail, way: { ...way, send: async () => { throw new MailError("O servidor de e-mail recusou (destinatário): 550 caixa inexistente"); } } }, db.pool);
  assert.equal(failed.status, "falhou");
  assert.deepEqual((await listOpportunityMessages(id, db.pool)).map((message) => [message.subject, message.status, message.sentBy]), [["Proposta para Fit Club", "falhou", SELLER.email], ["Proposta para Fit Club", "enviado", SELLER.email]]);
  await deleteOpportunity(silent, { ownerEmail: null }, db.pool);
  await deleteOpportunity(id, { ownerEmail: null }, db.pool);
  assert.equal(Number((await db.pool.query("SELECT count(*) FROM opportunity_messages")).rows[0].count), 0);
});

test("cadência: os passos saem na hora certa, uma vez cada; para quando a venda fecha e quando o e-mail não pode sair", { skip }, async () => {
  const [template] = await listTemplates(db.pool);
  const cadence = await createCadence(" Retomada  de orçamento ", BOSS, db.pool);
  await assert.rejects(() => createCadence("Retomada de orçamento", BOSS, db.pool), /Já existe uma cadência/);
  await assert.rejects(() => addCadenceStep(cadence, { kind: "email", waitDays: 0, templateId: null, taskTitle: null }, db.pool), /Escolha o modelo/);
  await assert.rejects(() => addCadenceStep(cadence, { kind: "tarefa", waitDays: 91, templateId: null, taskTitle: "Ligar" }, db.pool), /de 0 a 90 dias/);
  await assert.rejects(() => addCadenceStep(cadence, { kind: "sms", waitDays: 1, templateId: null, taskTitle: null }, db.pool), /e-mail ou uma tarefa/);
  const now = new Date("2026-10-09T12:00:00Z");
  const at = (days: number) => new Date(now.getTime() + days * 86_400_000);
  const id = await createOpportunity({ ...blank, title: "Academia nova", company: "Fit Club", contactName: "Paula", email: "paula@fitclub.test" }, SELLER, db.pool);
  // Sem passos, ninguém entra.
  await assert.rejects(() => startCadence(id, cadence, SELLER.email, SELLER.email, now, db.pool), /ainda não tem passos/);
  await addCadenceStep(cadence, { kind: "email", waitDays: 0, templateId: template.id, taskTitle: "ignorado no e-mail" }, db.pool);
  await addCadenceStep(cadence, { kind: "tarefa", waitDays: 2, templateId: template.id, taskTitle: " Ligar para  o contato " }, db.pool);
  await addCadenceStep(cadence, { kind: "email", waitDays: 3, templateId: template.id, taskTitle: null }, db.pool);
  const [listed] = await listCadences(db.pool);
  assert.deepEqual(listed.steps.map((step) => [step.position, step.waitDays, step.kind, step.templateName, step.taskTitle]), [[1, 0, "email", "Primeiro contato", null], [2, 2, "tarefa", null, "Ligar para o contato"], [3, 3, "email", "Primeiro contato", null]]);
  // O modelo em uso não pode sair.
  await assert.rejects(() => deleteTemplate(template.id, db.pool), /usado em uma cadência/);

  const outbox: string[] = [];
  const way = {
    env: { ERP_SMTP_HOST: "mail.avilaops.com", ERP_SMTP_USER: "u", ERP_SMTP_PASSWORD: "x", ERP_MAIL_FROM: "noreply@avilaops.com" },
    key: () => { throw new Error("sem caixa própria"); },
    send: async (_config: unknown, envelope: { to: string }) => void outbox.push(envelope.to),
  };
  // Só oportunidade ao alcance de quem pede, e uma cadência por vez.
  await assert.rejects(() => startCadence(id, cadence, OTHER.email, OTHER.email, now, db.pool), /Só oportunidade em andamento/);
  await startCadence(id, cadence, SELLER.email, SELLER.email, now, db.pool);
  await assert.rejects(() => startCadence(id, cadence, SELLER.email, SELLER.email, now, db.pool), /já está em uma cadência/);
  await assert.rejects(() => deleteCadence(cadence, db.pool), /Há oportunidades seguindo/);

  // Passo 1 na hora: o e-mail sai uma vez, mesmo rodando duas vezes.
  assert.deepEqual(await runCadences(ACME, now, way, db.pool), { sent: 1, tasks: 0, stopped: 0 });
  assert.deepEqual(await runCadences(ACME, now, way, db.pool), { sent: 0, tasks: 0, stopped: 0 });
  assert.deepEqual(outbox, ["paula@fitclub.test"]);
  let [enrollment] = await listEnrollments(id, db.pool);
  assert.deepEqual([enrollment.status, enrollment.nextPosition, enrollment.nextAt.toISOString()], ["ativa", 2, at(2).toISOString()]);
  assert.deepEqual((await listOpportunityMessages(id, db.pool)).map((message) => message.sentBy), ["cadência"]);
  // Antes da hora nada acontece; na hora, o passo 2 vira tarefa do vendedor.
  assert.deepEqual(await runCadences(ACME, at(1), way, db.pool), { sent: 0, tasks: 0, stopped: 0 });
  assert.deepEqual(await runCadences(ACME, at(2), way, db.pool), { sent: 0, tasks: 1, stopped: 0 });
  assert.deepEqual((await listPendingActivities({ ownerEmail: SELLER.email }, db.pool)).map((task) => task.title), ["Ligar para o contato"]);
  [enrollment] = await listEnrollments(id, db.pool);
  assert.deepEqual([enrollment.nextPosition, enrollment.nextAt.toISOString()], [3, at(5).toISOString()]);
  // Último passo: envia e conclui.
  assert.deepEqual(await runCadences(ACME, at(5), way, db.pool), { sent: 1, tasks: 0, stopped: 0 });
  assert.equal((await listEnrollments(id, db.pool))[0].status, "concluida");
  assert.deepEqual(await runCadences(ACME, at(30), way, db.pool), { sent: 0, tasks: 0, stopped: 0 });

  // A venda fechou no meio do caminho: a cadência para sozinha e não envia mais nada.
  const stages = await listStages(db.pool);
  await startCadence(id, cadence, SELLER.email, SELLER.email, at(30), db.pool);
  await moveOpportunity(id, stages.find((stage) => stage.kind === "ganha")!.id, null, SELLER.email, { ownerEmail: SELLER.email }, db.pool);
  assert.deepEqual(await runCadences(ACME, at(30), way, db.pool), { sent: 0, tasks: 0, stopped: 1 });
  assert.deepEqual([(await listEnrollments(id, db.pool))[0].status, (await listEnrollments(id, db.pool))[0].stoppedReason], ["parada", "A venda foi ganha."]);
  await assert.rejects(() => startCadence(id, cadence, SELLER.email, SELLER.email, at(30), db.pool), /Só oportunidade em andamento/);
  assert.equal(outbox.length, 2);

  // Sem e-mail do contato: a cadência para e deixa a tarefa dizendo por quê, em vez de tentar para sempre.
  const silent = await createOpportunity({ ...blank, title: "Sem e-mail", company: "Studio Corpo" }, SELLER, db.pool);
  await startCadence(silent, cadence, SELLER.email, SELLER.email, at(30), db.pool);
  assert.deepEqual(await runCadences(ACME, at(30), way, db.pool), { sent: 0, tasks: 1, stopped: 1 });
  assert.match((await listEnrollments(silent, db.pool))[0].stoppedReason ?? "", /não tem e-mail do contato/);
  assert.ok((await listPendingActivities({ ownerEmail: SELLER.email }, db.pool)).some((task) => /A cadência parou: Esta oportunidade não tem e-mail/.test(task.title)));
  // O servidor de e-mail recusou: mesma coisa.
  const bounced = await createOpportunity({ ...blank, title: "Caixa cheia", company: "Iron Box", email: "x@ironbox.test" }, SELLER, db.pool);
  await startCadence(bounced, cadence, SELLER.email, SELLER.email, at(30), db.pool);
  assert.deepEqual(await runCadences(ACME, at(30), { ...way, send: async () => { throw new MailError("O servidor de e-mail recusou (destinatário): 550 caixa inexistente"); } }, db.pool), { sent: 0, tasks: 1, stopped: 1 });
  // Parar à mão, por quem alcança a oportunidade; desligar a cadência para quem a segue.
  const manual = await createOpportunity({ ...blank, title: "Manual", company: "Clube Náutico", email: "c@clube.test" }, SELLER, db.pool);
  await startCadence(manual, cadence, SELLER.email, SELLER.email, at(30), db.pool);
  await assert.rejects(() => stopCadence(manual, "x", OTHER.email, db.pool), /não está em cadência/);
  await stopCadence(manual, "Parada por Ana Souza.", SELLER.email, db.pool);
  await startCadence(manual, cadence, SELLER.email, SELLER.email, at(30), db.pool);
  await saveCadence(cadence, { name: "Retomada de orçamento", active: false }, BOSS, db.pool);
  assert.deepEqual(await runCadences(ACME, at(30), way, db.pool), { sent: 0, tasks: 0, stopped: 1 });
  assert.equal((await listEnrollments(manual, db.pool))[0].stoppedReason, "A cadência foi desligada.");
  await assert.rejects(() => startCadence(manual, cadence, SELLER.email, SELLER.email, at(30), db.pool), (error: unknown) => error instanceof CadenceError && /desligada/.test(error.message));

  // Remover um passo fecha a ordem; sem ninguém seguindo, a cadência sai com os passos, e aí o modelo pode sair.
  await deleteCadenceStep(listed.steps[1].id, db.pool);
  assert.deepEqual((await listCadences(db.pool))[0].steps.map((step) => [step.position, step.kind]), [[1, "email"], [2, "email"]]);
  await deleteCadence(cadence, db.pool);
  assert.deepEqual(await listCadences(db.pool), []);
  await deleteTemplate(template.id, db.pool);
  for (const opportunity of [id, silent, bounced, manual]) await deleteOpportunity(opportunity, { ownerEmail: null }, db.pool);
});

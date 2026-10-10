import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildCalendar } from "@/lib/calendar/ics";
import { createOpportunity, deleteActivity, deleteOpportunity, listActivities, listPendingActivities } from "@/lib/db/funnel";
import { cancelMeeting, deleteMeeting, dialable, getMeeting, listMeetings, logCall, MeetingError, saveMeeting } from "@/lib/db/meetings";
import { listOpportunityMessages } from "@/lib/db/messages";
import { MailError } from "@/lib/mail/message";
import { openTestDb, SKIP_WITHOUT_DB } from "./db-helpers.ts";
import type { TestDb } from "./db-helpers.ts";

const skip = SKIP_WITHOUT_DB;
let db: TestDb;
before(async () => {
  if (!skip) db = await openTestDb("reunioes");
});
after(async () => {
  if (!skip) await db.close();
});

const SELLER = { email: "ana@empresa.test", name: "Ana Souza" };
const OTHER = "caio@empresa.test";
const blank = { customerId: null, contactName: null, phone: null, email: null, source: null, estimatedValue: null, notes: null };

test("convite de agenda: um evento em UTC, com linhas dobradas, texto escapado e nada que abra outra propriedade", () => {
  const event = {
    uid: "abc@erp.avilaops.com", sequence: 2, method: "REQUEST" as const, start: new Date("2026-10-12T17:30:00Z"), minutes: 45, summary: "Proposta; linha nova, 12 estações",
    description: "Para entrar: https://meet.exemplo.test/abc\nAté lá", location: "https://meet.exemplo.test/abc", url: "https://meet.exemplo.test/abc",
    organizer: { name: 'Ana "A" Souza', email: "ana@empresa.test" }, attendee: { name: "Paula\r\nATTENDEE:mailto:x@x.test", email: "paula@fitclub.test>\r\nX:1" }, stamp: new Date("2026-10-09T12:00:00Z"),
  };
  const text = buildCalendar(event);
  const lines = text.split("\r\n");
  assert.deepEqual([lines[0], lines[4], lines.at(-2), lines.at(-1)], ["BEGIN:VCALENDAR", "METHOD:REQUEST", "END:VCALENDAR", ""]);
  for (const part of ["UID:abc@erp.avilaops.com", "SEQUENCE:2", "DTSTAMP:20261009T120000Z", "DTSTART:20261012T173000Z", "DTEND:20261012T181500Z", "SUMMARY:Proposta\; linha nova\\, 12 estações", "DESCRIPTION:Para entrar: https://meet.exemplo.test/abc\\nAté lá", "URL:https://meet.exemplo.test/abc", "STATUS:CONFIRMED"]) {
    assert.ok(lines.includes(part), part);
  }
  // Nenhuma linha passa de 75 octetos, e o que continua começa com espaço.
  for (const line of lines) assert.ok(Buffer.byteLength(line, "utf8") <= 75, line);
  const unfolded = text.replace(/\r\n /g, "");
  assert.ok(unfolded.includes('ORGANIZER;CN="Ana A Souza":mailto:ana@empresa.test\r\n'));
  assert.ok(unfolded.includes('ATTENDEE;CN="PaulaATTENDEE:mailto:x@x.test";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:paula@fitclub.testX1\r\n'));
  assert.equal(unfolded.match(/^ATTENDEE/gm)?.length, 1);
  const cancel = buildCalendar({ ...event, method: "CANCEL", description: null, location: null, url: null });
  assert.ok(cancel.includes("METHOD:CANCEL\r\n") && cancel.includes("STATUS:CANCELLED\r\n") && !cancel.includes("LOCATION") && !cancel.includes("URL:"));
});

test("telefone para os links: número brasileiro com DDD, com ou sem 55; o resto não vira link", () => {
  assert.deepEqual(["(17) 99999-0000", "17 3333 0000", "+55 (17) 99999-0000", "017999990000", "9999-0000", "", null, "abc"].map(dialable), ["5517999990000", "551733330000", "5517999990000", "5517999990000", null, null, null, null]);
});

test("ligação e reunião: ficam na oportunidade de quem alcança, a reunião vira tarefa e leva convite; remarcar e cancelar avisam", { skip }, async () => {
  const id = await createOpportunity({ ...blank, title: "Academia nova", company: "Fit Club", contactName: "Paula", email: "Paula@FitClub.test", phone: "(17) 99999-0000" }, SELLER, db.pool);
  const silent = await createOpportunity({ ...blank, title: "Sem e-mail", company: "Studio Corpo" }, SELLER, db.pool);
  const mine = { ownerEmail: SELLER.email };

  // Ligação: registrada como feita; com data, deixa a tarefa de ligar de novo.
  await assert.rejects(() => logCall(id, { outcome: "talvez", note: "x".repeat(251), againOn: "amanhã" }, SELLER.email, mine, db.pool), (error: unknown) => error instanceof MeetingError && /como foi.*até 250.*Data inválida/.test(error.message));
  await assert.rejects(() => logCall(id, { outcome: "atendeu", note: "", againOn: null }, OTHER, { ownerEmail: OTHER }, db.pool), /Oportunidade não encontrada/);
  await logCall(id, { outcome: "nao_atendeu", note: "", againOn: "2026-10-13" }, SELLER.email, mine, db.pool);
  await logCall(id, { outcome: "atendeu", note: " Pediu  a proposta por e-mail ", againOn: null }, SELLER.email, mine, db.pool);
  assert.deepEqual((await listActivities(id, db.pool)).map((activity) => [activity.kind, activity.title, activity.doneAt !== null, activity.dueOn]).sort(), [
    ["ligacao", "Ligar de novo", false, "2026-10-13"],
    ["ligacao", "Ligação (atendeu): Pediu a proposta por e-mail", true, null],
    ["ligacao", "Ligação (não atendeu)", true, null],
  ]);

  const outbox: { to: string; message: string }[] = [];
  const way = {
    env: { ERP_SMTP_HOST: "mail.avilaops.com", ERP_SMTP_USER: "u", ERP_SMTP_PASSWORD: "x", ERP_MAIL_FROM: "noreply@avilaops.com" },
    key: (): Buffer => { throw new Error("sem caixa própria"); },
    send: async (_config: unknown, envelope: { to: string }, message: string) => void outbox.push({ to: envelope.to, message }),
  };
  const mail = { company: "Acme", now: new Date("2026-10-09T12:00:00Z"), way };
  const input = { title: " Apresentação  da proposta ", day: "2026-10-12", time: "14:30", minutes: 45, link: "https://meet.exemplo.test/abc", place: null, invite: true };
  await assert.rejects(() => saveMeeting(null, id, { ...input, title: "x", day: "12/10", time: "25:00", minutes: 5, link: "http://sem-s.test", place: "x" }, SELLER.email, mine, mail, db.pool), (error: unknown) => error instanceof MeetingError && /Assunto.*dia.*hora.*Duração.*https.*Local/.test(error.message));
  await assert.rejects(() => saveMeeting(null, id, input, OTHER, { ownerEmail: OTHER }, mail, db.pool), /Oportunidade não encontrada/);
  await assert.rejects(() => saveMeeting(null, silent, input, SELLER.email, mine, mail, db.pool), /não tem e-mail do contato para o convite/);
  assert.equal(outbox.length, 0);

  // Agendar: 14:30 de Brasília são 17:30 UTC; a tarefa aparece no funil; o convite sai com o arquivo de agenda.
  const made = await saveMeeting(null, id, input, SELLER.email, mine, mail, db.pool);
  assert.deepEqual(made.invite, { sent: "paula@fitclub.test", problem: null });
  const meeting = (await getMeeting(made.id, id, db.pool))!;
  assert.deepEqual([meeting.title, meeting.startsAt.toISOString(), meeting.day, meeting.time, meeting.minutes, meeting.invited, meeting.status], ["Apresentação da proposta", "2026-10-12T17:30:00.000Z", "2026-10-12", "14:30", 45, "paula@fitclub.test", "agendada"]);
  assert.ok((await listPendingActivities(mine, db.pool)).some((task) => task.kind === "reuniao" && task.title === "Reunião 14:30: Apresentação da proposta" && task.dueOn === "2026-10-12"));
  assert.equal(outbox[0].to, "paula@fitclub.test");
  const calendarOf = (message: string) => Buffer.from(message.split("Content-Disposition: attachment; filename=")[1].split("\r\n\r\n")[1].split("\r\n--")[0], "base64").toString("utf8").replace(/\r\n /g, "");
  assert.ok(outbox[0].message.includes('Content-Type: text/calendar; charset=UTF-8; method=REQUEST; name="reuniao.ics"') && outbox[0].message.includes("Reply-To: ana@empresa.test"));
  const first = calendarOf(outbox[0].message);
  assert.ok(first.includes("METHOD:REQUEST") && first.includes("SEQUENCE:0") && first.includes("DTSTART:20261012T173000Z") && first.includes("DTEND:20261012T181500Z") && first.includes("mailto:paula@fitclub.test"));
  const uid = first.match(/UID:(\S+)/)![1];
  assert.deepEqual((await listOpportunityMessages(id, db.pool)).map((message) => [message.subject, message.status]), [["Apresentação da proposta - Acme", "enviado"]]);

  // Sem convite: nada sai. Com o servidor recusando: a reunião fica e a tela sabe por quê.
  const quiet = await saveMeeting(null, silent, { ...input, invite: false, link: null, place: " Sede da  Acme " }, SELLER.email, mine, mail, db.pool);
  assert.deepEqual([quiet.invite, (await getMeeting(quiet.id, silent, db.pool))!.place, outbox.length], [{ sent: null, problem: null }, "Sede da Acme", 1]);
  const bounced = await saveMeeting(null, id, { ...input, title: "Outra" }, SELLER.email, mine, { ...mail, way: { ...way, send: async () => { throw new MailError("O servidor de e-mail recusou (destinatário): 550 caixa inexistente"); } } }, db.pool);
  assert.match(bounced.invite.problem ?? "", /não saiu: O servidor de e-mail recusou/);
  assert.equal((await getMeeting(bounced.id, id, db.pool))!.invited, null);

  // Remarcar: o mesmo evento, versão seguinte, para quem já tinha sido convidado, mesmo sem marcar o envio; a tarefa acompanha.
  await assert.rejects(() => saveMeeting(made.id, silent, { ...input, invite: false }, SELLER.email, mine, mail, db.pool), /Reunião não encontrada/);
  await saveMeeting(made.id, id, { ...input, day: "2026-10-13", time: "09:00", invite: false }, SELLER.email, mine, mail, db.pool);
  const second = calendarOf(outbox[1].message);
  assert.ok(second.includes(`UID:${uid}`) && second.includes("SEQUENCE:1") && second.includes("DTSTART:20261013T120000Z"));
  assert.ok((await listPendingActivities(mine, db.pool)).some((task) => task.title === "Reunião 09:00: Apresentação da proposta" && task.dueOn === "2026-10-13"));

  // Remover a tarefa da reunião não remove a reunião; remover reunião ativa pede o cancelamento antes.
  const task = (await listActivities(id, db.pool)).find((activity) => activity.title.startsWith("Reunião 09:00"))!;
  await deleteActivity(task.id, mine, db.pool);
  assert.equal((await getMeeting(made.id, id, db.pool))!.status, "agendada");
  await assert.rejects(() => deleteMeeting(made.id, id, mine, db.pool), /Cancele a reunião antes/);
  await assert.rejects(() => cancelMeeting(made.id, id, OTHER, { ownerEmail: OTHER }, mail, db.pool), /Oportunidade não encontrada/);

  // Cancelar: avisa quem foi convidado com o cancelamento do mesmo evento, e a tarefa sai do funil.
  assert.deepEqual(await cancelMeeting(made.id, id, SELLER.email, mine, mail, db.pool), { sent: "paula@fitclub.test", problem: null });
  const third = calendarOf(outbox[2].message);
  assert.ok(outbox[2].message.includes("method=CANCEL") && third.includes(`UID:${uid}`) && third.includes("SEQUENCE:2") && third.includes("STATUS:CANCELLED"));
  await assert.rejects(() => cancelMeeting(made.id, id, SELLER.email, mine, mail, db.pool), /Reunião não encontrada/);
  await assert.rejects(() => saveMeeting(made.id, id, input, SELLER.email, mine, mail, db.pool), /Reunião não encontrada/);
  // Quem não foi convidado não recebe nada no cancelamento, e a tarefa pendente some.
  assert.deepEqual(await cancelMeeting(quiet.id, silent, SELLER.email, mine, mail, db.pool), { sent: null, problem: null });
  assert.equal(outbox.length, 3);
  assert.ok(!(await listPendingActivities(mine, db.pool)).some((pending) => pending.kind === "reuniao" && pending.opportunityId === silent));
  assert.deepEqual((await listMeetings(id, db.pool)).map((row) => [row.title, row.status]), [["Outra", "agendada"], ["Apresentação da proposta", "cancelada"]]);
  await deleteMeeting(made.id, id, mine, db.pool);
  assert.equal(await getMeeting(made.id, id, db.pool), null);

  // Excluir a oportunidade leva as reuniões junto.
  for (const opportunity of [id, silent]) await deleteOpportunity(opportunity, { ownerEmail: null }, db.pool);
  assert.equal((await db.pool.query("SELECT count(*) FROM opportunity_meetings")).rows[0].count, "0");
});

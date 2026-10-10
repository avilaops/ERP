"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { notify } from "@/lib/api/notify";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { addActivity, createOpportunity, deleteActivity, deleteOpportunity, FunnelError, getOpportunity, linkOpportunityOrder, moveOpportunity, opportunityParty, setActivityDone, updateOpportunity } from "@/lib/db/funnel";
import type { OpportunityInput } from "@/lib/db/funnel";
import { CadenceError, startCadence, stopCadence } from "@/lib/db/cadences";
import { cancelMeeting, deleteMeeting, logCall, MeetingError, saveMeeting } from "@/lib/db/meetings";
import { MessageError, sendOpportunityMail } from "@/lib/db/messages";
import { tenantDb } from "@/lib/db/pool";
import { vaultKey } from "@/lib/fiscal/certificate";
import { MailError } from "@/lib/mail/message";
import { sendMail } from "@/lib/mail/smtp";
import { parseMoney } from "@/lib/format";
import type { ActionState } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";

const HERE = menuItem("funil").href;
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

const reader = (formData: FormData) => (key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};
const whole = (value: string) => (/^[1-9]\d{0,8}$/.test(value.trim()) ? Number(value.trim()) : null);

function problem(error: unknown): ActionState {
  if (error instanceof FunnelError || error instanceof MessageError || error instanceof CadenceError || error instanceof MeetingError || error instanceof MailError) return { error: error.message };
  console.error("[funil] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: FAILED };
}

/** What the form of an opportunity says. A value typed and not understood is a refusal, never zero. */
function inputOf(read: (key: string) => string): OpportunityInput | string {
  const typed = read("estimatedValue").trim();
  const value = typed === "" ? null : parseMoney(typed);
  if (typed !== "" && value === null) return "Valor estimado: digite só o valor, como 25.000,00.";
  return {
    title: read("title"), customerId: whole(read("customerId")), company: read("company"), contactName: read("contactName"), phone: read("phone"), email: read("email"),
    source: read("source"), estimatedValue: value, notes: read("notes"),
  };
}

/** "Criar oportunidade": it starts in the first stage, in the name of who creates it. */
export async function createOpportunityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const input = inputOf(reader(formData));
  if (typeof input === "string") return { error: input };
  let id: number;
  try {
    id = await createOpportunity(input, { email: session.email, name: session.name }, conn);
  } catch (error) {
    return problem(error);
  }
  await notify("oportunidade.criada", { id, titulo: input.title.trim(), empresa: input.company?.trim() || null, origem: input.source?.trim() || null, responsavel: session.name }, conn);
  revalidatePath(HERE);
  redirect(`${HERE}/${id}`);
}

/** "Salvar" on the record of an opportunity. A seller reaches only their own. */
export async function saveOpportunityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const id = whole(read("id"));
  const input = inputOf(read);
  if (id === null) return { error: "Oportunidade não encontrada." };
  if (typeof input === "string") return { error: input };
  try {
    await updateOpportunity(id, input, session.email, { ownerEmail: seesAllOrders(session) ? null : session.email }, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  revalidatePath(`${HERE}/${id}`);
  return { error: null, notice: "Dados gravados." };
}

/** "Mover": to another stage; losing asks for the reason. */
export async function moveOpportunityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const id = whole(read("id"));
  const stageId = whole(read("stageId"));
  if (id === null || stageId === null) return { error: "Escolha a etapa." };
  try {
    await moveOpportunity(id, stageId, read("lostReason"), session.email, { ownerEmail: seesAllOrders(session) ? null : session.email }, conn);
  } catch (error) {
    return problem(error);
  }
  // Won or lost is worth telling the other systems of the company; a move between open stages is not.
  const moved = await getOpportunity(id, { ownerEmail: seesAllOrders(session) ? null : session.email }, conn);
  if (moved && moved.stageKind !== "aberta") {
    await notify(moved.stageKind === "ganha" ? "oportunidade.ganha" : "oportunidade.perdida", { id, titulo: moved.title, empresa: opportunityParty(moved), valor_estimado: moved.estimatedValue, motivo: moved.lostReason, responsavel: moved.ownerName, pedido: moved.orderNumber }, conn);
  }
  revalidatePath(HERE);
  revalidatePath(`${HERE}/${id}`);
  return { error: null };
}

/** "Excluir oportunidade". */
export async function deleteOpportunityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const id = whole(reader(formData)("id"));
  if (id === null) return { error: "Oportunidade não encontrada." };
  try {
    await deleteOpportunity(id, { ownerEmail: seesAllOrders(session) ? null : session.email }, conn);
  } catch (error) {
    return problem(error);
  }
  console.info(`[funil] ${session.email} excluiu a oportunidade ${id} de ${session.tenant.slug}`);
  revalidatePath(HERE);
  redirect(HERE);
}

/** "Vincular pedido" and "Desfazer o vínculo": the order the opportunity became. */
export async function linkOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const id = whole(read("id"));
  const number = read("orderNumber").trim().replace(/^#/, "").toUpperCase();
  if (id === null) return { error: "Oportunidade não encontrada." };
  if (number !== "" && !ORDER_NUMBER.test(number)) return { error: "Número de pedido inválido. Ele tem o formato 261008-RUZL." };
  try {
    await linkOpportunityOrder(id, number === "" ? null : number, session.email, { ownerEmail: seesAllOrders(session) ? null : session.email }, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(`${HERE}/${id}`);
  return { error: null, notice: number === "" ? "Vínculo desfeito." : `Pedido #${number} vinculado.` };
}

/** "Adicionar": a task, a call, a meeting or a note on the opportunity. */
export async function addActivityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const id = whole(read("id"));
  if (id === null) return { error: "Oportunidade não encontrada." };
  try {
    await addActivity(id, { kind: read("kind"), title: read("title"), dueOn: read("dueOn") }, session.email, { ownerEmail: seesAllOrders(session) ? null : session.email }, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  revalidatePath(`${HERE}/${id}`);
  revalidatePath(`${HERE}/tarefas`);
  return { error: null };
}

/** "Concluir", "Reabrir" and "Remover" of one activity, by the button pressed. */
export async function changeActivityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const activityId = whole(read("activityId"));
  const what = read("what");
  if (activityId === null) return { error: "Atividade não encontrada." };
  const scope = { ownerEmail: seesAllOrders(session) ? null : session.email };
  try {
    if (what === "remover") await deleteActivity(activityId, scope, conn);
    else await setActivityDone(activityId, what !== "reabrir", session.email, scope, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  revalidatePath(`${HERE}/tarefas`);
  const id = whole(read("id"));
  if (id !== null) revalidatePath(`${HERE}/${id}`);
  return { error: null };
}

/** "Enviar e-mail" to the contact of the opportunity, by the company's mailbox. It is kept with its result. */
export async function sendMessageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const id = whole(read("id"));
  if (id === null) return { error: "Oportunidade não encontrada." };
  let result;
  try {
    result = await sendOpportunityMail(
      {
        opportunityId: id, ownerEmail: seesAllOrders(session) ? null : session.email, subject: read("subject"), body: read("body"), company: session.tenant.name, sentBy: session.email, now: new Date(),
        way: { env: process.env, key: () => vaultKey(process.env.ERP_CERT_KEY), send: sendMail },
      },
      conn,
    );
  } catch (error) {
    return problem(error);
  }
  revalidatePath(`${HERE}/${id}`);
  if (result.status === "falhou") return { error: `O e-mail para ${result.recipient} não saiu: ${result.detail ?? "falha no envio"}` };
  return { error: null, notice: `E-mail enviado para ${result.recipient}.` };
}

/** "Começar cadência" and "Parar cadência" of one opportunity, by the button pressed. */
export async function changeCadenceOfOpportunityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const id = whole(read("id"));
  if (id === null) return { error: "Oportunidade não encontrada." };
  const scope = seesAllOrders(session) ? null : session.email;
  try {
    if (read("what") === "parar") await stopCadence(id, `Parada por ${session.name}.`, scope, conn);
    else {
      const cadenceId = whole(read("cadenceId"));
      if (cadenceId === null) return { error: "Escolha a cadência." };
      await startCadence(id, cadenceId, session.email, scope, new Date(), conn);
    }
  } catch (error) {
    return problem(error);
  }
  revalidatePath(`${HERE}/${id}`);
  return { error: null };
}

/** "Registrar ligação": the call that was just made, how it went, and when to call again. Goes back to the opportunity. */
export async function logCallAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const id = whole(read("id"));
  if (id === null) return { error: "Oportunidade não encontrada." };
  try {
    await logCall(id, { outcome: read("outcome"), note: read("note"), againOn: read("againOn") || null }, session.email, { ownerEmail: seesAllOrders(session) ? null : session.email }, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  redirect(`${HERE}/${id}`);
}

/** "Agendar reunião" and "Salvar" of a meeting: with the box ticked, the contact gets the invitation by e-mail. */
export async function saveMeetingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const id = whole(read("id"));
  if (id === null) return { error: "Oportunidade não encontrada." };
  const minutes = read("minutes").trim();
  let saved;
  try {
    saved = await saveMeeting(
      whole(read("meetingId")),
      id,
      { title: read("title"), day: read("day"), time: read("time"), minutes: /^\d{2,3}$/.test(minutes) ? Number(minutes) : Number.NaN, link: read("link") || null, place: read("place") || null, invite: read("invite") === "sim" },
      session.email,
      { ownerEmail: seesAllOrders(session) ? null : session.email },
      { company: session.tenant.name, now: new Date(), way: { env: process.env, key: () => vaultKey(process.env.ERP_CERT_KEY), send: sendMail } },
      conn,
    );
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  revalidatePath(`${HERE}/${id}`);
  // The meeting is kept even when the invitation did not go: the person reads why and stays to try again.
  if (saved.invite.problem) return { error: `A reunião foi gravada, mas ${saved.invite.problem.charAt(0).toLowerCase()}${saved.invite.problem.slice(1)}` };
  redirect(`${HERE}/${id}`);
}

/** "Cancelar reunião" (who was invited is told) and "Remover" of a cancelled one, by the button pressed. */
export async function changeMeetingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("funil");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  const id = whole(read("id"));
  const meetingId = whole(read("meetingId"));
  if (id === null || meetingId === null) return { error: "Reunião não encontrada." };
  const scope = { ownerEmail: seesAllOrders(session) ? null : session.email };
  let notice: string;
  try {
    if (read("what") === "remover") {
      await deleteMeeting(meetingId, id, scope, conn);
      notice = "Reunião removida.";
    } else {
      const told = await cancelMeeting(meetingId, id, session.email, scope, { company: session.tenant.name, now: new Date(), way: { env: process.env, key: () => vaultKey(process.env.ERP_CERT_KEY), send: sendMail } }, conn);
      if (told.problem) return { error: `A reunião foi cancelada, mas ${told.problem.charAt(0).toLowerCase()}${told.problem.slice(1)}` };
      notice = told.sent ? `Reunião cancelada. ${told.sent} foi avisado.` : "Reunião cancelada.";
    }
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  revalidatePath(`${HERE}/${id}`);
  return { error: null, notice };
}

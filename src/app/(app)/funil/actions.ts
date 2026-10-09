"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { addActivity, createOpportunity, deleteActivity, deleteOpportunity, FunnelError, linkOpportunityOrder, moveOpportunity, setActivityDone, updateOpportunity } from "@/lib/db/funnel";
import type { OpportunityInput } from "@/lib/db/funnel";
import { tenantDb } from "@/lib/db/pool";
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
  if (error instanceof FunnelError) return { error: error.message };
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

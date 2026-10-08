"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { confirmsRefunds, menuItem } from "@/lib/auth/permissions";
import { listPaymentMethods } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { decideRefund, ReceivableError, recordReceipt, requestRefund } from "@/lib/db/receivables";
import { isoDate, parseMoney } from "@/lib/format";
import type { ActionState } from "@/lib/order-form";

const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

/** "Dar baixa": the amount is the one of the receivable; the form says only when, how and a note. */
export async function recordReceiptAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("recebimentos");
  const conn = tenantDb(session.tenant.slug);

  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  try {
    const method = text("method");
    if (method !== "" && !(await listPaymentMethods(conn)).includes(method)) return { error: '"Forma": escolha uma forma da lista.' };
    // Blank is everything that is open; a smaller amount is a partial receipt.
    const amount = text("amount") === "" ? undefined : parseMoney(text("amount"));
    if (amount === null) return { error: '"Valor recebido": informe um valor em reais maior que zero.' };
    await recordReceipt(
      Number(text("id")),
      { receivedOn: text("receivedOn"), method: method || null, note: text("note") || null, amount },
      session.email,
      isoDate(new Date()),
      conn,
    );
  } catch (error) {
    if (error instanceof ReceivableError) return { error: error.message };
    console.error("[recebimentos] falha ao dar baixa:", error instanceof Error ? error.message : error);
    return { error: FAILED };
  }
  revalidatePath(menuItem("recebimentos").href);
  return { error: null };
}

const field = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

function refused(action: string, error: unknown): ActionState {
  if (error instanceof ReceivableError) return { error: error.message };
  console.error(`[recebimentos] falha ao ${action}:`, error instanceof Error ? error.message : error);
  return { error: FAILED };
}

/** "Pedir estorno": nothing changes until the directors confirm. */
export async function requestRefundAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("recebimentos");
  const conn = tenantDb(session.tenant.slug);
  try {
    await requestRefund(Number(field(formData, "id")), field(formData, "reason"), session.email, conn);
  } catch (error) {
    return refused("pedir o estorno", error);
  }
  revalidatePath(menuItem("recebimentos").href);
  return { error: null };
}

/** "Confirmar" or "Recusar" a refund. Who may decide comes from the session, never from the form. */
export async function decideRefundAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("recebimentos");
  const conn = tenantDb(session.tenant.slug);
  if (!confirmsRefunds(session)) return { error: "Só a diretoria confirma ou recusa estorno." };

  const decision = field(formData, "decision");
  if (decision !== "confirmar" && decision !== "recusar") return { error: "Escolha confirmar ou recusar." };
  try {
    await decideRefund(Number(field(formData, "id")), decision === "confirmar", session.email, isoDate(new Date()), conn);
  } catch (error) {
    return refused("decidir o estorno", error);
  }
  revalidatePath(menuItem("recebimentos").href);
  revalidatePath(menuItem("comissoes").href);
  return { error: null };
}

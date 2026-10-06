"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listPaymentMethods } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { ReceivableError, recordReceipt } from "@/lib/db/receivables";
import { isoDate } from "@/lib/format";
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
    await recordReceipt(
      Number(text("id")),
      { receivedOn: text("receivedOn"), method: method || null, note: text("note") || null },
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

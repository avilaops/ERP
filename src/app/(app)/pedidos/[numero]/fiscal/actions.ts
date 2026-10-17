"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { FiscalError } from "@/lib/db/fiscal";
import { saveOrderFiscalRules } from "@/lib/db/order-fiscal-rules";
import { getOrder } from "@/lib/db/orders";
import { loadPublishedTable } from "@/lib/db/price-table";
import { tenantDb } from "@/lib/db/pool";
import { NOTE_RULE_STEPS, noteRulePatch } from "@/lib/fiscal/rules-form";
import type { ActionState } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";

export async function saveNoteRulesAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const session = await requirePermission("fiscal");
  const conn = tenantDb(session.tenant.slug);
  const read = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
  const number = read("number");
  if (!ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };
  const order = await getOrder(number, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  const table = order ? await loadPublishedTable(order.priceTableVersion, conn) : null;
  if (!order || !table || order.status !== "fechado") return { error: "A preparação fiscal exige um pedido fechado." };
  const step = Number(read("step"));
  const revision = Number(read("revision"));
  if (!Number.isSafeInteger(revision) || revision < 0) return { error: "Recarregue a preparação fiscal." };
  const reset = read("intent") === "reset";
  try {
    await saveOrderFiscalRules(order.id, table.lineId, revision, reset ? null : noteRulePatch(step, read), session.email, conn);
  } catch (error) {
    if (error instanceof FiscalError) return { error: error.message };
    console.error("[nfe] falha ao guardar preparação:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível salvar a preparação. Tente novamente." };
  }
  const here = `/pedidos/${number}`;
  revalidatePath(here);
  revalidatePath(`${here}/fiscal`);
  if (reset) redirect(`${here}/fiscal`);
  const next = read("intent") === "back" ? Math.max(0, step - 1) : step + 1;
  redirect(next >= NOTE_RULE_STEPS.length ? `${here}?ver=documentos#nota-fiscal` : `${here}/fiscal?etapa=${next}`);
}

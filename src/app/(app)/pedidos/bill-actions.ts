"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { getOrder } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { BillError, MAX_BILL_BYTES, saveOrderBill } from "@/lib/db/receivable-bills";
import type { ActionState } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";

export async function saveBillAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const session = await requirePermission("recebimentos");
  const number = form.get("number");
  const id = Number(form.get("receivableId"));
  if (typeof number !== "string" || !ORDER_NUMBER.test(number) || !Number.isSafeInteger(id) || id <= 0) return { error: "Parcela não encontrada." };
  const conn = tenantDb(session.tenant.slug);
  const order = await getOrder(number, { sellerEmail: null }, conn);
  if (!order) return { error: "Pedido não encontrado." };
  const remove = form.get("operation") === "remove";
  const file = form.get("file");
  if (!remove && (!(file instanceof File) || file.size === 0 || file.size > MAX_BILL_BYTES)) return { error: "Escolha um boleto em PDF de até 2 MB." };
  try {
    await saveOrderBill(order.id, id, remove ? null : new Uint8Array(await (file as File).arrayBuffer()), session.email, conn);
  } catch (error) {
    if (error instanceof BillError) return { error: error.message };
    console.error("[boleto] falha ao vincular arquivo:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível salvar o boleto. Tente de novo." };
  }
  revalidatePath(`/pedidos/${number}`);
  return { error: null, notice: remove ? "Boleto retirado do envio. O histórico foi preservado." : "Boleto vinculado à parcela. Confira beneficiário, valor e vencimento antes de enviar." };
}

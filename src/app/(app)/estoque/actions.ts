"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { countStock, shipOrder, StockError, unshipOrder } from "@/lib/db/stock";
import type { ActionState } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";

const HERE = menuItem("estoque").href;

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

function problem(error: unknown): ActionState {
  if (error instanceof StockError) return { error: error.message };
  console.error("[estoque] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
}

/** "Gravar contagem" of one equipment: how many there are in the warehouse now. */
export async function countStockAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("estoque");
  const id = Number(field(formData, "id"));
  const typed = field(formData, "counted").trim();
  if (!/^\d{1,7}$/.test(typed)) return { error: "Contagem: informe um número inteiro, zero ou maior." };
  let difference: number;
  try {
    ({ difference } = await countStock(id, Number(typed.replace(",", ".")), field(formData, "note"), session.email, tenantDb(session.tenant.slug)));
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  revalidatePath(`${HERE}/${id}`);
  return { error: null, notice: difference === 0 ? "A contagem bate com o sistema: nada mudou." : `Contagem gravada: ${difference > 0 ? "+" : ""}${difference} no estoque.` };
}

/** "Dar saída" of a closed order, and "Desfazer saída" (the confirmation, a submit with no name). */
export async function shipOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("estoque");
  const number = field(formData, "number");
  if (!ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };
  const undo = field(formData, "what") !== "sair";
  try {
    await (undo ? unshipOrder : shipOrder)(number, session.email, tenantDb(session.tenant.slug));
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  return { error: null, notice: undo ? `Saída do pedido ${number} desfeita: as peças voltaram ao estoque.` : `Pedido ${number} saiu do estoque.` };
}

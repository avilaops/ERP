"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { managesCommissions, menuItem } from "@/lib/auth/permissions";
import { cancelManualCommission, CommissionError, createManualCommission, payCommissions, updateManualCommission } from "@/lib/db/commissions";
import { tenantDb } from "@/lib/db/pool";
import { parseMoney } from "@/lib/format";
import type { ActionState } from "@/lib/order-form";

const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

/** "Marcar como paga": only who manages commissions; a seller has the screen but not this. */
export async function payCommissionsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("comissoes");
  const conn = tenantDb(session.tenant.slug);
  if (!managesCommissions(session)) return { error: "Seu perfil não marca comissão como paga." };

  const field = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  if (!/^\d{4}-\d{2}$/.test(field("month"))) return { error: "Mês inválido." };
  try {
    await payCommissions(field("seller"), field("month"), session.email, conn);
  } catch (error) {
    if (error instanceof CommissionError) return { error: error.message };
    console.error("[comissoes] falha ao pagar:", error instanceof Error ? error.message : error);
    return { error: FAILED };
  }
  revalidatePath(menuItem("comissoes").href);
  revalidatePath(menuItem("contas-pagar").href);
  return { error: null };
}

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

function refused(action: string, error: unknown): ActionState {
  if (error instanceof CommissionError) return { error: error.message };
  console.error(`[comissoes] falha ao ${action}:`, error instanceof Error ? error.message : error);
  return { error: FAILED };
}

function directionOf(value: string): "credito" | "debito" | null {
  return value === "credito" || value === "debito" ? value : null;
}

/** Administrative commission tied to the seller of an order. It is not a receipt. */
export async function createManualCommissionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("comissoes");
  if (!managesCommissions(session)) return { error: "Seu perfil não lança comissão." };
  const direction = directionOf(text(formData, "direction"));
  const amount = parseMoney(text(formData, "amount"));
  if (!direction) return { error: "Escolha crédito ou débito." };
  if (amount === null) return { error: "Informe um valor válido." };
  if (!/^\d{4}-\d{2}$/.test(text(formData, "month"))) return { error: "Mês inválido." };
  try {
    await createManualCommission({
      orderNumber: text(formData, "orderNumber"),
      amount,
      direction,
      month: text(formData, "month"),
      reason: text(formData, "reason"),
    }, session.email, tenantDb(session.tenant.slug));
  } catch (error) {
    return refused("lançar comissão", error);
  }
  revalidatePath(menuItem("comissoes").href);
  revalidatePath(menuItem("contas-pagar").href);
  return { error: null, notice: "Comissão lançada." };
}

/** Correct or void one unpaid manual commission. A receipt commission stays with its refund. */
export async function adjustManualCommissionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("comissoes");
  if (!managesCommissions(session)) return { error: "Seu perfil não corrige comissão." };
  const id = Number(text(formData, "id"));
  const action = text(formData, "action");
  const conn = tenantDb(session.tenant.slug);
  try {
    if (action === "cancelar") await cancelManualCommission(id, text(formData, "reason"), session.email, conn);
    else if (action === "editar") {
      const direction = directionOf(text(formData, "direction"));
      const amount = parseMoney(text(formData, "amount"));
      if (!direction) return { error: "Escolha crédito ou débito." };
      if (amount === null) return { error: "Informe um valor válido." };
      await updateManualCommission(id, { amount, direction, reason: text(formData, "reason") }, session.email, conn);
    } else return { error: "Operação inválida." };
  } catch (error) {
    return refused("corrigir comissão", error);
  }
  revalidatePath(menuItem("comissoes").href);
  revalidatePath(menuItem("contas-pagar").href);
  return { error: null };
}

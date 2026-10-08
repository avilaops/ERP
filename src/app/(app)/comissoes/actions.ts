"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { managesCommissions, menuItem } from "@/lib/auth/permissions";
import { CommissionError, payCommissions } from "@/lib/db/commissions";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

/** "Marcar como paga": only who manages commissions; a seller has the screen but not this. */
export async function payCommissionsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("comissoes");
  const conn = tenantDb(session.tenant.slug);
  if (!managesCommissions(session)) return { error: "Seu perfil não marca comissão como paga." };

  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  if (!/^\d{4}-\d{2}$/.test(text("month"))) return { error: "Mês inválido." };
  try {
    await payCommissions(text("seller"), text("month"), session.email, conn);
  } catch (error) {
    if (error instanceof CommissionError) return { error: error.message };
    console.error("[comissoes] falha ao pagar:", error instanceof Error ? error.message : error);
    return { error: FAILED };
  }
  revalidatePath(menuItem("comissoes").href);
  return { error: null };
}

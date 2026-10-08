"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem, setsGoals } from "@/lib/auth/permissions";
import { GoalError, listSellers, saveGoal } from "@/lib/db/goals";
import { tenantDb } from "@/lib/db/pool";
import { isoDate, parseMoney } from "@/lib/format";
import type { ActionState } from "@/lib/order-form";

/** "Salvar meta": of the team or of one seller, for the current month. Only who sets goals. */
export async function saveGoalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("precos-metas");
  const conn = tenantDb(session.tenant.slug);
  if (!setsGoals(session)) return { error: "Só a diretoria define metas." };

  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const amount = text("amount") === "" ? 0 : parseMoney(text("amount"));
  if (amount === null) return { error: '"Meta": informe um valor em reais, zero ou mais (ex.: 150.000,00).' };
  try {
    const seller = text("seller");
    if (seller !== "" && !(await listSellers(conn)).some((person) => person.email === seller)) return { error: '"Para quem": escolha da lista.' };
    // The month is the current one, in São Paulo: it is not read from the form.
    await saveGoal(seller === "" ? null : seller, isoDate(new Date()).slice(0, 7), amount, session.email, conn);
  } catch (error) {
    if (error instanceof GoalError) return { error: error.message };
    console.error("[precos-metas] falha ao gravar a meta:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
  }
  revalidatePath(menuItem("precos-metas").href);
  return { error: null };
}

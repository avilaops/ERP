"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { approvesAtLoss, menuItem } from "@/lib/auth/permissions";
import { decideApproval } from "@/lib/db/approvals";
import { OrderError } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

/**
 * "Aprovar" and "Recusar". Who decides, the profile and whether a loss may be
 * approved come from the session; the form only says which order and what was written.
 */
export async function decideApprovalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("aprovacoes");
  const conn = tenantDb(session.tenant.slug);

  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const number = text("number");
  const decision = text("decision");
  if (decision !== "aprovar" && decision !== "recusar") return { error: "Escolha aprovar ou recusar." };
  if (session.role !== "DIRETORIA" && session.role !== "GERENTE_COMERCIAL") return { error: "Seu perfil não decide aprovações." };

  try {
    await decideApproval(
      number,
      { approve: decision === "aprovar", comment: text("comment") },
      { email: session.email, role: session.role, approvesAtLoss: approvesAtLoss(session.role) },
      conn,
    );
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    console.error("[aprovacoes] falha ao decidir:", error instanceof Error ? error.message : error);
    return { error: FAILED };
  }
  revalidatePath(menuItem("aprovacoes").href);
  revalidatePath(menuItem("pedidos").href);
  revalidatePath(`${menuItem("pedidos").href}/${number}`);
  return { error: null };
}

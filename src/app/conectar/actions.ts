"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { revokeConnection } from "@/lib/db/mcp";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

/** "Desconectar" one of the person's own assistants: its keys stop working at once. Nobody disconnects another person's here. */
export async function disconnectMineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession("/conectar");
  const conn = tenantDb(session.tenant.slug);
  const typed = formData.get("id");
  const id = typeof typed === "string" && /^[1-9]\d{0,8}$/.test(typed) ? Number(typed) : null;
  if (id === null || !(await revokeConnection(id, session.email, session.email, conn))) return { error: "Conexão não encontrada. Recarregue a página." };
  revalidatePath("/conectar");
  return { error: null, notice: "Assistente desconectado." };
}

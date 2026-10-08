"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import { ProductLineError, createLine, deleteLine, listLines, renameLine } from "@/lib/db/product-lines";
import { exactLine } from "@/lib/lines-view";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/linhas";
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";
const NO_LINE = "Linha não encontrada. Recarregue a página.";

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

function problem(error: unknown): string {
  if (error instanceof ProductLineError) return error.message;
  console.error("[linhas] falha ao gravar:", error instanceof Error ? error.message : error);
  return FAILED;
}

/** The new line starts with a copy of the parameters of the line chosen. */
export async function createLineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    const source = exactLine(await listLines(conn), formData.get("copyFrom"));
    if (!source) return { error: "Escolha de qual linha copiar os parâmetros." };
    await createLine(text(formData, "name"), source.id, session.email, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

export async function renameLineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    const line = exactLine(await listLines(conn), formData.get("id"));
    if (!line) return { error: NO_LINE };
    await renameLine(line.id, text(formData, "name"), session.email, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

/** Only a line without equipment and without published table leaves. */
export async function deleteLineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    const line = exactLine(await listLines(conn), formData.get("id"));
    if (!line) return { error: NO_LINE };
    await deleteLine(line.id, conn);
  } catch (error) {
    return { error: problem(error) };
  }
  revalidatePath(HERE);
  return { error: null };
}

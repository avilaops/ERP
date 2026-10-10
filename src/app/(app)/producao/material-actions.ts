"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { deleteMaterial, MaterialError, moveMaterial, removeBillLine, saveMaterial, setBillLine } from "@/lib/db/materials";
import { tenantDb } from "@/lib/db/pool";
import type { ActionState } from "@/lib/order-form";

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};
const whole = (value: string) => (/^[1-9]\d{0,8}$/.test(value) ? Number(value) : null);
/** `12`, `12,5` or `12.5`. What is not a plain number is not understood, never zero. */
const amount = (typed: string) => (/^\d{1,8}([.,]\d{1,4})?$/.test(typed.trim()) ? Number(typed.trim().replace(",", ".")) : Number.NaN);

function problem(error: unknown): ActionState {
  if (error instanceof MaterialError) return { error: error.message };
  console.error("[materiais] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
}

/** "Adicionar material", "Salvar" and "Remover" of one material, by the button pressed. */
export async function materialAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("producao");
  const conn = tenantDb(session.tenant.slug);
  const id = whole(field(formData, "id"));
  // "Remover" asks once more, and its confirmation is a plain submit: with no button named, it is the removal.
  const what = field(formData, "what") || "remover";
  try {
    if (what === "remover") {
      if (id === null) return { error: "Material não encontrado." };
      await deleteMaterial(id, conn);
    } else {
      const start = field(formData, "stock").trim();
      await saveMaterial(id, { name: field(formData, "name"), unit: field(formData, "unit"), minimum: field(formData, "minimum").trim() === "" ? 0 : amount(field(formData, "minimum")), stock: start === "" ? 0 : amount(start) }, session.email, conn);
    }
  } catch (error) {
    return problem(error);
  }
  revalidatePath("/producao/materiais");
  return { error: null, notice: what === "remover" ? "Material removido." : id === null ? "Material criado." : "Material gravado." };
}

/** "Lançar": an entry, an exit or a count of one material. */
export async function moveMaterialAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("producao");
  const conn = tenantDb(session.tenant.slug);
  const id = whole(field(formData, "id"));
  if (id === null) return { error: "Material não encontrado." };
  try {
    await moveMaterial(id, { kind: field(formData, "kind"), quantity: amount(field(formData, "quantity")), note: field(formData, "note") || null }, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath("/producao/materiais");
  revalidatePath("/producao/necessidades");
  return { error: null, notice: "Lançado." };
}

/** The list of materials of one equipment: "Adicionar" (or change how much) and "Remover" of one line. */
export async function billAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("producao");
  const conn = tenantDb(session.tenant.slug);
  const productId = whole(field(formData, "productId"));
  const materialId = whole(field(formData, "materialId"));
  if (productId === null) return { error: "Equipamento não encontrado." };
  if (materialId === null) return { error: "Escolha o material." };
  const remove = field(formData, "what") === "remover";
  try {
    if (remove) await removeBillLine(productId, materialId, conn);
    else await setBillLine(productId, materialId, amount(field(formData, "quantity")), session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(`/producao/lista/${productId}`);
  revalidatePath("/producao/necessidades");
  return { error: null, notice: remove ? "Material tirado da lista." : "Lista gravada." };
}

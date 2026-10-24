"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { ProductError, updateProduct } from "@/lib/db/products";
import { parseProductForm } from "@/lib/product-form";
import type { ActionState } from "@/lib/order-form";

const FIELDS = ["advisoryCost", "taxCredit", "packaging"] as const;

export async function updateProductCostsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("custos");
  const read = (key: (typeof FIELDS)[number]) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : null;
  };
  const parsed = parseProductForm(FIELDS, read, formData.get("wording") !== "nacional");
  if (!parsed.ok) return { error: parsed.errors.join(" ") };
  try {
    await updateProduct(Number(formData.get("id")), parsed.input, session.email, tenantDb(session.tenant.slug));
  } catch (error) {
    if (error instanceof ProductError) return { error: error.message };
    console.error("[custos] falha ao alterar custos:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
  }
  revalidatePath(menuItem("custos").href);
  revalidatePath(menuItem("produtos").href);
  revalidatePath(menuItem("parametros").href);
  return { error: null, notice: "Custos gravados." };
}

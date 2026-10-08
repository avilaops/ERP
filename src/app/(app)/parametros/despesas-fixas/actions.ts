"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { createFixedExpense, deleteFixedExpense, FixedExpenseError, updateFixedExpense } from "@/lib/db/fixed-expenses";
import type { FixedExpenseInput } from "@/lib/db/fixed-expenses";
import { listAllPayableCategories } from "@/lib/db/payable-categories";
import { tenantDb } from "@/lib/db/pool";
import { parseMoney } from "@/lib/format";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/despesas-fixas";
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

/** What was typed, or the message of the first field that cannot be read. */
function read(formData: FormData, categories: string[]): FixedExpenseInput | string {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const amount = text("amount") === "" ? null : parseMoney(text("amount"));
  if (amount === null) return '"Valor": informe um valor em reais maior que zero (ex.: 3.500,00).';
  if (!categories.includes(text("category"))) return '"Categoria": escolha uma da lista.';
  return {
    label: text("label"),
    category: text("category"),
    amount,
    dueDay: /^\d{1,2}$/.test(text("dueDay")) ? Number(text("dueDay")) : 0,
    // The form of a new expense has no box: absent means in use.
    active: formData.get("hasActive") === null ? true : text("active") !== "",
  };
}

function refresh(): ActionState {
  revalidatePath(HERE);
  revalidatePath(menuItem("parametros").href);
  revalidatePath(menuItem("precos-metas").href);
  return { error: null };
}

function problem(error: unknown): ActionState {
  if (error instanceof FixedExpenseError) return { error: error.message };
  console.error("[despesas-fixas] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: FAILED };
}

export async function createFixedExpenseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    const input = read(formData, (await listAllPayableCategories(conn)).map((category) => category.label));
    if (typeof input === "string") return { error: input };
    await createFixedExpense(input, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  return refresh();
}

export async function updateFixedExpenseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    const input = read(formData, (await listAllPayableCategories(conn)).map((category) => category.label));
    if (typeof input === "string") return { error: input };
    await updateFixedExpense(Number(formData.get("id")), input, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  return refresh();
}

/** "Remover": only an expense never launched; the others are turned off. */
export async function deleteFixedExpenseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await deleteFixedExpense(Number(formData.get("id")), conn);
  } catch (error) {
    return problem(error);
  }
  return refresh();
}

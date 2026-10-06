"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { listPaymentMethods } from "@/lib/db/orders";
import { listPayableCategories } from "@/lib/db/payable-categories";
import { createPayable, deletePayable, PayableError, payPayable, unpayPayable } from "@/lib/db/payables";
import { tenantDb } from "@/lib/db/pool";
import { listSuppliers } from "@/lib/db/suppliers";
import { isoDate } from "@/lib/format";
import type { ActionState } from "@/lib/order-form";
import { parsePayableForm, parsePaymentForm } from "@/lib/payable-form";

const HERE = menuItem("contas-pagar").href;
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";
const OK: ActionState = { error: null };

const reader = (formData: FormData) => (key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
};

function problem(action: string, error: unknown): ActionState {
  if (error instanceof PayableError) return { error: error.message };
  console.error(`[contas-pagar] falha ao ${action}:`, error instanceof Error ? error.message : error);
  return { error: FAILED };
}

/** "Lançar conta": category, form and supplier are checked against the lists of the company. */
export async function createPayableAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("contas-pagar");
  const conn = tenantDb(session.tenant.slug);
  try {
    const parsed = parsePayableForm(reader(formData), {
      categories: await listPayableCategories(conn),
      methods: await listPaymentMethods(conn),
      supplierIds: (await listSuppliers(conn)).filter((supplier) => supplier.active).map((supplier) => supplier.id),
    });
    if (!parsed.ok) return { error: parsed.errors.join(" ") };
    await createPayable(parsed.value, session.email, conn);
  } catch (error) {
    return problem("lançar a conta", error);
  }
  revalidatePath(HERE);
  return OK;
}

export async function payPayableAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("contas-pagar");
  const conn = tenantDb(session.tenant.slug);
  const read = reader(formData);
  try {
    const parsed = parsePaymentForm(read, await listPaymentMethods(conn));
    if (!parsed.ok) return { error: parsed.errors.join(" ") };
    await payPayable(Number(read("id")), parsed.value, session.email, isoDate(new Date()), conn);
  } catch (error) {
    return problem("pagar a conta", error);
  }
  revalidatePath(HERE);
  return OK;
}

export async function unpayPayableAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("contas-pagar");
  const conn = tenantDb(session.tenant.slug);
  try {
    await unpayPayable(Number(reader(formData)("id")), session.email, conn);
  } catch (error) {
    return problem("desfazer o pagamento", error);
  }
  revalidatePath(HERE);
  return OK;
}

/** "Excluir": only a bill not paid yet. Leaves a line in the log. */
export async function deletePayableAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("contas-pagar");
  const conn = tenantDb(session.tenant.slug);
  try {
    const { description } = await deletePayable(Number(reader(formData)("id")), conn);
    console.info(`[contas-pagar] ${session.email} excluiu a conta "${description}" em ${session.tenant.slug}`);
  } catch (error) {
    return problem("excluir a conta", error);
  }
  revalidatePath(HERE);
  return OK;
}

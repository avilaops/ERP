"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import type { ActionState } from "@/lib/order-form";
import { tenantDb } from "@/lib/db/pool";
import { menuItem } from "@/lib/auth/permissions";
import { parseCustomerForm, rawCustomerValues } from "@/lib/customer-form";
import type { CustomerFieldKey, CustomerFormState } from "@/lib/customer-form";
import { createCustomer, CustomerError, getCustomer, updateCustomer, deleteCustomer } from "@/lib/db/customers";

const PATH = menuItem("clientes").href;
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

/** The database layer's own refusal goes to the screen; anything else is logged and answered in general terms. */
function problem(error: unknown): string {
  if (error instanceof CustomerError) return error.message;
  console.error("[clientes] falha ao gravar:", error instanceof Error ? error.message : error);
  return FAILED;
}

/**
 * Saves the record: creates when there is no id, changes otherwise. On a change
 * the kind and the document are the stored ones, whatever the form sends.
 * A server action is a public endpoint: the permission is checked before reading anything.
 */
export async function saveCustomerAction(_previous: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const session = await requirePermission("clientes");
  const conn = tenantDb(session.tenant.slug);

  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : null;
  };
  const id = text("id") ?? "";
  const current = id === "" ? null : await getCustomer(Number(id), conn);
  const kind = current?.kind ?? (text("kind") === "PF" ? "PF" : "PJ");
  const read = (key: CustomerFieldKey) => (current && key === "document" ? current.document : text(key));

  const typed = rawCustomerValues(kind, text);
  const refuse = (errors: string[], invalid: CustomerFieldKey[] = []): CustomerFormState => ({
    status: "error",
    errors,
    invalid,
    values: typed,
  });
  if (id !== "" && !current) return refuse(["Cliente não encontrado."]);

  const parsed = parseCustomerForm(kind, read);
  if (!parsed.ok) return refuse(parsed.errors, parsed.invalid);

  let created: number | null = null;
  try {
    if (current) await updateCustomer(current.id, parsed.input, session.email, conn);
    else created = (await createCustomer(parsed.input, session.email, conn)).id;
  } catch (error) {
    return refuse([problem(error)]);
  }

  revalidatePath(PATH);
  // A new customer goes on to its own record, where it can be completed.
  if (created !== null) redirect(`${PATH}/${created}?cadastrado=1`);
  revalidatePath(`${PATH}/${id}`);
  return { status: "saved", errors: [], invalid: [], values: null };
}

/** "Remover cliente": only one with no order. Leaves a line in the log. */
export async function deleteCustomerAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("clientes");
  const conn = tenantDb(session.tenant.slug);
  try {
    const { name } = await deleteCustomer(Number(formData.get("id")), conn);
    console.info(`[clientes] ${session.email} removeu o cliente "${name}" em ${session.tenant.slug}`);
  } catch (error) {
    if (error instanceof CustomerError) return { error: error.message };
    console.error("[clientes] falha ao remover:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível remover agora. Nada foi alterado; tente de novo." };
  }
  revalidatePath(menuItem("clientes").href);
  redirect(menuItem("clientes").href);
}

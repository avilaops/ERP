"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { createProduct, deleteProduct, ProductError, updateProduct } from "@/lib/db/products";
import { NEW_PRODUCT_FIELDS, parseProductForm, rawProductValues, ROW_FIELDS } from "@/lib/product-form";
import type { NewProductState, ProductFieldKey, RowState } from "@/lib/product-form";

const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";

/** The list, and Parâmetros: the suggested down payment there depends on the costs. */
function revalidate(): void {
  revalidatePath(menuItem("produtos").href);
  revalidatePath(menuItem("parametros").href);
}

const reader = (formData: FormData) => (key: ProductFieldKey | "id" | "active") => {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
};

/** The database layer's own refusal goes to the screen; anything else is logged and answered in general terms. */
function problem(action: string, error: unknown): string {
  if (error instanceof ProductError) return error.message;
  console.error(`[produtos] falha ao ${action}:`, error instanceof Error ? error.message : error);
  return FAILED;
}

const rowError = (message: string, values: RowState["values"] = null): RowState => ({
  status: "error",
  errors: [message],
  invalid: [],
  values,
});

const SAVED: RowState = { status: "saved", errors: [], invalid: [], values: null };

/** A server action is a public endpoint: the permission is checked again, before reading anything. */
export async function createProductAction(_previous: NewProductState, formData: FormData): Promise<NewProductState> {
  const session = await requirePermission("produtos");

  const read = reader(formData);
  const typed = rawProductValues(NEW_PRODUCT_FIELDS, read);
  const parsed = parseProductForm(NEW_PRODUCT_FIELDS, read);
  if (!parsed.ok) return { status: "error", errors: parsed.errors, invalid: parsed.invalid, values: typed };

  try {
    await createProduct(parsed.input, session.email);
  } catch (error) {
    return { status: "error", errors: [problem("cadastrar", error)], invalid: [], values: typed };
  }

  revalidate();
  return { status: "saved", errors: [], invalid: [], values: null };
}

/** Saves the fields of one row. The calculated columns come back redone with the page. */
export async function updateProductAction(_previous: RowState, formData: FormData): Promise<RowState> {
  const session = await requirePermission("produtos");

  const read = reader(formData);
  const typed = rawProductValues(ROW_FIELDS, read);
  const parsed = parseProductForm(ROW_FIELDS, read);
  if (!parsed.ok) return { status: "error", errors: parsed.errors, invalid: parsed.invalid, values: typed };

  try {
    await updateProduct(Number(read("id")), parsed.input, session.email);
  } catch (error) {
    return rowError(problem("alterar", error), typed);
  }

  revalidate();
  return SAVED;
}

/** Desativar and Reativar: the product only changes tab, with everything it has. */
export async function setProductActiveAction(_previous: RowState, formData: FormData): Promise<RowState> {
  const session = await requirePermission("produtos");

  const read = reader(formData);
  try {
    await updateProduct(Number(read("id")), { active: read("active") === "true" }, session.email);
  } catch (error) {
    return rowError(problem("desativar ou reativar", error));
  }

  revalidate();
  return SAVED;
}

/** Removes the record. Until there is an audit table, the server log is the only trace. */
export async function deleteProductAction(_previous: RowState, formData: FormData): Promise<RowState> {
  const session = await requirePermission("produtos");

  try {
    const removed = await deleteProduct(Number(reader(formData)("id")));
    console.info(`[produtos] excluído: id ${removed.id}, código ${removed.code ?? "sem código"}, por ${session.email}`);
  } catch (error) {
    return rowError(problem("excluir", error));
  }

  revalidate();
  return SAVED;
}

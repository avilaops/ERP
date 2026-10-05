"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { appliedText, ignoredText, parseAdvisoryPaste, pasteSizeProblem, previewRows } from "@/lib/advisory-paste";
import type { InvalidLine, PasteState } from "@/lib/advisory-paste";
import {
  applyAdvisoryCosts,
  createProduct,
  deleteProduct,
  listProducts,
  ProductError,
  updateProduct,
} from "@/lib/db/products";
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

const pasteError = (text: string, message: string): PasteState => ({
  status: "error",
  text,
  message,
  rows: [],
  invalid: [],
  headerSkipped: false,
});

/** The browser sends line breaks as CRLF; the comparison and the line numbers use LF. */
const unixLines = (text: string | null) => (text ?? "").replaceAll("\r\n", "\n");

/**
 * "Colar custos da assessoria". Conferir only reads and shows; Aplicar reads the
 * same text again, against the database of that moment, and writes every valid
 * row in one statement. Applying a text that was not the one checked only checks it.
 */
export async function pasteAdvisoryCostsAction(_previous: PasteState, formData: FormData): Promise<PasteState> {
  const session = await requirePermission("produtos");

  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : null;
  };
  const text = unixLines(read("text"));
  if (text.trim() === "") return pasteError(text, "Cole a planilha da assessoria na caixa antes de conferir.");
  const tooLarge = pasteSizeProblem(text);
  if (tooLarge) return pasteError(text, tooLarge);

  const checked = read("intent") === "apply" && unixLines(read("checked")) === text;
  try {
    const products = await listProducts();
    const known = new Set(products.flatMap((product) => (product.code === null ? [] : [product.code])));
    const parsed = parseAdvisoryPaste(text, known);
    const preview: PasteState = {
      status: "preview",
      text,
      message: read("intent") === "apply" && !checked ? "O texto mudou depois da conferência. Confira de novo antes de aplicar." : null,
      rows: previewRows(parsed.rows, products),
      invalid: parsed.invalid,
      headerSkipped: parsed.headerSkipped,
    };
    if (!checked || parsed.rows.length === 0) return preview;

    const updated = new Set((await applyAdvisoryCosts(parsed.rows, session.email)).map((product) => product.code));
    // A product removed between checking and applying: its line was not written.
    const gone: InvalidLine[] = parsed.rows
      .filter((row) => !updated.has(row.code))
      .map(({ line, text: content }) => ({ line, text: content, reason: "código não cadastrado" }));
    const ignored = [...parsed.invalid, ...gone].sort((a, b) => a.line - b.line);

    revalidate();
    return {
      status: "applied",
      text: "",
      message: ignored.length === 0 ? appliedText(updated.size) : `${appliedText(updated.size)} ${ignoredText(ignored.length)}:`,
      rows: [],
      invalid: ignored,
      headerSkipped: parsed.headerSkipped,
    };
  } catch (error) {
    console.error("[produtos] falha ao colar custos:", error instanceof Error ? error.message : error);
    return pasteError(text, "Não foi possível ler ou gravar os custos agora. Nada foi alterado; tente de novo.");
  }
}

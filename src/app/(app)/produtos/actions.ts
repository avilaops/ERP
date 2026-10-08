"use server";

import { listLines } from "@/lib/db/product-lines";
import { exactLine } from "@/lib/lines-view";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
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
import { loadParams } from "@/lib/db/params";
import { latestVersion, loadPublishedSnapshot, nextVersionNumber, PriceTableError, publishPriceTable } from "@/lib/db/price-table";
import { draftPriceTable, NOTHING_TO_PUBLISH, pendingChanges } from "@/lib/price-table";
import type { PublishState } from "@/lib/price-table";
import { NEW_PRODUCT_FIELDS, parseProductForm, rawProductValues, ROW_FIELDS } from "@/lib/product-form";
import type { NewProductState, ProductFieldKey, ProductScreenResult, RowState } from "@/lib/product-form";

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

const NO_LINE = "A linha de produto desta tela não existe mais. Recarregue a página.";

const SAVED: RowState = { status: "saved", errors: [], invalid: [], values: null };

/** A server action is a public endpoint: the permission is checked again, before reading anything. */
export async function createProductAction(_previous: NewProductState, formData: FormData): Promise<NewProductState> {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);

  const read = reader(formData);
  const typed = rawProductValues(NEW_PRODUCT_FIELDS, read);
  const parsed = parseProductForm(NEW_PRODUCT_FIELDS, read);
  if (!parsed.ok) return { status: "error", errors: parsed.errors, invalid: parsed.invalid, values: typed };

  try {
    const line = exactLine(await listLines(conn), formData.get("lineId"));
    if (!line) return { status: "error", errors: [NO_LINE], invalid: [], values: typed };
    await createProduct({ ...parsed.input, lineId: line.id }, session.email, conn);
  } catch (error) {
    return { status: "error", errors: [problem("cadastrar", error)], invalid: [], values: typed };
  }

  revalidate();
  return { status: "saved", errors: [], invalid: [], values: null };
}

/** Saves the fields of one row. The calculated columns come back redone with the page. */
export async function updateProductAction(_previous: RowState, formData: FormData): Promise<RowState> {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);

  const read = reader(formData);
  const typed = rawProductValues(ROW_FIELDS, read);
  const parsed = parseProductForm(ROW_FIELDS, read);
  if (!parsed.ok) return { status: "error", errors: parsed.errors, invalid: parsed.invalid, values: typed };

  try {
    await updateProduct(Number(read("id")), parsed.input, session.email, conn);
  } catch (error) {
    return rowError(problem("alterar", error), typed);
  }

  revalidate();
  return SAVED;
}

/** Desativar and Reativar: the product only changes tab, with everything it has. */
export async function setProductActiveAction(_previous: RowState, formData: FormData): Promise<RowState> {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);

  const read = reader(formData);
  try {
    await updateProduct(Number(read("id")), { active: read("active") === "true" }, session.email, conn);
  } catch (error) {
    return rowError(problem("desativar ou reativar", error));
  }

  revalidate();
  return SAVED;
}

/** Removes the record. Until there is an audit table, the server log is the only trace. */
export async function deleteProductAction(_previous: RowState, formData: FormData): Promise<RowState> {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);

  try {
    const removed = await deleteProduct(Number(reader(formData)("id")), conn);
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
  const conn = tenantDb(session.tenant.slug);

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
    const products = await listProducts({}, conn);
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

    const updated = new Set((await applyAdvisoryCosts(parsed.rows, session.email, conn)).map((product) => product.code));
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

const publishError = (message: string): PublishState => ({ status: "error", message });

/**
 * "Publicar vN+1": the draft of that moment becomes the version the team sells
 * with. `expected` is the number the screen showed; if someone published in the
 * meantime, nothing is written and the notice says so.
 */
export async function publishPriceTableAction(_previous: PublishState, formData: FormData): Promise<PublishState> {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);

  const expected = Number(formData.get("expected"));
  try {
    const line = exactLine(await listLines(conn), formData.get("lineId"));
    if (!line) return publishError(NO_LINE);
    const [params, products, latest, next] = await Promise.all([
      loadParams(conn, line.id),
      listProducts({ active: true, lineId: line.id }, conn),
      latestVersion(conn, line.id),
      nextVersionNumber(conn),
    ]);
    const published = latest ? await loadPublishedSnapshot(latest.version, conn) : null;

    const draft = draftPriceTable(params, products);
    if (draft.items.length === 0) return publishError(NOTHING_TO_PUBLISH);
    if (!pendingChanges(draft, published)) return publishError(`Nada mudou desde a tabela v${latest?.version}.`);

    if (expected !== next) {
      return publishError("A tabela já foi publicada por outra pessoa. Confira o que está pendente e publique de novo.");
    }

    const { version } = await publishPriceTable(draft, next, session.email, conn, line.id);
    console.info(`[produtos] tabela v${version} publicada: ${draft.items.length} equipamento(s), por ${session.email}`);

    revalidatePath(menuItem("produtos").href);
    revalidatePath(menuItem("tabela-precos").href);
    return { status: "published", message: `Tabela v${version} publicada. A equipe já vende com ela.` };
  } catch (error) {
    if (error instanceof PriceTableError) return publishError(error.message);
    console.error("[produtos] falha ao publicar:", error instanceof Error ? error.message : error);
    return publishError(FAILED);
  }
}

/**
 * "Salvar equipamento" of the screen of one equipment, new or saved: every
 * field at once. Answers with the id, so the screen can send the photo next.
 */
export async function saveProductScreenAction(formData: FormData): Promise<ProductScreenResult> {
  const session = await requirePermission("produtos");
  const conn = tenantDb(session.tenant.slug);

  const read = reader(formData);
  const parsed = parseProductForm(NEW_PRODUCT_FIELDS, read);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, invalid: parsed.invalid };

  const id = read("id");
  try {
    const line = exactLine(await listLines(conn), formData.get("lineId"));
    if (!line) return { ok: false, errors: [NO_LINE], invalid: [] };
    const input = { ...parsed.input, lineId: line.id };
    const product = id ? await updateProduct(Number(id), input, session.email, conn) : await createProduct(input, session.email, conn);
    revalidate();
    return { ok: true, id: product.id };
  } catch (error) {
    return { ok: false, errors: [problem(id ? "alterar" : "cadastrar", error)], invalid: [] };
  }
}

"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { tenantDb } from "@/lib/db/pool";
import type { Session } from "@/lib/auth";
import { approvesAtLoss, menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { parseCustomerForm, rawCustomerValues } from "@/lib/customer-form";
import type { CustomerFieldKey, CustomerFormState } from "@/lib/customer-form";
import { createCustomer, CustomerError, findCustomerByDocument, getCustomer, updateCustomer } from "@/lib/db/customers";
import {
  addOrderItem,
  closeOrder,
  createOrder,
  deleteOrder,
  getOrder,
  linkOrderCustomer,
  listPaymentMethods,
  OrderError,
  removeOrderItem,
  reopenOrder,
  saveOrderTerms,
  savePayment,
  setOrderItemQuantity,
} from "@/lib/db/orders";
import type { OrderScope } from "@/lib/db/orders";
import { latestVersion, loadPublishedTable } from "@/lib/db/price-table";
import { isoDate } from "@/lib/format";
import { parseOrderPayment, parseOrderTerms, parseQuantity } from "@/lib/order-form";
import type { ActionState } from "@/lib/order-form";
import { orderNumber } from "@/lib/order-number";

const ORDERS = menuItem("pedidos").href;
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";
const OK: ActionState = { error: null };

/** A seller reaches only their own orders; who sees all of them is decided in one place. */
const scopeOf = (session: Session): OrderScope => ({ sellerEmail: seesAllOrders(session.role) ? null : session.email });

const reader = (formData: FormData) => (key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
};

/** The layers' own refusals go to the screen; anything else is logged and answered in general terms. */
function problem(action: string, error: unknown): string {
  if (error instanceof OrderError || error instanceof CustomerError) return error.message;
  console.error(`[pedidos] falha ao ${action}:`, error instanceof Error ? error.message : error);
  return FAILED;
}

const QUANTITY = "Informe a quantidade: um número inteiro maior que zero.";

/**
 * "Adicionar" of a new order: the order is born here, with its first item, in the
 * newest published table. Opening the page writes nothing.
 * A server action is a public endpoint: the permission is checked before reading anything.
 */
export async function createOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);

  const read = reader(formData);
  const quantity = parseQuantity(read("quantity"));
  if (quantity === null) return { error: QUANTITY };

  let number: string;
  try {
    // The line is the one of the table the screen showed; the newest of that line is the one sold with.
    const shown = await loadPublishedTable(Number(read("version")), conn);
    const latest = shown ? await latestVersion(conn, shown.lineId) : null;
    if (!latest) return { error: "Nenhuma tabela publicada ainda. Sem ela não há preço para vender." };
    // The prices on the screen were the ones of the version it showed.
    if (Number(read("version")) !== latest.version) {
      return { error: `A tabela mudou para a v${latest.version}. Recarregue a página, confira os preços e adicione de novo.` };
    }
    number = await createOrder(
      { seller: { email: session.email, name: session.name }, version: latest.version, productId: Number(read("productId")), quantity },
      () => orderNumber(isoDate(new Date()), randomInt),
      conn,
    );
  } catch (error) {
    return { error: problem("criar o pedido", error) };
  }

  revalidatePath(ORDERS);
  redirect(`${ORDERS}/${number}`);
}

export async function addItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);

  const read = reader(formData);
  const number = read("number") ?? "";
  const quantity = parseQuantity(read("quantity"));
  if (quantity === null) return { error: QUANTITY };
  try {
    await addOrderItem(number, Number(read("productId")), quantity, session.email, scopeOf(session), conn);
  } catch (error) {
    return { error: problem("adicionar o equipamento", error) };
  }
  revalidatePath(`${ORDERS}/${number}`);
  return OK;
}

export async function setItemQuantityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);

  const read = reader(formData);
  const number = read("number") ?? "";
  const quantity = parseQuantity(read("quantity"));
  if (quantity === null) return { error: QUANTITY };
  try {
    await setOrderItemQuantity(number, Number(read("productId")), quantity, session.email, scopeOf(session), conn);
  } catch (error) {
    return { error: problem("alterar a quantidade", error) };
  }
  revalidatePath(`${ORDERS}/${number}`);
  return OK;
}

export async function removeItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);

  const read = reader(formData);
  const number = read("number") ?? "";
  try {
    await removeOrderItem(number, Number(read("productId")), session.email, scopeOf(session), conn);
  } catch (error) {
    return { error: problem("remover o equipamento", error) };
  }
  revalidatePath(`${ORDERS}/${number}`);
  return OK;
}

/** "Entrega e condições" and the discount. Nothing is calculated in the browser: the page comes back redone. */
export async function saveTermsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);

  const read = reader(formData);
  const number = read("number") ?? "";
  const parsed = parseOrderTerms(read);
  if (!parsed.ok) return { error: parsed.errors.join(" ") };
  try {
    await saveOrderTerms(number, parsed.terms, session.email, scopeOf(session), conn);
  } catch (error) {
    return { error: problem("gravar as condições", error) };
  }
  revalidatePath(`${ORDERS}/${number}`);
  return OK;
}

/** "Forma de pagamento". The forms accepted are the ones of the company, read here. */
export async function savePaymentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);

  const read = reader(formData);
  const number = read("number") ?? "";
  try {
    const parsed = parseOrderPayment(read, await listPaymentMethods(conn));
    if (!parsed.ok) return { error: parsed.errors.join(" ") };
    await savePayment(number, parsed.payment, session.email, scopeOf(session), conn);
  } catch (error) {
    return { error: problem("gravar o pagamento", error) };
  }
  revalidatePath(`${ORDERS}/${number}`);
  return OK;
}

/**
 * "Fechar pedido". The server decides everything: what is missing, and whether
 * the order closes or waits for approval. The page comes back with the new status.
 */
export async function closeOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);

  const number = reader(formData)("number") ?? "";
  try {
    // Whether the closer is a director comes from the session: the company decides what that is worth.
    const result = await closeOrder(number, session.email, scopeOf(session), conn, { isDirector: approvesAtLoss(session.role) });
    if (result.missing.length > 0) return { error: `Para fechar: ${result.missing.join(" ")}` };
  } catch (error) {
    return { error: problem("fechar o pedido", error) };
  }
  revalidatePath(ORDERS);
  revalidatePath(`${ORDERS}/${number}`);
  return OK;
}

export async function reopenOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);

  const number = reader(formData)("number") ?? "";
  try {
    await reopenOrder(number, session.email, scopeOf(session), conn);
  } catch (error) {
    return { error: problem("reabrir o pedido", error) };
  }
  revalidatePath(ORDERS);
  revalidatePath(`${ORDERS}/${number}`);
  return OK;
}

/** "Excluir pedido": only in negotiation and never closed before. Leaves a line in the log. */
export async function deleteOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);

  const number = reader(formData)("number") ?? "";
  try {
    const { sellerEmail } = await deleteOrder(number, scopeOf(session), conn);
    console.info(`[pedidos] ${session.email} excluiu o pedido ${number} (de ${sellerEmail}) em ${session.tenant.slug}`);
  } catch (error) {
    return { error: problem("excluir o pedido", error) };
  }
  revalidatePath(ORDERS);
  redirect(ORDERS);
}

/**
 * "Salvar cliente" inside the order: writes the record (creates it, or changes
 * the one that already has this document) and links it to the order. The order
 * is checked first: nothing is written for an order that cannot be changed.
 */
export async function saveOrderCustomerAction(_previous: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);

  const text = reader(formData);
  const number = text("number") ?? "";
  const id = text("id") ?? "";
  const scope = scopeOf(session);

  let kind = text("kind") === "PF" ? ("PF" as const) : ("PJ" as const);
  const refuse = (errors: string[], invalid: CustomerFieldKey[] = []): CustomerFormState => ({
    status: "error",
    errors,
    invalid,
    values: rawCustomerValues(kind, text),
  });

  try {
    const order = await getOrder(number, scope, conn);
    if (!order || order.status !== "em_negociacao") {
      return refuse(["Pedido não encontrado ou já fechado. Reabra o pedido para alterar."]);
    }

    const known = id === "" ? null : await getCustomer(Number(id), conn);
    if (id !== "" && !known) return refuse(["Cliente não encontrado."]);
    if (known) kind = known.kind;

    const parsed = parseCustomerForm(kind, (key) => (known && key === "document" ? known.document : text(key)));
    if (!parsed.ok) return refuse(parsed.errors, parsed.invalid);

    const existing = known ?? (await findCustomerByDocument(parsed.input.document, conn));
    const customer = existing
      ? await updateCustomer(existing.id, parsed.input, session.email, conn)
      : await createCustomer(parsed.input, session.email, conn);
    await linkOrderCustomer(number, customer.id, session.email, scope, conn);
  } catch (error) {
    return refuse([problem("gravar o cliente", error)]);
  }

  revalidatePath(menuItem("clientes").href);
  revalidatePath(`${ORDERS}/${number}`);
  // Back to the order without the search in the address: the block shows the linked customer.
  redirect(`${ORDERS}/${number}`);
}

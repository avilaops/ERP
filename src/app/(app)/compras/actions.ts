"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import {
  addPurchaseCost, createPurchase, deletePurchase, movePurchase, PurchaseError, receivePurchase, removePurchaseCost, removePurchaseItem, savePurchaseItem,
  unreceivePurchase, updatePurchase,
} from "@/lib/db/purchases";
import type { Currency, PurchaseInput, PurchaseKind } from "@/lib/db/purchases";
import { parseMoney } from "@/lib/format";
import type { ActionState } from "@/lib/order-form";

const HERE = menuItem("compras").href;

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
};
const idOf = (formData: FormData, name: string) => (/^[1-9]\d{0,8}$/.test(field(formData, name)) ? Number(field(formData, name)) : Number.NaN);
/** `5,42` or `5.42`: a rate has no thousands to confuse with. */
const rateOf = (typed: string) => (/^\d{1,4}([.,]\d{1,6})?$/.test(typed) ? Number(typed.replace(",", ".")) : Number.NaN);

function problem(error: unknown): ActionState {
  if (error instanceof PurchaseError) return { error: error.message };
  console.error("[compras] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
}

const read = (formData: FormData): PurchaseInput => {
  const currency = field(formData, "currency") as Currency;
  return {
    supplierId: idOf(formData, "supplierId"),
    kind: field(formData, "kind") as PurchaseKind,
    reference: field(formData, "reference") || null,
    orderedOn: field(formData, "orderedOn"),
    expectedOn: field(formData, "expectedOn") || null,
    currency,
    exchangeRate: currency === "BRL" ? 1 : rateOf(field(formData, "exchangeRate")),
    invoiceNumber: field(formData, "invoiceNumber") || null,
    invoiceKey: field(formData, "invoiceKey") || null,
    notes: field(formData, "notes") || null,
  };
};

const done = (id: number, notice: string): ActionState => {
  revalidatePath(HERE);
  revalidatePath(`${HERE}/${id}`);
  revalidatePath(menuItem("estoque").href);
  return { error: null, notice };
};

export async function createPurchaseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("compras");
  let id: number;
  try {
    ({ id } = await createPurchase(read(formData), session.email, tenantDb(session.tenant.slug)));
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  redirect(`${HERE}/${id}`);
}

export async function updatePurchaseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("compras");
  const id = idOf(formData, "id");
  try {
    await updatePurchase(id, read(formData), session.email, tenantDb(session.tenant.slug));
  } catch (error) {
    return problem(error);
  }
  return done(id, "Compra gravada.");
}

/** "Adicionar" or "Salvar" of one item, and "Remover" (the confirmation, a submit with no name). */
export async function purchaseItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("compras");
  const conn = tenantDb(session.tenant.slug);
  const [id, productId] = [idOf(formData, "id"), idOf(formData, "productId")];
  const saving = field(formData, "what") === "salvar";
  try {
    if (saving) {
      const [quantity, unitPrice] = [field(formData, "quantity"), parseMoney(field(formData, "unitPrice"))];
      await savePurchaseItem(id, { productId, quantity: /^\d{1,6}$/.test(quantity) ? Number(quantity) : Number.NaN, unitPrice: unitPrice ?? Number.NaN }, session.email, conn);
    } else {
      await removePurchaseItem(id, productId, session.email, conn);
    }
  } catch (error) {
    return problem(error);
  }
  return done(id, saving ? "Item gravado." : "Item removido.");
}

/** "Adicionar custo", and "Remover" (the confirmation, a submit with no name). */
export async function purchaseCostAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("compras");
  const conn = tenantDb(session.tenant.slug);
  const id = idOf(formData, "id");
  const adding = field(formData, "what") === "adicionar";
  try {
    if (adding) await addPurchaseCost(id, field(formData, "label"), parseMoney(field(formData, "amount")) ?? Number.NaN, session.email, conn);
    else await removePurchaseCost(id, idOf(formData, "costId"), conn);
  } catch (error) {
    return problem(error);
  }
  return done(id, adding ? "Custo lançado." : "Custo removido.");
}

/** The way of a purchase: em trânsito, de volta a pedido, recebida, recebimento desfeito, cancelada. */
export async function purchaseStatusAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("compras");
  const conn = tenantDb(session.tenant.slug);
  const id = idOf(formData, "id");
  const what = field(formData, "what");
  try {
    if (what === "receber") {
      const { items } = await receivePurchase(id, field(formData, "receivedOn"), session.email, conn);
      return done(id, `Compra recebida: ${items} ${items === 1 ? "equipamento entrou" : "equipamentos entraram"} no estoque.`);
    }
    if (what === "desfazer") {
      await unreceivePurchase(id, session.email, conn);
      return done(id, "Recebimento desfeito: as peças saíram do estoque e a compra voltou a em trânsito.");
    }
    if (what !== "pedido" && what !== "em_transito" && what !== "cancelada") return { error: "Escolha o que fazer com a compra." };
    await movePurchase(id, what, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  return done(id, what === "cancelada" ? "Compra cancelada." : what === "em_transito" ? "Compra em trânsito." : "Compra de volta a pedido feito.");
}

/** "Remover compra": the confirmation, a submit with no name. */
export async function deletePurchaseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("compras");
  try {
    await deletePurchase(idOf(formData, "id"), tenantDb(session.tenant.slug));
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  redirect(HERE);
}

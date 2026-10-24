"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { getOrder, listPaymentMethods, OrderError, savePayment } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { parseOrderPayment } from "@/lib/order-form";
import type { ActionState, PaymentField } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";

export async function savePaymentAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);
  const read = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
  const number = read("number");
  if (!ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };
  const scope = { sellerEmail: seesAllOrders(session) ? null : session.email };
  const order = await getOrder(number, scope, conn);
  if (!order || order.status !== "em_negociacao") return { error: "Reabra o pedido antes de alterar o pagamento." };
  if (!read("revision")) return { error: "Recarregue o pagamento do pedido." };
  const methods = await listPaymentMethods(conn);
  const values = Object.fromEntries([
    "downPayment", "downPaymentMethod", "downPaymentDate", "balanceMethod",
    "installmentCount", "firstInstallmentDays", "installmentIntervalDays", "paymentNotes",
  ].map((key) => [key, read(key)])) as Record<PaymentField, string>;
  for (const key of ["downPaymentMethod", "balanceMethod"] as const) {
    if (values[key] && !methods.includes(values[key]) && values[key] !== order[key]) return { error: "Escolha um meio de pagamento ativo na lista." };
  }
  // A retired method may remain selected on an existing order, but cannot be newly chosen.
  const accepted = [...methods, ...([order.downPaymentMethod, order.balanceMethod].filter((value): value is string => Boolean(value)))];
  const due = read("balanceDue");
  if (due !== "entrega" && due !== "parcelas") return { error: "Escolha quando pagar o saldo." };
  const parsed = parseOrderPayment((key) => values[key], accepted);
  if (!parsed.ok) return { error: parsed.errors.join(" ") };
  try {
    await savePayment(number, { ...parsed.payment, balanceOnDelivery: due === "entrega" }, session.email, scope, conn, read("revision"));
  } catch (error) {
    if (error instanceof OrderError) return { error: error.message };
    console.error("[pagamento] falha ao salvar:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível salvar o pagamento. Tente novamente." };
  }
  revalidatePath(`/pedidos/${number}`);
  revalidatePath(`/pedidos/${number}/pagamento`);
  redirect(`/pedidos/${number}?ver=pagamento`);
}

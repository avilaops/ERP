"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { getOrder, listPaymentMethods, OrderError, savePayment } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { formatMoney } from "@/lib/format";
import { parseOrderPayment } from "@/lib/order-form";
import type { ActionState, PaymentField } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";

export async function savePaymentStepAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);
  const read = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
  const number = read("number");
  if (!ORDER_NUMBER.test(number)) return { error: "Pedido não encontrado." };
  const scope = { sellerEmail: seesAllOrders(session) ? null : session.email };
  const order = await getOrder(number, scope, conn);
  if (!order || order.status !== "em_negociacao") return { error: "Reabra o pedido antes de alterar o pagamento." };
  const groups: PaymentField[][] = [["downPayment", "downPaymentMethod", "downPaymentDate"], ["balanceMethod", "paymentNotes"], ["installmentCount", "firstInstallmentDays", "installmentIntervalDays"]];
  const step = Number(read("step"));
  if (!Number.isInteger(step) || !groups[step] || !read("revision")) return { error: "Recarregue o pagamento do pedido." };
  const values: Record<PaymentField, string | null> = { downPayment: formatMoney(order.downPayment), downPaymentMethod: order.downPaymentMethod,
    downPaymentDate: order.downPaymentDate, balanceMethod: order.balanceMethod,
    installmentCount: String(order.installmentCount ?? ""), firstInstallmentDays: String(order.firstInstallmentDays ?? ""),
    installmentIntervalDays: String(order.installmentIntervalDays ?? ""), paymentNotes: order.paymentNotes };
  const methods = await listPaymentMethods(conn);
  // A retired method may remain in an unchanged step, but cannot be newly selected.
  const accepted = [...methods, ...([order.downPaymentMethod, values.balanceMethod].filter((value): value is string => Boolean(value)))];
  for (const key of groups[step]) {
    const value = read(key);
    if ((key === "downPaymentMethod" || key === "balanceMethod") && value && !methods.includes(value) && value !== values[key]) return { error: "Escolha um meio de pagamento ativo na lista." };
    values[key] = value;
  }
  const due = step === 1 ? read("balanceDue") : order.balanceOnDelivery ? "entrega" : "parcelas";
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
  const next = read("intent") === "back" ? Math.max(0, step - 1) : step + 1;
  redirect(next > 2 || (step === 1 && due === "entrega" && read("intent") !== "back") ? `/pedidos/${number}?ver=pagamento` : `/pedidos/${number}/pagamento?etapa=${next}`);
}

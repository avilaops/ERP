"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { getOrder } from "@/lib/db/orders";
import { tenantDb } from "@/lib/db/pool";
import { saveProposalDetails } from "@/lib/db/proposal-details";
import type { ActionState } from "@/lib/order-form";
import { ORDER_NUMBER } from "@/lib/order-number";
import { ORDER_PROPOSAL_STEPS, ProposalSettingsError } from "@/lib/quote/settings";
import type { ProposalDetails } from "@/lib/quote/settings";

export async function saveOrderProposalAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const session = await requirePermission("pedidos");
  const read = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
  const number = read("number");
  const step = Number(read("step"));
  const group = ORDER_PROPOSAL_STEPS[step];
  if (!ORDER_NUMBER.test(number) || !Number.isInteger(step) || !group) return { error: "Recarregue a tela." };
  const conn = tenantDb(session.tenant.slug);
  const order = await getOrder(number, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  if (!order) return { error: "Pedido não encontrado." };
  const values: ProposalDetails = Object.fromEntries(group.fields.map((key) => [key, read(key)]));
  try { await saveProposalDetails({ values, fields: group.fields, revision: read("revision"), actor: session.email, orderId: order.id }, conn); }
  catch (error) { if (error instanceof ProposalSettingsError) return { error: error.message }; throw error; }
  revalidatePath(`/pedidos/${number}`);
  revalidatePath(`/pedidos/${number}/proposta`);
  const next = read("intent") === "back" ? Math.max(0, step - 1) : step + 1;
  redirect(next >= ORDER_PROPOSAL_STEPS.length ? `/pedidos/${number}?ver=entrega` : `/pedidos/${number}/proposta?etapa=${next}`);
}

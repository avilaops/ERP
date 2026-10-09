"use server";

import { redirect } from "next/navigation";
import { unsubscribeByToken } from "@/lib/db/optout";
import { openUnsubscribe } from "@/lib/marketing/public";
import type { ActionState } from "@/lib/order-form";

/** The one action of the way out: takes the address of the link off the automatic e-mails of that company. */
export async function unsubscribeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const company = formData.get("empresa");
  const token = formData.get("token");
  const open = await openUnsubscribe(typeof company === "string" ? company : "", typeof token === "string" ? token : "");
  if (!open) return { error: "Este endereço não vale mais." };
  await unsubscribeByToken(open.token, open.conn);
  redirect(`/descadastro/${open.tenant.slug}/${open.token}?feito=1`);
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { notify } from "@/lib/api/notify";
import { clientIp } from "@/lib/contract/public";
import { CaptureError, submitCapture } from "@/lib/db/capture";
import { openCapture } from "@/lib/marketing/public";
import type { ActionState } from "@/lib/order-form";

/**
 * The one action of a capture form. Who calls it has no account: the address
 * names a form that is on, and all it does is add one opportunity to the
 * funnel of that company. Nothing is read back.
 */
const GONE = "Este formulário não está mais disponível.";

const field = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

export async function submitCaptureAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const open = await openCapture(field(formData, "empresa"), field(formData, "token"));
  if (!open) return { error: GONE };
  const done = `/captura/${open.tenant.slug}/${open.form.token}?enviado=1`;
  // A field no person sees: who fills it is a robot, and gets the same thanks with nothing recorded.
  if (field(formData, "site").trim() !== "") redirect(done);
  try {
    const id = await submitCapture(
      open.form,
      { name: field(formData, "nome"), company: field(formData, "empresa_nome"), email: field(formData, "email"), phone: field(formData, "telefone"), message: field(formData, "mensagem"), agreed: field(formData, "aceite") === "sim" },
      open.tenant.name,
      clientIp(await headers()),
      new Date(),
      open.conn,
    );
    if (id !== null) await notify("oportunidade.criada", { id, titulo: `Contato pelo formulário: ${open.form.name}`, empresa: field(formData, "empresa_nome").trim() || null, origem: `Formulário: ${open.form.name}`, responsavel: open.form.ownerName }, open.conn);
  } catch (error) {
    if (error instanceof CaptureError) return { error: error.message };
    console.error("[captura] falha ao registrar:", error instanceof Error ? error.message : error);
    return { error: "Não foi possível enviar agora. Tente de novo em instantes." };
  }
  redirect(done);
}

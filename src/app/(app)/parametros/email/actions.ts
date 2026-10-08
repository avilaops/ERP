"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { defaultMailbox, mailboxProblems, mailChannel, MailSettingsError, removeOwnMailbox, saveMailTexts, saveOwnMailbox } from "@/lib/db/mail";
import { tenantDb } from "@/lib/db/pool";
import { vaultKey } from "@/lib/fiscal/certificate";
import { buildMessage, MailError } from "@/lib/mail/message";
import { sendMail } from "@/lib/mail/smtp";
import type { ActionState } from "@/lib/order-form";

const HERE = "/parametros/email";
const FAILED = "Não foi possível gravar agora. Nada foi alterado; tente de novo.";
const NO_VAULT = "O cofre não está configurado neste servidor. Avise o suporte: falta a chave ERP_CERT_KEY.";

const reader = (formData: FormData) => (key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

function problem(error: unknown): ActionState {
  if (error instanceof MailSettingsError || error instanceof MailError) return { error: error.message };
  console.error("[e-mail] falha ao gravar:", error instanceof Error ? error.message : error);
  return { error: FAILED };
}

/** "Salvar mensagem": the text of the e-mail of the invoice, where the answer goes and whether it leaves by itself. */
export async function saveMailTextsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const text = reader(formData);
  try {
    await saveMailTexts({ subject: text("subject"), body: text("body"), replyTo: text("replyTo"), autoSend: text("autoSend") === "sim" }, session.email, conn);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  return { error: null, notice: "Mensagem gravada." };
}

/**
 * "Salvar caixa da empresa". Before anything is stored a test message goes to
 * who is saving, by the mailbox typed: a mailbox that does not send is not kept.
 * The password is sealed and never comes back to the screen or goes to a log.
 */
export async function saveOwnMailboxAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const text = reader(formData);
  let key: Buffer;
  try {
    key = vaultKey(process.env.ERP_CERT_KEY);
  } catch {
    return { error: NO_VAULT };
  }
  const input = { host: text("host").trim(), port: /^\d{1,5}$/.test(text("port").trim()) ? Number(text("port").trim()) : 0, username: text("username").trim(), password: text("password"), from: text("from").trim().toLowerCase() };
  const problems = mailboxProblems(input);
  if (problems.length > 0) return { error: problems.join(" ") };
  try {
    const message = buildMessage(
      { from: input.from, fromName: session.tenant.name, to: session.email, replyTo: null, subject: "Teste da caixa de e-mail do ERP", text: `Esta mensagem confirma que o ERP consegue enviar pela caixa ${input.from}.\n\nPedido por ${session.email}.`, attachments: [] },
      new Date(),
    );
    await sendMail({ host: input.host, port: input.port, username: input.username, password: input.password }, { from: input.from, to: session.email }, message);
    await saveOwnMailbox(input, key, session.email, conn);
    console.info(`[e-mail] ${session.email} cadastrou a caixa da empresa de ${session.tenant.slug}`);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  return { error: null, notice: `Caixa gravada. Uma mensagem de teste foi enviada para ${session.email}.` };
}

/** "Remover caixa da empresa": the messages leave by the mailbox of Ávila Ops again. */
export async function removeOwnMailboxAction(): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    await removeOwnMailbox(session.email, conn);
    console.info(`[e-mail] ${session.email} removeu a caixa da empresa de ${session.tenant.slug}`);
  } catch (error) {
    return problem(error);
  }
  revalidatePath(HERE);
  return { error: null, notice: "Caixa da empresa removida." };
}

/** "Enviar mensagem de teste" by the mailbox in use now, to who asked. */
export async function testMailAction(): Promise<ActionState> {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  try {
    const channel = (await mailChannel(conn, process.env, () => vaultKey(process.env.ERP_CERT_KEY))) ?? defaultMailbox(process.env);
    if (!channel) return { error: "Não há caixa de saída: cadastre a caixa da empresa abaixo, ou peça à Ávila Ops para ligar a caixa padrão." };
    const message = buildMessage(
      { from: channel.from, fromName: session.tenant.name, to: session.email, replyTo: null, subject: "Teste de envio do ERP", text: `Esta mensagem confirma que o ERP consegue enviar e-mail por ${channel.from}.\n\nPedido por ${session.email}.`, attachments: [] },
      new Date(),
    );
    await sendMail(channel.smtp, { from: channel.from, to: session.email }, message);
    return { error: null, notice: `Mensagem de teste enviada para ${session.email}, pela caixa ${channel.from}.` };
  } catch (error) {
    return problem(error);
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { clientIp, openSigning } from "@/lib/contract/public";
import type { Signing } from "@/lib/contract/public";
import { ContractError, refuseContract } from "@/lib/db/contracts";
import { requestSigningCode, signOrderContract } from "@/lib/db/send-contract";
import { vaultKey } from "@/lib/fiscal/certificate";
import { sendMail } from "@/lib/mail/smtp";
import type { ActionState } from "@/lib/order-form";

/**
 * The actions of the signing page. Who calls them has no account: what they
 * may do is decided by the secret of the link alone, checked again on every
 * call, and it reaches one contract. Nothing here reads a session, and nothing
 * of the company other than that contract is touched.
 */
const GONE = "Este endereço não vale mais. Peça à empresa um novo link.";
const FAILED = "Não foi possível concluir agora. Tente de novo em instantes.";

const way = { env: process.env, key: () => vaultKey(process.env.ERP_CERT_KEY), send: sendMail };

const field = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

async function signingOf(formData: FormData): Promise<Signing | null> {
  return openSigning(field(formData, "empresa"), field(formData, "token"));
}

function refusal(error: unknown): ActionState {
  if (error instanceof ContractError) return { error: error.message };
  console.error("[contrato] falha na página de assinatura:", error instanceof Error ? error.message : error);
  return { error: FAILED };
}

const pageOf = (signing: Signing) => `/contrato/${signing.tenant.slug}/${signing.token}`;

/** "Receber o código por e-mail": name, CPF and agreement of who signs; the code goes to the e-mail the contract was sent to. */
export async function requestCodeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const signing = await signingOf(formData);
  if (!signing) return { error: GONE };
  try {
    await requestSigningCode(
      signing.contract, signing.token,
      { name: field(formData, "name"), document: field(formData, "document"), accepted: field(formData, "accepted") === "sim" },
      { company: signing.tenant.name, now: new Date(), ip: clientIp(await headers()), way },
      signing.conn,
    );
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(pageOf(signing));
  return { error: null, notice: "Código enviado. Confira a sua caixa de entrada (e o spam)." };
}

/** "Assinar contrato": the code that went to the e-mail. */
export async function signAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const signing = await signingOf(formData);
  if (!signing) return { error: GONE };
  const requestHeaders = await headers();
  try {
    await signOrderContract(
      signing.contract, signing.token, field(formData, "code").replace(/\D/g, ""),
      { company: signing.tenant.name, now: new Date(), ip: clientIp(requestHeaders), agent: requestHeaders.get("user-agent"), way },
      signing.conn,
    );
  } catch (error) {
    revalidatePath(pageOf(signing));
    return refusal(error);
  }
  revalidatePath(pageOf(signing));
  return { error: null, notice: "Contrato assinado." };
}

/** "Recusar contrato", with the reason the customer wants to give. */
export async function refuseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const signing = await signingOf(formData);
  if (!signing) return { error: GONE };
  try {
    await refuseContract(signing.contract.id, field(formData, "reason"), clientIp(await headers()), signing.conn);
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(pageOf(signing));
  return { error: null, notice: "Recusa registrada." };
}

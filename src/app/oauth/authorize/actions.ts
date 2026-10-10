"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { grantCode, mcpEnabled } from "@/lib/db/mcp";
import { tenantDb } from "@/lib/db/pool";
import { clientOf } from "@/lib/mcp/oauth";
import type { ActionState } from "@/lib/order-form";

/**
 * "Permitir" and "Não permitir" on the consent screen. Who decides is the
 * person signed in, for their own access; everything the application sent is
 * checked again here, and the person is only sent back to an address the
 * application registered.
 */
export async function decideAuthorizationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession("/oauth/authorize");
  const conn = tenantDb(session.tenant.slug);
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const client = clientOf(field("client_id"), process.env.SSO_JWT_SECRET);
  const redirectUri = field("redirect_uri");
  if (!client || !client.redirectUris.includes(redirectUri)) return { error: "Este pedido de acesso não é válido. Comece de novo pelo aplicativo." };
  const back = new URL(redirectUri);
  if (field("state") !== "") back.searchParams.set("state", field("state").slice(0, 500));
  if (field("what") !== "permitir") {
    back.searchParams.set("error", "access_denied");
    redirect(back.toString());
  }
  if (!(await mcpEnabled(conn))) return { error: "A conexão com assistentes está desligada para esta empresa. Quem liga é a diretoria, em Parâmetros → Assistente." };
  const challenge = field("code_challenge");
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge)) return { error: "Este pedido de acesso não é válido. Comece de novo pelo aplicativo." };
  const code = await grantCode({ tenant: session.tenant.slug, email: session.email, client, redirectUri, codeChallenge: challenge, now: new Date() }, conn);
  console.info(`[mcp] ${session.email} autorizou um aplicativo em ${session.tenant.slug}`);
  back.searchParams.set("code", code);
  redirect(back.toString());
}

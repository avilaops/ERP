import { apiAccess, apiError, apiJson } from "@/lib/api/access";
import { notify } from "@/lib/api/notify";
import { findCustomerByDocument } from "@/lib/db/customers";
import { normalizeDocument } from "@/lib/customer";
import { createOpportunity, FunnelError, listOpportunities, opportunityParty } from "@/lib/db/funnel";
import type { Opportunity } from "@/lib/db/funnel";

/**
 * The opportunities of the funnel, for other systems of the company. Reading
 * lists all of them; writing (a key that may write) creates one in the first
 * stage, in the name of the person the key was made for. Never a cost.
 */
export const dynamic = "force-dynamic";

const shown = (item: Opportunity) => ({
  id: item.id, titulo: item.title, empresa: opportunityParty(item), cliente_do_cadastro: item.customerId !== null, contato: item.contactName, telefone: item.phone, email: item.email, origem: item.source,
  valor_estimado: item.estimatedValue, etapa: item.stageName, situacao: item.stageKind, responsavel: item.ownerName, pedido: item.orderNumber, motivo_da_perda: item.lostReason,
  criada_em: item.createdAt.toISOString(), atualizada_em: item.updatedAt.toISOString(),
});

export async function GET(request: Request): Promise<Response> {
  const access = await apiAccess(request);
  if (access instanceof Response) return access;
  const situation = new URL(request.url).searchParams.get("situacao");
  const all = await listOpportunities({ ownerEmail: null }, access.conn);
  const rows = situation ? all.filter((item) => item.stageKind === situation) : all;
  return apiJson({ total: rows.length, oportunidades: rows.slice(0, 500).map(shown) });
}

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, max) : null);

export async function POST(request: Request): Promise<Response> {
  const access = await apiAccess(request);
  if (access instanceof Response) return access;
  if (!access.key.canWrite) return apiError(403, "Esta chave só lê. Crie uma chave que grava em Parâmetros → Integrações.");
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return apiError(400, "Envie um objeto JSON com ao menos titulo e empresa.");
  const value = body.valor_estimado;
  if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) return apiError(400, "valor_estimado: um número, como 25000.5.");
  // A customer of the register is found by its CNPJ or CPF, when one is sent.
  const document = typeof body.cliente_documento === "string" ? normalizeDocument(body.cliente_documento) : "";
  const customer = document ? await findCustomerByDocument(document, access.conn) : null;
  let id: number;
  try {
    id = await createOpportunity(
      {
        title: text(body.titulo, 120) ?? "", customerId: customer?.id ?? null, company: text(body.empresa, 120), contactName: text(body.contato, 120), phone: text(body.telefone, 40), email: text(body.email, 254),
        source: text(body.origem, 80) ?? `API: ${access.key.name}`, estimatedValue: typeof value === "number" ? value : null, notes: text(body.observacoes, 4000),
      },
      { email: access.key.ownerEmail, name: access.key.ownerName },
      access.conn,
    );
  } catch (error) {
    if (error instanceof FunnelError) return apiError(422, error.message);
    throw error;
  }
  await notify("oportunidade.criada", { id, titulo: text(body.titulo, 120), empresa: customer?.name ?? text(body.empresa, 120), origem: text(body.origem, 80) ?? `API: ${access.key.name}`, responsavel: access.key.ownerName }, access.conn);
  return apiJson({ id }, 201);
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, INPUT, LABEL, PageHeader, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { getOpportunity, opportunityParty } from "@/lib/db/funnel";
import { tenantDb } from "@/lib/db/pool";
import { listConversation, listWhatsappTemplates, loadWhatsappInfo, whatsappNumber, windowOpen } from "@/lib/db/whatsapp";
import { showDateTime } from "@/lib/format";
import { ActionForm } from "../../../pedidos/ActionForm";
import { sendWhatsappAction } from "../../actions";

export const metadata = { title: "WhatsApp · ERP" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { enviada: "enviada", entregue: "entregue", lida: "lida", falhou: "não saiu" };

export default async function WhatsappPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission("funil", `/funil/${id}/whatsapp`);
  const conn = tenantDb(session.tenant.slug);
  if (!/^[1-9]\d{0,8}$/.test(id)) notFound();
  const item = await getOpportunity(Number(id), { ownerEmail: seesAllOrders(session) ? null : session.email }, conn);
  // An opportunity of another seller answers as one that does not exist.
  if (!item) notFound();
  const account = await loadWhatsappInfo(conn);
  const contact = whatsappNumber(item.phone);
  const messages = contact ? await listConversation(contact, conn) : [];
  const open = contact ? await windowOpen(contact, new Date(), conn) : false;
  const templates = await listWhatsappTemplates(conn);

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm">
        <Link href={`/funil/${item.id}`} className={QUIET_LINK}>
          ← {item.title}
        </Link>
      </p>
      <PageHeader title="WhatsApp" hint={`${item.contactName ?? opportunityParty(item)}${item.phone ? ` · ${item.phone}` : ""}`} />
      {!account && <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">A conta de WhatsApp da empresa ainda não foi cadastrada (Parâmetros → WhatsApp).</p>}
      {!contact && <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">Esta oportunidade não tem um celular com DDD. Preencha em Dados.</p>}

      {messages.length > 0 && (
        <ol className="mt-3 flex flex-col gap-2" aria-label="Conversa">
          {messages.slice(-30).map((message) => (
            <li key={message.id} className={`max-w-[85%] rounded-lg border px-3 py-2 text-sm ${message.direction === "saida" ? "self-end border-emerald-300 bg-emerald-50" : "self-start border-slate-200 bg-white"}`}>
              <p className="whitespace-pre-line break-words">{message.body}</p>
              <p className="mt-1 text-xs text-slate-500">
                {showDateTime(message.at)}
                {message.direction === "saida" ? ` · ${STATUS[message.status] ?? message.status}${message.sentBy ? ` · ${message.sentBy}` : ""}` : ""}
                {message.detail ? ` · ${message.detail}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}

      {account && contact && (
        <ActionForm action={sendWhatsappAction} className={`${CARD} mt-3 flex flex-col gap-2 p-3`}>
          <input type="hidden" name="id" value={item.id} />
          {open ? (
            <div>
              <label htmlFor="text" className={LABEL}>
                Mensagem
              </label>
              <textarea id="text" name="text" rows={3} maxLength={4000} className={`${INPUT} py-2`} />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-slate-700">
              O cliente não escreveu nas últimas 24 horas: o WhatsApp só aceita um modelo aprovado, e nenhum foi cadastrado ainda (Parâmetros → WhatsApp).
            </p>
          ) : (
            <div>
              <label htmlFor="templateId" className={LABEL}>
                O cliente não escreveu nas últimas 24 horas: só vai um modelo aprovado
              </label>
              <select id="templateId" name="templateId" defaultValue="" className={INPUT}>
                <option value="" disabled>
                  Escolha o modelo
                </option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.preview.slice(0, 80)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(open || templates.length > 0) && (
            <button type="submit" className={`${PRIMARY} self-start`}>
              Enviar
            </button>
          )}
        </ActionForm>
      )}
      <p className="mt-3 text-sm">
        <Link href="/funil/conversas" className={SECONDARY}>
          Todas as conversas
        </Link>
      </p>
    </div>
  );
}

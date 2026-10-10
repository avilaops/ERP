import Link from "next/link";
import { CARD, INPUT, LABEL, PageHeader, PRIMARY, QUIET_LINK } from "@/components/ui";
import { aiConfigured } from "@/lib/ai/client";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { aiUsage, loadAiSettings } from "@/lib/db/assist";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../pedidos/ActionForm";
import { saveAssistantAction } from "./actions";

export const metadata = { title: "Assistente · ERP" };
export const dynamic = "force-dynamic";

export default async function AssistenteParametrosPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const settings = await loadAiSettings(conn);
  const usage = await aiUsage(new Date(), conn);
  const configured = aiConfigured();

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader title="Assistente" hint="Inteligência artificial que resume cada venda do funil, sugere o próximo passo e rascunha a resposta ao cliente." />
      {!configured && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          O serviço do assistente ainda não foi ligado neste servidor pela Ávila Ops. Você pode deixar a escolha gravada; ele passa a funcionar quando o serviço for ligado.
        </p>
      )}
      <ActionForm action={saveAssistantAction} className={`${CARD} mt-3 p-3`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="enabled" className={LABEL}>
              Usar o assistente
            </label>
            <select id="enabled" name="enabled" defaultValue={settings.enabled ? "sim" : "nao"} key={String(settings.enabled)} className={INPUT}>
              <option value="nao">Desligado</option>
              <option value="sim">Ligado</option>
            </select>
          </div>
          <div>
            <label htmlFor="monthlyLimit" className={LABEL}>
              Pedidos ao assistente por mês
            </label>
            <input id="monthlyLimit" name="monthlyLimit" type="text" inputMode="numeric" defaultValue={settings.monthlyLimit} key={settings.monthlyLimit} autoComplete="off" className={`${INPUT} text-right`} />
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          Neste mês: {usage.requests} de {settings.monthlyLimit} pedidos. Cada pedido tem custo; ao chegar no limite, o assistente para até o mês virar.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Ao ligar, o texto de cada venda em que alguém pede ajuda (anotações, tarefas, e-mails trocados com o cliente, nome do contato) é enviado ao serviço de inteligência artificial para ser lido.</li>
          <li>Custo, margem, tabela de preços e alçada de desconto nunca são enviados.</li>
          <li>O assistente só lê e sugere: não envia e-mail, não muda etapa e não fecha pedido. Tudo o que ele escreve fica registrado.</li>
        </ul>
        <button type="submit" className={`${PRIMARY} mt-3`}>
          Salvar
        </button>
      </ActionForm>
    </div>
  );
}

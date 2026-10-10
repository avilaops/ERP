import Link from "next/link";
import { CARD, INPUT, LABEL, PageHeader, PRIMARY, QUIET_LINK } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { callsThisMonth, loadVoiceSettings } from "@/lib/db/voice";
import { voiceConfig } from "@/lib/voice/call";
import { ActionForm } from "../../pedidos/ActionForm";
import { saveVoiceAction } from "./actions";

export const metadata = { title: "Telefonia · ERP" };
export const dynamic = "force-dynamic";

export default async function TelefoniaPage() {
  const session = await requirePermission("parametros");
  const conn = tenantDb(session.tenant.slug);
  const settings = await loadVoiceSettings(conn);
  const used = await callsThisMonth(new Date(), conn);
  const configured = voiceConfig() !== null;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("parametros").href} className={QUIET_LINK}>
          ← {menuItem("parametros").label}
        </Link>
      </p>
      <PageHeader title="Telefonia" hint="Ligação pelo sistema: o telefone do vendedor toca e, ao atender, ele é conectado ao cliente. O cliente vê o número da empresa." />
      {!configured && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          O serviço de telefonia ainda não foi ligado neste servidor pela Ávila Ops. Você pode deixar a escolha gravada; a ligação passa a funcionar quando o serviço for ligado.
        </p>
      )}
      <ActionForm action={saveVoiceAction} className={`${CARD} mt-3 p-3`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="enabled" className={LABEL}>
              Ligar pelo sistema
            </label>
            <select id="enabled" name="enabled" defaultValue={settings.enabled ? "sim" : "nao"} key={String(settings.enabled)} className={INPUT}>
              <option value="nao">Desligado</option>
              <option value="sim">Ligado</option>
            </select>
          </div>
          <div>
            <label htmlFor="monthlyLimit" className={LABEL}>
              Ligações por mês
            </label>
            <input id="monthlyLimit" name="monthlyLimit" type="text" inputMode="numeric" defaultValue={settings.monthlyLimit} key={settings.monthlyLimit} autoComplete="off" className={`${INPUT} text-right`} />
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          Neste mês: {used} de {settings.monthlyLimit} ligações. Cada ligação é cobrada por minuto; ao chegar no limite, só o discador do aparelho funciona até o mês virar.
        </p>
        <p className="mt-2 text-sm text-slate-600">Nenhuma ligação é gravada. Cada uma fica anotada na oportunidade, com quem ligou e quando.</p>
        <button type="submit" className={`${PRIMARY} mt-3`}>
          Salvar
        </button>
      </ActionForm>
    </div>
  );
}

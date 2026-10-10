import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, INPUT, LABEL, PageHeader, PRIMARY, QUIET_LINK } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { getOpportunity, opportunityParty } from "@/lib/db/funnel";
import { getMeeting } from "@/lib/db/meetings";
import { tenantDb } from "@/lib/db/pool";
import { ActionForm } from "../../../pedidos/ActionForm";
import { saveMeetingAction } from "../../actions";

export const metadata = { title: "Reunião · ERP" };
export const dynamic = "force-dynamic";

const DURATIONS = [15, 30, 45, 60, 90, 120];

export default async function ReuniaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const session = await requirePermission("funil", `/funil/${id}/reuniao`);
  const conn = tenantDb(session.tenant.slug);
  if (!/^[1-9]\d{0,8}$/.test(id)) notFound();
  const item = await getOpportunity(Number(id), { ownerEmail: seesAllOrders(session) ? null : session.email }, conn);
  // An opportunity of another seller answers as one that does not exist.
  if (!item) notFound();
  const asked = (await searchParams).reuniao;
  const which = Array.isArray(asked) ? asked[0] : asked;
  const saved = which && /^[1-9]\d{0,8}$/.test(which) ? await getMeeting(Number(which), item.id, conn) : null;
  if (which && (!saved || saved.status !== "agendada")) notFound();
  const who = item.contactName ?? opportunityParty(item);

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm">
        <Link href={`/funil/${item.id}`} className={QUIET_LINK}>
          ← {item.title}
        </Link>
      </p>
      <PageHeader title={saved ? "Remarcar reunião" : "Agendar reunião"} hint={`com ${who}`} />
      <ActionForm action={saveMeetingAction} className={`${CARD} mt-3 grid grid-cols-2 gap-3 p-3`}>
        <input type="hidden" name="id" value={item.id} />
        {saved && <input type="hidden" name="meetingId" value={saved.id} />}
        <div className="col-span-2">
          <label htmlFor="title" className={LABEL}>
            Assunto
          </label>
          <input id="title" name="title" type="text" defaultValue={saved?.title ?? ""} placeholder="Ex.: Apresentação da proposta" maxLength={120} autoComplete="off" className={INPUT} />
        </div>
        <div>
          <label htmlFor="day" className={LABEL}>
            Dia
          </label>
          <input id="day" name="day" type="date" defaultValue={saved?.day ?? ""} className={INPUT} />
        </div>
        <div>
          <label htmlFor="time" className={LABEL}>
            Hora (de Brasília)
          </label>
          <input id="time" name="time" type="time" defaultValue={saved?.time ?? ""} className={INPUT} />
        </div>
        <div className="col-span-2">
          <label htmlFor="minutes" className={LABEL}>
            Duração
          </label>
          <select id="minutes" name="minutes" defaultValue={String(saved?.minutes ?? 30)} className={INPUT}>
            {[...new Set([...DURATIONS, saved?.minutes ?? 30])].sort((a, b) => a - b).map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes < 60 ? `${minutes} minutos` : `${minutes / 60} h`.replace(".", ",")}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label htmlFor="link" className={LABEL}>
            Endereço da videochamada (Meet, Zoom, Teams…)
          </label>
          <input id="link" name="link" type="url" inputMode="url" defaultValue={saved?.link ?? ""} placeholder="https://" autoComplete="off" className={INPUT} />
        </div>
        <div className="col-span-2">
          <label htmlFor="place" className={LABEL}>
            Ou o local, se for presencial
          </label>
          <input id="place" name="place" type="text" defaultValue={saved?.place ?? ""} maxLength={200} autoComplete="off" className={INPUT} />
        </div>
        {saved?.invited ? (
          <p className="col-span-2 text-sm text-slate-700">{saved.invited} já foi convidado e recebe a mudança por e-mail.</p>
        ) : (
          <label className="col-span-2 flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="invite" value="sim" defaultChecked={item.email !== null} className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{item.email ? `Enviar o convite para ${item.email}, com o arquivo que põe a reunião na agenda.` : "Enviar o convite por e-mail ao contato (preencha o e-mail em Dados)."}</span>
          </label>
        )}
        <button type="submit" className={`${PRIMARY} col-span-2`}>
          {saved ? "Salvar" : "Agendar"}
        </button>
      </ActionForm>
    </div>
  );
}

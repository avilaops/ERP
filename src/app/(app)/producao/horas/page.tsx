import Link from "next/link";
import { CARD, INPUT, LABEL, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem } from "@/lib/auth/permissions";
import { tenantDb } from "@/lib/db/pool";
import { hoursReport, listMachines, showMinutes } from "@/lib/db/work";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { machineAction } from "../actions";

export const metadata = { title: "Horas da produção · ERP" };
export const dynamic = "force-dynamic";

const HERE = "/producao/horas";
const PERIODS = [["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"]] as const;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function HorasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("producao", HERE);
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  const TABS = [["etapas", "Por etapa"], ["pessoas", "Por pessoa"], ["maquinas", "Por máquina"], ["cadastro", "Máquinas"]] as const;
  const tab = TABS.find(([key]) => key === first(query.ver))?.[0] ?? "etapas";
  const days = PERIODS.find(([key]) => key === first(query.dias))?.[0] ?? "30";
  const now = new Date();
  const report = await hoursReport(new Date(now.getTime() - Number(days) * 86_400_000), now, conn);
  const rows = tab === "etapas" ? report.byStage : tab === "pessoas" ? report.byWorker : report.byMachine;
  const most = Math.max(1, ...rows.map((row) => row.minutes));

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("producao").href} className={QUIET_LINK}>
          ← {menuItem("producao").label}
        </Link>
      </p>
      <PageHeader title="Horas da produção" hint={`${showMinutes(report.total)} apontados nos últimos ${days} dias · ${report.open} ${report.open === 1 ? "pessoa trabalhando" : "pessoas trabalhando"} agora`} />
      <nav aria-label="Período" className="mt-2 flex flex-wrap gap-2">
        {PERIODS.map(([key, label]) => (
          <Link key={key} href={`${HERE}?ver=${tab}&dias=${key}`} aria-current={key === days ? "page" : undefined} className={`inline-flex min-h-9 items-center rounded-full border px-4 text-sm font-medium ${key === days ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Partes das horas" className="mt-2 flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`${HERE}?ver=${key}&dias=${days}`}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "cadastro" ? (
        <Machines />
      ) : rows.length === 0 ? (
        <p className={`${CARD} mt-3 p-4 text-sm text-slate-700`}>Nenhuma hora apontada neste período. O apontamento é feito em cada ordem de produção, com Começar e Parar.</p>
      ) : (
        <ul className={`${CARD} mt-3 divide-y divide-slate-200`}>
          {rows.slice(0, 12).map((row) => (
            <li key={row.label} className="px-3 py-2">
              <p className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
                <span className="whitespace-nowrap text-sm tabular-nums text-slate-700">
                  {showMinutes(row.minutes)} · {row.periods} {row.periods === 1 ? "período" : "períodos"}
                </span>
              </p>
              <div className="mt-1 h-1.5 rounded bg-slate-200" aria-hidden="true">
                <div className="h-1.5 rounded bg-brand" style={{ width: `${Math.round((row.minutes / most) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  async function Machines() {
    const machines = await listMachines(conn);
    return (
      <>
        <ul className="mt-3 flex flex-col gap-2">
          {machines.map((machine) => (
            <li key={machine.id} className={CARD}>
              <ActionForm action={machineAction} className="flex flex-wrap items-end gap-2 p-3">
                <input type="hidden" name="id" value={machine.id} />
                <div className="min-w-40 flex-1">
                  <label htmlFor={`maquina-${machine.id}`} className={LABEL}>
                    Máquina ou posto {!machine.active && <Pill tone="neutral">fora de uso</Pill>}
                  </label>
                  <input id={`maquina-${machine.id}`} name="name" type="text" defaultValue={machine.name} key={machine.name} autoComplete="off" className={INPUT} />
                </div>
                <select name="active" defaultValue={machine.active ? "sim" : "nao"} key={String(machine.active)} aria-label="Situação" className={`${INPUT} w-auto`}>
                  <option value="sim">Em uso</option>
                  <option value="nao">Fora de uso</option>
                </select>
                <button type="submit" name="what" value="salvar" className={SECONDARY}>
                  Salvar
                </button>
                <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={machineAction} className={`${CARD} mt-3 flex flex-wrap items-end gap-2 p-3`}>
          <div className="min-w-40 flex-1">
            <label htmlFor="nova-maquina" className={LABEL}>
              Nova máquina ou posto de trabalho
            </label>
            <input id="nova-maquina" name="name" type="text" placeholder="Ex.: Serra 1" autoComplete="off" className={INPUT} />
          </div>
          <button type="submit" name="what" value="salvar" className={PRIMARY}>
            Adicionar
          </button>
        </ActionForm>
      </>
    );
  }
}

import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, INPUT, LABEL, Pager, PageHeader, pageOf, Pill, PRIMARY, QUIET_LINK, SECONDARY } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { CAMPAIGN_AUDIENCES, CAMPAIGN_STATUS, listCampaigns, loadMarketingSettings, sentLastDay } from "@/lib/db/campaigns";
import type { CampaignStatus } from "@/lib/db/campaigns";
import { listOptouts } from "@/lib/db/optout";
import { tenantDb } from "@/lib/db/pool";
import { showDate } from "@/lib/format";
import { ROWS_COOKIE, rowsPerPage } from "@/lib/rows";
import { ActionForm } from "../../pedidos/ActionForm";
import { ConfirmButton } from "../../pedidos/ConfirmButton";
import { marketingLimitAction, optoutAction } from "../marketing-actions";

export const metadata = { title: "Campanhas · ERP" };
export const dynamic = "force-dynamic";

const HERE = "/funil/campanhas";
const TONE: Record<CampaignStatus, "good" | "warn" | "bad" | "neutral"> = { rascunho: "neutral", enviando: "warn", concluida: "good", cancelada: "bad" };
const TABS = [["campanhas", "Campanhas"], ["descadastros", "Quem saiu"], ["limite", "Limite"]] as const;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function CampanhasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("funil", HERE);
  if (!seesAllOrders(session)) notFound();
  const conn = tenantDb(session.tenant.slug);
  const query = await searchParams;
  const tab = TABS.find(([key]) => key === first(query.ver))?.[0] ?? "campanhas";
  const size = rowsPerPage((await cookies()).get(ROWS_COOKIE)?.value);
  const hrefOf = (page: number) => `${HERE}?ver=${tab}${page > 1 ? `&pagina=${page}` : ""}`;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href={menuItem("funil").href} className={QUIET_LINK}>
          ← {menuItem("funil").label}
        </Link>
      </p>
      <PageHeader
        title="Campanhas"
        hint="E-mail para um público da sua base, com link para a pessoa sair quando quiser."
        actions={
          <>
            <Link href="/funil/captura" className={SECONDARY}>
              Formulários
            </Link>
            <Link href={`${HERE}/nova`} className={PRIMARY}>
              + Campanha
            </Link>
          </>
        }
      />
      <nav aria-label="Partes das campanhas" className="mt-2 flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`${HERE}?ver=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={`inline-flex min-h-[var(--control)] items-center border-b-2 px-3 text-sm font-medium ${key === tab ? "border-brand text-brand" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "campanhas" && <Campaigns />}
      {tab === "descadastros" && <Optouts />}
      {tab === "limite" && <Limit />}
    </div>
  );

  async function Campaigns() {
    const slice = pageOf(await listCampaigns(conn), first(query.pagina), size);
    if (slice.total === 0) {
      return (
        <p className={`${CARD} mt-3 p-4 text-sm text-slate-700`}>
          Nenhuma campanha ainda.{" "}
          <Link href={`${HERE}/nova`} className={QUIET_LINK}>
            Criar a primeira
          </Link>
          .
        </p>
      );
    }
    return (
      <>
        <ul className="mt-3 flex flex-col gap-2">
          {slice.rows.map((campaign) => (
            <li key={campaign.id}>
              <Link href={`${HERE}/${campaign.id}`} className="flex min-h-[var(--control)] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-brand">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold leading-snug">{campaign.name}</span>
                  <span className="block truncate text-sm text-slate-600">
                    {CAMPAIGN_AUDIENCES[campaign.audience]}
                    {campaign.uf ? ` · ${campaign.uf}` : ""}
                    {campaign.status === "rascunho" ? ` · criada em ${showDate(campaign.createdAt)}` : ` · ${campaign.sent} de ${campaign.sent + campaign.queued + campaign.failed + campaign.skipped} enviados`}
                  </span>
                </span>
                <Pill tone={TONE[campaign.status]}>{CAMPAIGN_STATUS[campaign.status]}</Pill>
              </Link>
            </li>
          ))}
        </ul>
        <Pager {...slice} noun={["campanha", "campanhas"]} hrefFor={hrefOf} />
      </>
    );
  }

  async function Optouts() {
    const slice = pageOf(await listOptouts(conn), first(query.pagina), size);
    return (
      <>
        <p className="mt-3 text-sm text-slate-700">Estes e-mails não recebem campanha nem cadência. Só tire alguém daqui se a própria pessoa pedir para voltar a receber.</p>
        <ActionForm action={optoutAction} className={`${CARD} mt-2 flex flex-wrap items-end gap-2 p-3`}>
          <div className="min-w-0 flex-1">
            <label htmlFor="email" className={LABEL}>
              Incluir um e-mail, a pedido da pessoa
            </label>
            <input id="email" name="email" type="email" inputMode="email" autoComplete="off" className={INPUT} />
          </div>
          <button type="submit" className={SECONDARY}>
            Adicionar
          </button>
        </ActionForm>
        <ul className="mt-2 flex flex-col gap-2">
          {slice.rows.map((optout) => (
            <li key={optout.email} className={`${CARD} flex items-center gap-2 px-3 py-2`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{optout.email}</span>
                <span className="block text-sm text-slate-600">
                  {optout.origin === "descadastro" ? "Saiu pelo link do e-mail" : `Incluído por ${optout.createdBy}`} · {showDate(optout.createdAt)}
                </span>
              </span>
              <ActionForm action={optoutAction}>
                <input type="hidden" name="remove" value={optout.email} />
                <ConfirmButton label="Remover" confirmLabel="Confirmar: volta a receber" className="inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50" />
              </ActionForm>
            </li>
          ))}
        </ul>
        {slice.total === 0 ? <p className="mt-2 text-sm text-slate-600">Ninguém pediu para sair.</p> : <Pager {...slice} noun={["e-mail", "e-mails"]} hrefFor={hrefOf} />}
      </>
    );
  }

  async function Limit() {
    const settings = await loadMarketingSettings(conn);
    const sent = await sentLastDay(new Date(), conn);
    return (
      <ActionForm action={marketingLimitAction} className={`${CARD} mt-3 p-3`}>
        <label htmlFor="dailyLimit" className={LABEL}>
          Quantos e-mails de campanha saem por dia
        </label>
        <input id="dailyLimit" name="dailyLimit" type="text" inputMode="numeric" defaultValue={settings.dailyLimit} key={settings.dailyLimit} autoComplete="off" className={`${INPUT} max-w-40 text-right`} />
        <p className="mt-2 text-sm text-slate-600">
          Nas últimas 24 horas saíram {sent}. Uma caixa de e-mail comum bloqueia quem envia demais de uma vez: o que passar do limite fica na fila e sai no dia seguinte.
        </p>
        <button type="submit" className={`${PRIMARY} mt-3`}>
          Salvar
        </button>
      </ActionForm>
    );
  }
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, PageHeader, Pill, PRIMARY, QUIET_LINK, SECONDARY, SECTION_TITLE } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { CAMPAIGN_AUDIENCES, CAMPAIGN_STATUS, countAudience, getCampaign, listCampaignFailures } from "@/lib/db/campaigns";
import { tenantDb } from "@/lib/db/pool";
import { showDateTime } from "@/lib/format";
import { ActionForm } from "../../../pedidos/ActionForm";
import { ConfirmButton } from "../../../pedidos/ConfirmButton";
import { campaignAction, saveCampaignAction } from "../../marketing-actions";
import { CampaignFields } from "../CampaignFields";

export const metadata = { title: "Campanha · ERP" };
export const dynamic = "force-dynamic";

const TONE = { rascunho: "neutral", enviando: "warn", concluida: "good", cancelada: "bad" } as const;
const DANGER = "inline-flex min-h-[var(--control)] items-center rounded-lg px-2 text-sm text-red-700 hover:bg-red-50";

export default async function CampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission("funil", "/funil/campanhas");
  if (!seesAllOrders(session)) notFound();
  const conn = tenantDb(session.tenant.slug);
  const { id } = await params;
  const campaign = /^[1-9]\d{0,8}$/.test(id) ? await getCampaign(Number(id), conn) : null;
  if (!campaign) notFound();
  const draft = campaign.status === "rascunho";
  const reach = draft ? await countAudience(campaign.audience, campaign.uf, conn) : 0;
  const failures = draft ? [] : await listCampaignFailures(campaign.id, conn);
  const total = campaign.sent + campaign.queued + campaign.failed + campaign.skipped;
  const hidden = <input type="hidden" name="id" value={campaign.id} />;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm">
        <Link href="/funil/campanhas" className={QUIET_LINK}>
          ← Campanhas
        </Link>
      </p>
      <PageHeader
        title={campaign.name}
        hint={
          <>
            {CAMPAIGN_AUDIENCES[campaign.audience]}
            {campaign.uf ? ` · ${campaign.uf}` : ""} <Pill tone={TONE[campaign.status]}>{CAMPAIGN_STATUS[campaign.status]}</Pill>
          </>
        }
      />

      {draft ? (
        <>
          <ActionForm action={saveCampaignAction} className={`${CARD} mt-3 p-3`}>
            <CampaignFields saved={campaign} />
            <button type="submit" className={`${SECONDARY} mt-3`}>
              Salvar
            </button>
          </ActionForm>
          <section className={`${CARD} mt-3 p-3`}>
            <h2 className={SECTION_TITLE}>Enviar</h2>
            <p className="mt-1 text-sm text-slate-700">
              {reach === 0
                ? "Ninguém deste público tem e-mail para receber. Salve com outro público ou complete os cadastros."
                : `Com o que está gravado, ${reach} ${reach === 1 ? "pessoa recebe" : "pessoas recebem"}. Quem pediu para sair e quem não tem e-mail ficam de fora.`}
            </p>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <ActionForm action={campaignAction}>
                {hidden}
                <button type="submit" name="what" value="testar" className={SECONDARY}>
                  Enviar teste para mim
                </button>
              </ActionForm>
              {reach > 0 && (
                <ActionForm action={campaignAction}>
                  {hidden}
                  <input type="hidden" name="what" value="enviar" />
                  <ConfirmButton label="Enviar campanha" confirmLabel={`Confirmar: enviar para ${reach}`} className={PRIMARY} />
                </ActionForm>
              )}
              <ActionForm action={campaignAction}>
                {hidden}
                <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className={DANGER} />
              </ActionForm>
            </div>
          </section>
        </>
      ) : (
        <>
          <section aria-label="Andamento" className={`${CARD} mt-3 p-3`}>
            <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              {[["Enviados", campaign.sent], ["Na fila", campaign.queued], ["Não saíram", campaign.failed], ["Pulados", campaign.skipped]].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {value} <span className="text-sm font-normal text-slate-500">de {total}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-slate-600">
              Iniciada em {campaign.startedAt ? showDateTime(campaign.startedAt) : "—"} por {campaign.startedBy ?? "—"}
              {campaign.finishedAt ? ` · encerrada em ${showDateTime(campaign.finishedAt)}` : " · os e-mails saem aos poucos, dentro do limite do dia"}.
            </p>
            {campaign.status === "enviando" && (
              <ActionForm action={campaignAction} className="mt-3">
                {hidden}
                <input type="hidden" name="what" value="cancelar" />
                <ConfirmButton label="Cancelar envio" confirmLabel="Confirmar: parar de enviar" className={SECONDARY} />
              </ActionForm>
            )}
            {campaign.status === "cancelada" && campaign.sent + campaign.failed === 0 && (
              <ActionForm action={campaignAction} className="mt-3">
                {hidden}
                <ConfirmButton label="Remover" confirmLabel="Confirmar: remover" className={DANGER} />
              </ActionForm>
            )}
          </section>
          <details className={`${CARD} mt-3`}>
            <summary className="flex min-h-[var(--control)] cursor-pointer items-center px-3 font-medium">Mensagem enviada</summary>
            <div className="border-t border-slate-200 p-3 text-sm">
              <p className="font-semibold">{campaign.subject}</p>
              <p className="mt-2 whitespace-pre-line text-slate-700">{campaign.body}</p>
            </div>
          </details>
          {failures.length > 0 && (
            <details className={`${CARD} mt-3`}>
              <summary className="flex min-h-[var(--control)] cursor-pointer items-center px-3 font-medium">Quem não recebeu ({failures.length})</summary>
              <ul className="border-t border-slate-200 p-3 text-sm">
                {failures.map((failure) => (
                  <li key={failure.email} className="py-1">
                    <span className="font-medium">{failure.email}</span> <span className="text-slate-600">· {failure.detail ?? (failure.status === "pulado" ? "Pulado." : "Não saiu.")}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

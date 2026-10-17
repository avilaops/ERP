import { cookies } from "next/headers";
import Link from "next/link";
import { FitRows } from "@/components/FitRows";
import { CARD, MetricSummary, PageHeader, Pager, Pill, SECONDARY, ViewTabs, pageOf } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { allows, menuItem, seesAllOrders } from "@/lib/auth/permissions";
import { loadFiscalSettings } from "@/lib/db/fiscal";
import { listFiscalOverview } from "@/lib/db/fiscal-overview";
import type { FiscalOrderOverview } from "@/lib/db/fiscal-overview";
import { tenantDb } from "@/lib/db/pool";
import { showDateTime } from "@/lib/format";
import { rowsPerPage } from "@/lib/rows";

export const metadata = { title: `${menuItem("fiscal").label} · ERP` };
export const dynamic = "force-dynamic";

const HERE = menuItem("fiscal").href;
const INVOICE_LABELS = { assinada: "Aguardando resposta", autorizada: "Autorizada", rejeitada: "Rejeitada", denegada: "Denegada", cancelada: "Cancelada" } as const;
const INVOICE_TONES = { assinada: "warn", autorizada: "good", rejeitada: "bad", denegada: "bad", cancelada: "neutral" } as const;
const JOB_LABELS = { emitir_nfe: "Emissão", correcao_nfe: "Carta de correção", cancelamento_nfe: "Cancelamento" } as const;
const STAGES = {
  emitir: { label: "A emitir", tone: "warn" },
  fila: { label: "Na fila", tone: "neutral" },
  revisao: { label: "Revisão manual", tone: "bad" },
  concluido: { label: "Concluído", tone: "good" },
} as const;

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const environment = (value: "homologacao" | "producao") => value === "homologacao" ? "Homologação" : "Produção";
const range = (firstNumber: number, lastNumber: number) => firstNumber === lastNumber ? String(firstNumber) : `${firstNumber}–${lastNumber}`;

function orderDetail(order: FiscalOrderOverview): string {
  if (order.stage === "emitir") return "Pedido fechado, pronto para conferir e emitir a NF-e.";
  if (order.jobKind && (order.jobStatus === "pendente" || order.jobStatus === "processando" || order.jobStatus === "revisao_manual")) {
    const label = JOB_LABELS[order.jobKind];
    if (order.jobStatus === "revisao_manual") return `${label} interrompida após ${order.jobAttempts} tentativa(s). Confira a nota e a SEFAZ antes de repetir.`;
    return `${label} ${order.jobStatus === "processando" ? "em processamento" : "aguardando processamento"} · tentativa ${order.jobAttempts}.`;
  }
  if (order.invoiceStatus === "rejeitada") return `NF-e ${order.invoiceNumber ?? ""} rejeitada. Corrija a preparação antes de emitir novamente.`;
  if (order.invoiceStatus === "assinada") return `NF-e ${order.invoiceNumber ?? ""} assinada sem veredito gravado. Confira a situação na SEFAZ.`;
  return "Confira a situação fiscal deste pedido.";
}

export default async function FiscalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("fiscal");
  const conn = tenantDb(session.tenant.slug);
  const [settings, query, store] = await Promise.all([loadFiscalSettings(conn), searchParams, cookies()]);
  const overview = await listFiscalOverview({ sellerEmail: seesAllOrders(session) ? null : session.email, environment: settings.environment }, conn);
  const asked = first(query.ver);
  const tab = asked === "notas" || asked === "inutilizacoes" ? asked : "pendencias";
  const size = rowsPerPage(store.get("erp_fiscal_linhas")?.value, 1);
  const page = first(query.pagina);
  const stageOrder = { revisao: 0, fila: 1, emitir: 2, concluido: 3 } as const;
  const pending = overview.orders.filter((order) => order.stage !== "concluido").sort((a, b) => stageOrder[a.stage] - stageOrder[b.stage] || b.closedAt.getTime() - a.closedAt.getTime());
  const pendingSlice = pageOf(pending, page, size);
  const invoiceSlice = pageOf(overview.invoices, page, size);
  const openVoidJobs = overview.voidJobs.filter((job) => job.status !== "concluido");
  const voidRows = [
    ...openVoidJobs.map((item) => ({ kind: "job" as const, item })),
    ...overview.voids.map((item) => ({ kind: "record" as const, item })),
  ];
  const voidSlice = pageOf(voidRows, page, size);
  const review = pending.filter((order) => order.stage === "revisao").length + openVoidJobs.filter((job) => job.status === "revisao_manual").length;

  return (
    <>
      <PageHeader
        title="Fiscal"
        actions={allows(session, "parametros") ? <Link href="/parametros/fiscal" className={SECONDARY}>Configurações fiscais</Link> : undefined}
      />
      <MetricSummary items={[
        { label: "A emitir", value: String(pending.filter((order) => order.stage === "emitir").length), note: "pedidos fechados" },
        { label: "Em fila", value: String(pending.filter((order) => order.stage === "fila").length), note: "emissões e eventos" },
        { label: "Revisão", value: String(review), note: "exige conferência", attention: review > 0 },
        { label: "Notas", value: String(overview.invoices.length), note: "histórico registrado" },
      ]} />
      <ViewTabs label="Partes do Fiscal" items={[
        { href: HERE, label: `Pendências (${pending.length})`, current: tab === "pendencias" },
        { href: `${HERE}?ver=notas`, label: `Notas (${overview.invoices.length})`, current: tab === "notas" },
        { href: `${HERE}?ver=inutilizacoes`, label: `Inutilizações (${openVoidJobs.length + overview.voids.length})`, current: tab === "inutilizacoes" },
      ]} />

      {tab === "pendencias" && (
        <section className={`${CARD} mt-3`} aria-label="Próximo trabalho">
          {pendingSlice.rows.length === 0 ? (
            <p className="p-4 text-sm text-slate-600">Nenhum pedido aguardando ação fiscal.</p>
          ) : (
            <ul id="fiscal-list" className="divide-y divide-slate-200">
              {pendingSlice.rows.map((order) => (
                <li data-row key={order.orderId} className="p-4">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                    <div className="min-w-0">
                      <Link href={`/pedidos/${order.orderNumber}?ver=documentos#nota-fiscal`} className="font-semibold text-brand underline">{order.customerName}</Link>
                      <p className="break-words text-xs text-slate-600">Pedido #{order.orderNumber} · fechado em {showDateTime(order.closedAt)}</p>
                    </div>
                    <Pill tone={STAGES[order.stage].tone}>{STAGES[order.stage].label}</Pill>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{orderDetail(order)}</p>
                  {order.jobError && <p className="mt-1 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900">{order.jobError}</p>}
                  <Link href={`/pedidos/${order.orderNumber}?ver=documentos#nota-fiscal`} className={`${SECONDARY} mt-2`}>Abrir nota no pedido</Link>
                </li>
              ))}
            </ul>
          )}
          <Pager {...pendingSlice} noun={["pendência", "pendências"]} hrefFor={(number) => `${HERE}${number > 1 ? `?pagina=${number}` : ""}`} />
        </section>
      )}

      {tab === "notas" && (
        <section className={`${CARD} mt-3`} aria-labelledby="fiscal-notas">
          <h2 id="fiscal-notas" className="border-b border-slate-200 px-4 py-3 text-sm font-semibold uppercase tracking-wide">Notas fiscais</h2>
          {invoiceSlice.rows.length === 0 ? (
            <p className="p-4 text-sm text-slate-600">Nenhuma nota fiscal registrada.</p>
          ) : (
            <ul id="fiscal-list" className="divide-y divide-slate-200">
              {invoiceSlice.rows.map((invoice) => (
                <li data-row key={invoice.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/pedidos/${invoice.orderNumber}?ver=documentos#nota-fiscal`} className="font-semibold text-brand underline">NF-e {invoice.number} · série {invoice.series}</Link>
                      <p className="break-words text-sm">{invoice.customerName} · pedido #{invoice.orderNumber}</p>
                    </div>
                    <Pill tone={INVOICE_TONES[invoice.status]}>{INVOICE_LABELS[invoice.status]}</Pill>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{environment(invoice.environment)} · {showDateTime(invoice.issuedAt)}{invoice.protocol ? ` · protocolo ${invoice.protocol}` : ""}</p>
                  <p className="mt-1 break-all text-xs text-slate-600">Chave {invoice.accessKey}</p>
                  {invoice.statusReason && <p className="mt-1 text-sm text-red-900">{invoice.statusCode ? `${invoice.statusCode}: ` : ""}{invoice.statusReason}</p>}
                  <p className="mt-2 text-xs text-slate-600">{invoice.mail ? `Último e-mail: ${invoice.mail.status === "enviado" ? "enviado" : "falhou"} para ${invoice.mail.recipient} em ${showDateTime(invoice.mail.sentAt)}.` : "Ainda não há envio por e-mail registrado."}</p>
                  <Link href={`/pedidos/${invoice.orderNumber}?ver=documentos#nota-fiscal`} className={`${SECONDARY} mt-2`}>Abrir nota no pedido</Link>
                </li>
              ))}
            </ul>
          )}
          <Pager {...invoiceSlice} noun={["nota", "notas"]} hrefFor={(number) => `${HERE}?ver=notas${number > 1 ? `&pagina=${number}` : ""}`} />
        </section>
      )}

      {tab === "inutilizacoes" && (
        <section className={`${CARD} mt-3`} aria-labelledby="fiscal-inutilizacoes">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <h2 id="fiscal-inutilizacoes" className="text-sm font-semibold uppercase tracking-wide">Inutilizações</h2>
            {allows(session, "parametros") && <Link href="/parametros/fiscal?ver=numeracao#inutilizar" className={SECONDARY}>Solicitar inutilização</Link>}
          </div>
          {voidSlice.rows.length === 0 ? (
            <p className="p-4 text-sm text-slate-600">Nenhuma inutilização registrada ou aguardando processamento.</p>
          ) : (
            <ul id="fiscal-list" className="divide-y divide-slate-200">
              {voidSlice.rows.map(({ kind, item }) => kind === "job" ? (
                <li data-row key={`job-${item.id}`} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Série {item.series} · números {range(item.first, item.last)}</p>
                      <p className="text-xs text-slate-600">{environment(item.environment)} · solicitada em {showDateTime(item.createdAt)} · tentativa {item.attempts}</p>
                    </div>
                    <Pill tone={item.status === "revisao_manual" ? "bad" : "neutral"}>{item.status === "revisao_manual" ? "Revisão manual" : item.status === "processando" ? "Processando" : "Na fila"}</Pill>
                  </div>
                  {item.lastError && <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{item.lastError}</p>}
                  {item.status === "revisao_manual" && <p className="mt-2 text-sm text-slate-700">Confira a faixa na SEFAZ. Uma inutilização de resultado incerto não é retransmitida automaticamente.</p>}
                </li>
              ) : (
                <li data-row key={`record-${item.id}`} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">Série {item.series} · números {range(item.first, item.last)}</p>
                      <p className="text-xs text-slate-600">{environment(item.environment)} · {showDateTime(item.createdAt)} · por {item.createdBy}</p>
                    </div>
                    <Pill tone="good">Concluída</Pill>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{item.reason}</p>
                  <p className="mt-1 break-all text-xs text-slate-600">Protocolo {item.protocol}</p>
                </li>
              ))}
            </ul>
          )}
          <Pager {...voidSlice} noun={["inutilização", "inutilizações"]} hrefFor={(number) => `${HERE}?ver=inutilizacoes${number > 1 ? `&pagina=${number}` : ""}`} />
        </section>
      )}
      <FitRows listId="fiscal-list" shown={size} minimum={1} cookieName="erp_fiscal_linhas" />
    </>
  );
}

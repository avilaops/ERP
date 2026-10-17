import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { CARD, INPUT, LABEL, PRIMARY, SECONDARY, PageHeader } from "@/components/ui";
import { loadFiscalSettings } from "@/lib/db/fiscal";
import { listOrderInvoices } from "@/lib/db/invoices";
import { loadOrderFiscalRules } from "@/lib/db/order-fiscal-rules";
import { getOrder } from "@/lib/db/orders";
import { loadPublishedTable } from "@/lib/db/price-table";
import { tenantDb } from "@/lib/db/pool";
import { CONTRIBUTION_OTHER_CSTS, CONTRIBUTION_RATE_CSTS, CONTRIBUTION_UNTAXED_CSTS, IPI_TAXED_CSTS, IPI_UNTAXED_CSTS } from "@/lib/fiscal/nfe";
import { NOTE_RULE_STEPS } from "@/lib/fiscal/rules-form";
import { formatPercent } from "@/lib/format";
import { ORDER_NUMBER } from "@/lib/order-number";
import { ActionForm } from "../../ActionForm";
import { ConfirmButton } from "../../ConfirmButton";
import { saveNoteRulesAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preparar nota fiscal · ERP" };

export default async function NoteRulesPage({ params, searchParams }: {
  params: Promise<{ numero: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("fiscal");
  const conn = tenantDb(session.tenant.slug);
  const { numero } = await params;
  if (!ORDER_NUMBER.test(numero)) notFound();
  const order = await getOrder(numero, { sellerEmail: null }, conn);
  if (!order || order.status !== "fechado") notFound();
  const table = await loadPublishedTable(order.priceTableVersion, conn);
  if (!table) notFound();
  const settings = await loadFiscalSettings(conn);
  const draft = await loadOrderFiscalRules(order.id, table.lineId, conn);
  const invoices = await listOrderInvoices(order.id, conn);
  const locked = invoices.some((invoice) => invoice.environment === settings.environment && ["assinada", "autorizada", "denegada"].includes(invoice.status));
  const query = await searchParams;
  const asked = typeof query.etapa === "string" ? Number(query.etapa) : 0;
  const step = Number.isInteger(asked) && NOTE_RULE_STEPS[asked] ? asked : 0;
  const group = NOTE_RULE_STEPS[step];
  const back = `/pedidos/${numero}?ver=documentos#nota-fiscal`;
  const options = (key: string) => key === "icmsCode" ? (settings.taxRegime === 1 ? ["102", "103", "300", "400"] : ["00", "40", "41", "50"])
    : key === "ipiCst" ? [...IPI_TAXED_CSTS, ...IPI_UNTAXED_CSTS].sort()
    : [...CONTRIBUTION_RATE_CSTS, ...CONTRIBUTION_UNTAXED_CSTS, ...CONTRIBUTION_OTHER_CSTS];

  return <>
    <PageHeader title="Regras desta nota" hint={`Pedido #${numero} · ${draft.customized ? "personalizado" : "padrão da empresa"}`} />
    {locked ? <section className={`${CARD} mt-3 p-4`}>
      <p>A nota já foi assinada, autorizada ou denegada. Esta preparação não pode mudar.</p>
      <Link href={back} className={`${SECONDARY} mt-3`}>Voltar ao pedido</Link>
    </section> : <>
      <ActionForm key={`${step}:${draft.revision}`} action={saveNoteRulesAction} className={`${CARD} mt-3 p-4`}>
        <input type="hidden" name="number" value={numero} />
        <input type="hidden" name="revision" value={draft.revision} />
        <input type="hidden" name="step" value={step} />
        <h2 className="text-sm font-semibold">{step + 1} de {NOTE_RULE_STEPS.length} · {group.title}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {step === 0 && <div>
            <label htmlFor="operation" className={LABEL}>Tipo da operação</label>
            <select id="operation" name="operation" defaultValue="manual" className={INPUT}>
              <option value="manual">Personalizada / manter preenchimento</option>
              <option value="revenda">Revenda de mercadoria de terceiros</option>
              <option value="producao">Venda de produção própria</option>
            </select>
          </div>}
          {group.fields.map(({ key, label, kind }) => {
            const value = draft.rules[key];
            const codes = kind === "code" ? options(key) : [];
            const text = kind === "percent" ? formatPercent(Number(value)) : String(value ?? "");
            if (kind === "boolean") return <label key={key} className="flex min-h-[var(--control)] items-center gap-3 text-sm sm:col-span-2">
              <input type="checkbox" name={key} defaultChecked={value === true} value="sim" />{label}
            </label>;
            return <div key={key} className={kind === "textarea" ? "sm:col-span-2" : ""}>
              <label htmlFor={key} className={LABEL}>{label}</label>
              {kind === "code" ? <select id={key} name={key} defaultValue={text} className={INPUT}>
                <option value="">— preencher —</option>
                {text && !codes.includes(text) && <option value={text}>{text} (cadastrado)</option>}
                {codes.map((code) => <option key={code} value={code}>{code}</option>)}
              </select> : kind === "textarea" ? <textarea id={key} name={key} defaultValue={text} rows={3} maxLength={2000} className={`${INPUT} py-2`} />
                : <input id={key} name={key} defaultValue={text} inputMode={kind === "percent" ? "decimal" : "text"} autoComplete="off" className={INPUT} />}
            </div>;
          })}
        </div>
        {step === 0 && <p className="mt-2 text-xs text-slate-600">Revenda ou produção própria preenchem natureza e CFOPs desta nota ao salvar.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" name="intent" value="next" className={`${PRIMARY} flex-1`}>{step === NOTE_RULE_STEPS.length - 1 ? "Salvar e conferir" : "Salvar e continuar"}</button>
          {step > 0 && <button type="submit" name="intent" value="back" className={SECONDARY}>Voltar</button>}
        </div>
      </ActionForm>
      <details className={`${CARD} mt-3`}>
        <summary className="disclosure-heading">Outras opções<span className="disclosure-marker" aria-hidden="true">+</span></summary>
        <div className="grid gap-3 border-t border-slate-200 p-4">
          <p className="text-sm text-slate-600">As alterações valem só para esta nota. ICMS e IPI mantêm as alíquotas do pedido.</p>
          <Link href={back} className={SECONDARY}>Voltar ao pedido</Link>
          {draft.customized && <ActionForm action={saveNoteRulesAction}>
            <input type="hidden" name="number" value={numero} />
            <input type="hidden" name="revision" value={draft.revision} />
            <input type="hidden" name="intent" value="reset" />
            <ConfirmButton label="Usar padrão da empresa" confirmLabel="Confirmar: remover personalização" className={SECONDARY} />
          </ActionForm>}
        </div>
      </details>
    </>}
  </>;
}

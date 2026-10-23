import Link from "next/link";
import { notFound } from "next/navigation";
import { CARD, INPUT, PageHeader, Pill, PRIMARY, SECONDARY, ViewTabs } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { getReceivedNfe, receivedNfeXml } from "@/lib/db/received-nfes";
import { tenantDb } from "@/lib/db/pool";
import { showDateTime, showMoney } from "@/lib/format";
import { listSuppliers } from "@/lib/db/suppliers";
import { formatCep, formatDocument } from "@/lib/customer";
import { danfeData } from "@/lib/fiscal/danfe";
import { confirmReceivedPurchaseAction, createReceivedSupplierAction, linkReceivedSupplierAction } from "../../actions";
import { queueRecipientManifestationAction } from "../../actions";
import { listRecipientManifestations } from "@/lib/db/recipient-manifestations";

export const metadata = { title: "NF-e recebida · ERP" };
export const dynamic = "force-dynamic";

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ReceivedNfePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePermission("fiscal");
  const conn = tenantDb(session.tenant.slug);
  const id = Number((await params).id);
  const [note, document, suppliers, query, manifestations] = await Promise.all([getReceivedNfe(id, conn), receivedNfeXml(id, conn), listSuppliers(conn), searchParams, listRecipientManifestations(id, conn)]);
  if (!note) notFound();
  if (!document) notFound();
  const fiscal = danfeData(document.xml);
  const asked = first(query.etapa);
  const step = asked === "manifestacao" || asked === "fornecedor" || asked === "produtos" || asked === "compra" ? asked : "documento";
  const exactSuppliers = suppliers.filter((supplier) => supplier.kind === "PJ" && supplier.document === note.issuerDocument);
  const allLinked = note.items.every((item) => item.productId !== null);
  return <>
    <PageHeader title={`NF-e ${note.number}`} hint={`${note.issuerName} · série ${note.series}`} actions={<Link href="/fiscal?ver=recebidas" className={SECONDARY}>Voltar às recebidas</Link>} />
    <ViewTabs label="Etapas da entrada" items={[
      { href: `/fiscal/recebidas/${note.id}?etapa=documento`, label: "Documento", current: step === "documento" },
      { href: `/fiscal/recebidas/${note.id}?etapa=manifestacao`, label: "Manifestação", current: step === "manifestacao" },
      { href: `/fiscal/recebidas/${note.id}?etapa=fornecedor`, label: "Fornecedor", current: step === "fornecedor" },
      { href: `/fiscal/recebidas/${note.id}?etapa=produtos`, label: "Produtos", current: step === "produtos" },
      { href: `/fiscal/recebidas/${note.id}?etapa=compra`, label: "Compra", current: step === "compra" },
    ]} />
    {step === "documento" && <>
    <section className={`${CARD} mt-3 p-4`} aria-label="Identificação da nota">
      {first(query.erro) && <p className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{first(query.erro)}</p>}
      {first(query.aviso) && <p className="mb-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{first(query.aviso)}</p>}
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{note.issuerName}</p><p className="text-sm text-slate-600">CNPJ {note.issuerDocument} · emitida em {showDateTime(note.issuedAt)}</p></div><Pill tone={note.purchaseId ? "good" : "warn"}>{note.purchaseId ? "Compra vinculada" : "Aguardando conferência"}</Pill></div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-slate-600">Valor da nota</dt><dd className="font-semibold">{showMoney(note.totalInvoice)}</dd></div><div><dt className="text-slate-600">Produtos</dt><dd>{showMoney(note.totalProducts)}</dd></div><div><dt className="text-slate-600">Frete</dt><dd>{showMoney(note.totalFreight)}</dd></div><div><dt className="text-slate-600">Seguro</dt><dd>{showMoney(note.totalInsurance)}</dd></div><div><dt className="text-slate-600">Outras despesas</dt><dd>{showMoney(note.totalOther)}</dd></div><div><dt className="text-slate-600">Desconto</dt><dd>{showMoney(note.totalDiscount)}</dd></div></dl>
      <p className="mt-3 break-all text-xs text-slate-600">Chave {note.accessKey} · protocolo {note.protocol}</p>
      <div className="mt-3 flex flex-wrap gap-2"><a href={`/api/fiscal/recebidas/${note.id}/xml`} className={SECONDARY}>Baixar XML completo</a><a href={`/api/fiscal/recebidas/${note.id}/danfe`} className={SECONDARY}>Abrir DANFE</a></div>
    </section>
    </>}
    {step === "manifestacao" && <section className={`${CARD} mt-3 p-4`} aria-labelledby="manifestacao-da-nota">
      <h2 id="manifestacao-da-nota" className="text-sm font-semibold uppercase tracking-wide">Manifestação do destinatário</h2>
      <p className="mt-1 text-sm text-slate-600">A manifestação tem efeito fiscal e nunca é enviada automaticamente. Marque a confirmação no evento escolhido.</p>
      {manifestations.length > 0 && <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200 text-sm">{manifestations.map((item) => <li key={item.id} className="py-2"><span className="font-medium">{item.kind.replaceAll("_", " ")}</span> · {item.status === "registered" ? `registrada, protocolo ${item.protocol}` : item.status === "manual_review" ? `revisão manual: ${item.lastError}` : "aguardando processamento"}</li>)}</ul>}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {([ ["ciencia", "Ciência da operação"], ["confirmacao", "Confirmar operação"], ["desconhecimento", "Desconhecer operação"] ] as const).map(([kind, label]) => <form action={queueRecipientManifestationAction} key={kind} className="rounded border border-slate-200 p-3"><input type="hidden" name="nfeId" value={note.id} /><input type="hidden" name="kind" value={kind} /><label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="confirm" value="yes" required /><span>Entendo o efeito fiscal de “{label}”.</span></label><button className={`${SECONDARY} mt-2`} type="submit">{label}</button></form>)}
        <form action={queueRecipientManifestationAction} className="rounded border border-slate-200 p-3"><input type="hidden" name="nfeId" value={note.id} /><input type="hidden" name="kind" value="nao_realizada" /><label className="text-sm font-medium">Operação não realizada<textarea className={`${INPUT} mt-1 min-h-20`} name="reason" minLength={15} maxLength={255} required /></label><label className="mt-2 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" name="confirm" value="yes" required /><span>Confirmo o envio desta justificativa à SEFAZ.</span></label><button className={`${SECONDARY} mt-2`} type="submit">Informar operação não realizada</button></form>
      </div>
    </section>}
    {step === "documento" && <section className={`${CARD} mt-3 p-4`} aria-labelledby="dados-completos-da-nota">
      <h2 id="dados-completos-da-nota" className="text-sm font-semibold uppercase tracking-wide">Informações fiscais completas</h2>
      <p className="mt-1 text-xs text-slate-600">Dados lidos do XML autorizado. O arquivo original permanece disponível acima.</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {[{ label: "Emitente", party: fiscal.issuer }, { label: "Destinatário", party: fiscal.recipient }].map(({ label, party }) => <div key={label} className="rounded border border-slate-200 p-3"><h3 className="font-semibold">{label}</h3><p className="mt-1 text-sm">{party.name}</p><p className="text-sm text-slate-600">{formatDocument(party.document)}{party.registration ? ` · IE ${party.registration}` : ""}</p><p className="mt-1 text-sm text-slate-600">{party.street}{party.district ? ` · ${party.district}` : ""}</p><p className="text-sm text-slate-600">{party.city}{party.uf ? `/${party.uf}` : ""}{party.cep ? ` · CEP ${formatCep(party.cep)}` : ""}</p></div>)}
      </div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-slate-600">Base ICMS</dt><dd>{showMoney(fiscal.totals.icmsBase)}</dd></div><div><dt className="text-slate-600">ICMS</dt><dd>{showMoney(fiscal.totals.icms)}</dd></div><div><dt className="text-slate-600">ICMS ST</dt><dd>{showMoney(fiscal.totals.icmsSt)}</dd></div><div><dt className="text-slate-600">IPI</dt><dd>{showMoney(fiscal.totals.ipi)}</dd></div><div><dt className="text-slate-600">II</dt><dd>{showMoney(fiscal.totals.importTax)}</dd></div><div><dt className="text-slate-600">PIS</dt><dd>{showMoney(fiscal.totals.pis)}</dd></div><div><dt className="text-slate-600">COFINS</dt><dd>{showMoney(fiscal.totals.cofins)}</dd></div><div><dt className="text-slate-600">FCP</dt><dd>{showMoney(fiscal.totals.fcp)}</dd></div><div><dt className="text-slate-600">DIFAL</dt><dd>{showMoney(fiscal.totals.difal)}</dd></div><div><dt className="text-slate-600">IBS</dt><dd>{showMoney(fiscal.totals.ibs)}</dd></div><div><dt className="text-slate-600">CBS</dt><dd>{showMoney(fiscal.totals.cbs)}</dd></div><div><dt className="text-slate-600">Natureza</dt><dd>{fiscal.nature || "Não informada"}</dd></div>
      </dl>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div><h3 className="font-semibold">Transporte</h3><p className="mt-1 text-sm text-slate-600">{fiscal.carrier ? `${fiscal.carrier.name} · ${formatDocument(fiscal.carrier.document)}` : "Sem transportadora informada."}</p><p className="text-sm text-slate-600">{fiscal.volumes.quantity ? `${fiscal.volumes.quantity} ${fiscal.volumes.kind || "volume(s)"}` : "Volumes não informados"}{fiscal.volumes.grossWeight ? ` · peso bruto ${fiscal.volumes.grossWeight} kg` : ""}{fiscal.volumes.netWeight ? ` · peso líquido ${fiscal.volumes.netWeight} kg` : ""}</p></div>
        <div><h3 className="font-semibold">Pagamento</h3>{fiscal.payments.length ? <ul className="mt-1 text-sm text-slate-600">{fiscal.payments.map((payment, index) => <li key={`${payment.code}-${index}`}>Código {payment.code}{payment.description ? ` · ${payment.description}` : ""} · {showMoney(payment.amount)}</li>)}</ul> : <p className="mt-1 text-sm text-slate-600">Sem detalhamento de pagamento no XML.</p>}</div>
      </div>
      {(fiscal.delivery || fiscal.info || fiscal.model.taxAuthorityInfo) && <div className="mt-4 border-t border-slate-200 pt-3 text-sm"><h3 className="font-semibold">Informações adicionais</h3>{fiscal.delivery && <p className="mt-1 text-slate-600">Entrega: {fiscal.delivery}</p>}{fiscal.info && <p className="mt-1 whitespace-pre-wrap text-slate-600">{fiscal.info}</p>}{fiscal.model.taxAuthorityInfo && <p className="mt-1 whitespace-pre-wrap text-slate-600">Fisco: {fiscal.model.taxAuthorityInfo}</p>}</div>}
    </section>}
    {step === "fornecedor" && <section className={`${CARD} mt-3 p-4`} aria-labelledby="fornecedor-da-nota"><h2 id="fornecedor-da-nota" className="text-sm font-semibold uppercase tracking-wide">Fornecedor</h2>
      {note.supplierId ? <p className="mt-2 text-sm">Fornecedor #{note.supplierId} vinculado pelo CNPJ da nota.</p> : exactSuppliers.length ? <div className="mt-2"><p className="text-sm">Encontramos o fornecedor pelo CNPJ. Confirme o vínculo:</p>{exactSuppliers.map((supplier) => <form action={linkReceivedSupplierAction} key={supplier.id} className="mt-2"><input type="hidden" name="nfeId" value={note.id} /><input type="hidden" name="supplierId" value={supplier.id} /><button className={PRIMARY} type="submit">Vincular {supplier.tradeName ?? supplier.name}</button></form>)}</div> : <form action={createReceivedSupplierAction} className="mt-2"><input type="hidden" name="nfeId" value={note.id} /><p className="text-sm">Este CNPJ ainda não está nos fornecedores. O cadastro usará exatamente a razão social e o CNPJ do XML.</p><button className={`${PRIMARY} mt-2`} type="submit">Cadastrar e vincular fornecedor</button></form>}
    </section>}
    {step === "produtos" && <section className={`${CARD} mt-3`} aria-labelledby="itens-da-nota"><h2 id="itens-da-nota" className="border-b border-slate-200 px-4 py-3 text-sm font-semibold uppercase tracking-wide">Produtos da nota ({note.itemCount})</h2>
      <ul className="divide-y divide-slate-200">{note.items.map((item, index) => { const taxes = fiscal.items[index]; return <li key={item.lineNumber} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{item.description}</p><p className="break-words text-xs text-slate-600">Item {item.lineNumber}{item.supplierCode ? ` · código ${item.supplierCode}` : ""}{item.ean ? ` · GTIN ${item.ean}` : ""} · NCM {item.ncm}{item.cest ? ` · CEST ${item.cest}` : ""} · CFOP {item.cfop}</p></div><p className="whitespace-nowrap font-semibold">{showMoney(item.productValue)}</p></div><p className="mt-1 text-sm text-slate-700">{item.quantity} {item.commercialUnit} × {showMoney(item.unitValue)}{item.discountValue ? ` · desconto ${showMoney(item.discountValue)}` : ""}{item.freightValue ? ` · frete ${showMoney(item.freightValue)}` : ""}{item.insuranceValue ? ` · seguro ${showMoney(item.insuranceValue)}` : ""}{item.otherValue ? ` · outras despesas ${showMoney(item.otherValue)}` : ""}</p>{taxes && <p className="mt-1 text-xs text-slate-600">Tributação {taxes.taxCode || "não informada"} · base ICMS {showMoney(taxes.icmsBase)} · ICMS {showMoney(item.icmsValue)} ({taxes.icmsRate}%) · ICMS ST {showMoney(item.icmsStValue)} · IPI {showMoney(item.ipiValue)} ({taxes.ipiRate}%) · II {showMoney(item.importTaxValue)} · PIS {showMoney(item.pisValue)} · COFINS {showMoney(item.cofinsValue)}</p>}<p className="mt-2 text-xs text-slate-600">{item.productId ? `Vinculado ao produto #${item.productId}.` : "Ainda não vinculado a um produto do estoque."}</p>{!note.purchaseId && <Link href={`/fiscal/recebidas/${note.id}/itens/${item.lineNumber}`} className={`${SECONDARY} mt-2`}>{item.productId ? "Trocar vínculo" : "Vincular produto"}</Link>}</li>; })}</ul>
    </section>}
    {step === "compra" && (!note.purchaseId ? <section className={`${CARD} mt-3 p-4`} aria-labelledby="criar-compra"><h2 id="criar-compra" className="text-sm font-semibold uppercase tracking-wide">Criar compra e salvar custos</h2><p className="mt-1 text-sm text-slate-600">A confirmação cria a compra e o histórico de custos. O estoque só entra quando você marcar a compra como recebida.</p><form action={confirmReceivedPurchaseAction} className="mt-3"><input type="hidden" name="nfeId" value={note.id} /><button className={PRIMARY} type="submit" disabled={!note.supplierId || !allLinked}>Confirmar compra e custos</button></form>{(!note.supplierId || !allLinked) && <p className="mt-2 text-xs text-slate-600">Vincule o fornecedor e todos os produtos para liberar a confirmação.</p>}</section> : <section className={`${CARD} mt-3 p-4`}><p className="text-sm">Esta nota já está vinculada à compra #{note.purchaseId}.</p></section>)}
  </>;
}

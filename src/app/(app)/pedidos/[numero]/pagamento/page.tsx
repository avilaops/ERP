import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { seesAllOrders } from "@/lib/auth/permissions";
import { CARD, INPUT, LABEL, PRIMARY, SECONDARY, PageHeader } from "@/components/ui";
import { DownPaymentFields } from "@/components/DownPaymentFields";
import { getOrder, listPaymentMethods } from "@/lib/db/orders";
import { listOnDeliveryMethods } from "@/lib/db/payment-methods";
import { tenantDb } from "@/lib/db/pool";
import { loadPublishedTable } from "@/lib/db/price-table";
import { saleOf } from "@/lib/order-quote";
import { formatMoney, showMoney } from "@/lib/format";
import { ORDER_NUMBER } from "@/lib/order-number";
import { ActionForm } from "../../ActionForm";
import { savePaymentStepAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pagamento do pedido · ERP" };

export default async function PaymentPage({ params, searchParams }: {
  params: Promise<{ numero: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission("pedidos");
  const conn = tenantDb(session.tenant.slug);
  const { numero } = await params;
  if (!ORDER_NUMBER.test(numero)) notFound();
  const order = await getOrder(numero, { sellerEmail: seesAllOrders(session) ? null : session.email }, conn);
  if (!order) notFound();
  const table = await loadPublishedTable(order.priceTableVersion, conn);
  if (!table) notFound();
  const sale = saleOf(order, table);
  const query = await searchParams;
  const asked = typeof query.etapa === "string" ? Number(query.etapa) : 0;
  const step = Number.isInteger(asked) && asked >= 0 && asked <= 2 ? asked : 0;
  const methods = await listPaymentMethods(conn);
  const legacyTerms = await listOnDeliveryMethods(conn);
  const choices = (used: string | null) => used && !methods.includes(used) && !legacyTerms.includes(used) ? [...methods, used] : methods;
  const titles = ["Entrada", "Saldo", "Parcelas do saldo"];
  const back = `/pedidos/${numero}?ver=pagamento`;
  const methodField = (name: string, label: string, value: string | null) => <div>
    <label htmlFor={name} className={LABEL}>{label}</label>
    <select id={name} name={name} defaultValue={legacyTerms.includes(value ?? "") ? "" : value ?? ""} className={INPUT}>
      <option value="">— escolher —</option>
      {choices(value).map((method) => <option key={method} value={method}>{method}</option>)}
    </select>
  </div>;
  const field = (name: string, label: string, value: string | number | null, type = "text") => <div>
    <label htmlFor={name} className={LABEL}>{label}</label>
    <input id={name} name={name} type={type} defaultValue={value ?? ""} inputMode={type === "date" ? undefined : "decimal"} className={INPUT} />
  </div>;
  return <>
    <PageHeader title="Pagamento do pedido" hint={`#${numero} · entrada de ${showMoney(order.downPayment)}`} />
    {order.status !== "em_negociacao" ? <section className={`${CARD} mt-3 p-4`}>
      <p>Reabra o pedido para alterar o pagamento e recalcular os recebimentos.</p>
      <Link href={back} className={`${SECONDARY} mt-3`}>Voltar ao pedido</Link>
    </section> : <ActionForm key={`${step}:${order.revision}`} action={savePaymentStepAction} className={`${CARD} mt-3 p-4`}>
      <input type="hidden" name="number" value={numero} />
      <input type="hidden" name="revision" value={order.revision} />
      <input type="hidden" name="step" value={step} />
      <h2 className="text-sm font-semibold">{step + 1} de 3 · {titles[step]}</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {step === 0 && <>
          <DownPaymentFields name="downPayment" amount={formatMoney(order.downPayment)} invoiceTotal={sale.invoiceTotal} />
          {methodField("downPaymentMethod", "Meio da entrada", order.downPaymentMethod)}
          {field("downPaymentDate", "Data da entrada", order.downPaymentDate, "date")}
        </>}
        {step === 1 && <>
          <div><label htmlFor="balanceDue" className={LABEL}>Quando pagar o saldo</label>
            <select id="balanceDue" name="balanceDue" defaultValue={order.balanceOnDelivery ? "entrega" : "parcelas"} className={INPUT}>
              <option value="parcelas">Em parcelas / prazo combinado</option>
              <option value="entrega">Na entrega (parcela única)</option>
            </select>
          </div>
          {methodField("balanceMethod", "Meio de pagamento do saldo", order.balanceMethod)}
          <div><label htmlFor="paymentNotes" className={LABEL}>Observações</label>
            <input id="paymentNotes" name="paymentNotes" defaultValue={order.paymentNotes ?? ""} maxLength={2000} className={INPUT} />
          </div>
        </>}
        {step === 2 && <>
          {field("installmentCount", "Número de parcelas", order.installmentCount)}
          {field("firstInstallmentDays", "Primeira em (dias da entrada)", order.firstInstallmentDays)}
          {field("installmentIntervalDays", "Intervalo entre parcelas (dias)", order.installmentIntervalDays)}
        </>}
      </div>
      <p className="mt-2 text-xs text-slate-600">{step === 0 ? "Data vazia: na confirmação do pedido. Salvar recalcula as parcelas." : step === 1 ? "O prazo e o meio são independentes. Para link, escolha também PIX ou cartão na lista." : "A forma escolhida para o saldo vale para estas parcelas."}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" name="intent" value="next" className={`${PRIMARY} flex-1`}>{step === 2 ? "Salvar e conferir" : "Salvar e continuar"}</button>
        {step > 0 && <button type="submit" name="intent" value="back" className={SECONDARY}>Voltar</button>}
        {step === 0 && <Link href={back} className={SECONDARY}>Sair</Link>}
      </div>
    </ActionForm>}
  </>;
}
